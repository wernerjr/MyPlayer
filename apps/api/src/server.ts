import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { mergeProgress, type Me, type ProgressInput } from "@myplayer/shared";
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import { getCatalog, invalidateCatalog, listFolders, MissingScope, resolveFolders } from "./catalog.js";
import { env, oauthReady } from "./env.js";
import { accessToken, authUrl, DRIVE_SCOPE, exchangeCode, Reauth, toUser } from "./google.js";
import {
  MOCK_CLIP,
  MOCK_EMAIL,
  mockCatalog,
  mockFolders,
  mockResolve,
  seedMockProgress,
  seedMockSelection,
} from "./mock.js";
import { db, save, type User } from "./store.js";

const SESSION_COOKIE = "mp_sid";
const STATE_COOKIE = "mp_state";
const SESSION_SECONDS = 30 * 86_400;
const FILE_ID = { type: "object", properties: { videoId: { type: "string", pattern: "^[A-Za-z0-9_-]{6,120}$" } }, required: ["videoId"] } as const;

const app = Fastify({ logger: { level: "info" }, trustProxy: true });

function cookie(req: FastifyRequest, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function cookieHeader(name: string, value: string, maxAge: number) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    env.secureCookies ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

async function currentUser(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const sid = cookie(req, SESSION_COOKIE);
  const session = sid ? db.sessions[sid] : undefined;
  if (!sid || !session || Date.now() - session.createdAt > SESSION_SECONDS * 1000) {
    if (sid && session) {
      delete db.sessions[sid];
      save();
    }
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const user = db.users[session.email];
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return user;
}

function startSession(reply: FastifyReply, user: User) {
  db.users[user.email] = user;
  const sid = randomUUID();
  db.sessions[sid] = { email: user.email, createdAt: Date.now() };
  save();
  reply.header("set-cookie", cookieHeader(SESSION_COOKIE, sid, SESSION_SECONDS));
}

// --- auth -----------------------------------------------------------------

app.get("/api/config", () => ({ mock: env.mock, oauthReady }));

app.get("/api/health", () => ({ ok: true }));

app.get("/auth/google", async (_req, reply) => {
  if (env.mock) {
    const user: User = {
      email: MOCK_EMAIL,
      name: "Demonstração",
      accessToken: "mock",
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
    seedMockProgress();
    seedMockSelection();
    startSession(reply, user);
    return reply.redirect(env.appUrl);
  }
  if (!oauthReady) return reply.code(500).send({ error: "oauth_not_configured" });

  const state = randomBytes(24).toString("base64url");
  reply.header("set-cookie", cookieHeader(STATE_COOKIE, state, 600));
  return reply.redirect(authUrl(state));
});

app.get("/auth/google/callback", async (req, reply) => {
  const query = req.query as { code?: string; state?: string; error?: string; scope?: string };
  const expected = cookie(req, STATE_COOKIE);
  if (query.error || !query.code || !query.state || query.state !== expected) {
    return reply.redirect(`${env.appUrl}/?auth_error=1`);
  }

  // Granular consent lets the account grant a subset; without Drive the session is useless.
  if (query.scope && !query.scope.split(" ").includes(DRIVE_SCOPE)) {
    req.log.warn({ granted: query.scope }, "login without the Drive scope");
    return reply.redirect(`${env.appUrl}/?auth_error=scope`);
  }

  try {
    const { token, me } = await exchangeCode(query.code);
    const previous = db.users[me.email];
    const user = toUser(me, token);
    // Keep a refresh token from an earlier consent when Google omits it.
    user.refreshToken ??= previous?.refreshToken;
    startSession(reply, user);
    return reply.redirect(env.appUrl);
  } catch (error) {
    req.log.error(error, "oauth callback failed");
    return reply.redirect(`${env.appUrl}/?auth_error=1`);
  }
});

app.post("/auth/logout", async (req, reply) => {
  const sid = cookie(req, SESSION_COOKIE);
  if (sid) {
    delete db.sessions[sid];
    save();
  }
  reply.header("set-cookie", cookieHeader(SESSION_COOKIE, "", 0));
  return reply.redirect(env.appUrl, 303);
});

app.get("/api/me", async (req, reply) => {
  const user = await currentUser(req, reply);
  if (!user) return;
  const me: Me = { email: user.email, name: user.name, picture: user.picture };
  return me;
});

// --- library --------------------------------------------------------------

app.get("/api/catalog", async (req, reply) => {
  const user = await currentUser(req, reply);
  if (!user) return;

  const selected = db.courses[user.email] ?? [];
  if (env.mock) return mockCatalog(selected);

  const force = (req.query as { refresh?: string }).refresh === "1";
  const token = await accessToken(user);
  return getCatalog(token, user.email, selected, force);
});

// --- course folders -------------------------------------------------------

app.get("/api/folders", async (req, reply) => {
  const user = await currentUser(req, reply);
  if (!user) return;

  const parent = (req.query as { parent?: string }).parent ?? "root";
  if (!/^(root|[A-Za-z0-9_-]{6,120})$/.test(parent)) return reply.code(400).send({ error: "bad_parent" });
  if (env.mock) return { folders: mockFolders(parent) };

  const token = await accessToken(user);
  return { folders: await listFolders(token, parent) };
});

app.get("/api/selection", async (req, reply) => {
  const user = await currentUser(req, reply);
  if (!user) return;

  const ids = db.courses[user.email] ?? [];
  if (env.mock) return { folders: mockResolve(ids) };

  const token = await accessToken(user);
  return { folders: await resolveFolders(token, ids) };
});

app.put<{ Body: { folderIds: string[] } }>(
  "/api/selection",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          folderIds: {
            type: "array",
            maxItems: 100,
            items: { type: "string", pattern: "^[A-Za-z0-9_-]{6,120}$" },
          },
        },
        required: ["folderIds"],
        additionalProperties: false,
      },
    },
  },
  async (req, reply) => {
    const user = await currentUser(req, reply);
    if (!user) return;

    const ids = [...new Set(req.body.folderIds)];
    const folders = env.mock ? mockResolve(ids) : await resolveFolders(await accessToken(user), ids);
    if (ids.length > 0 && folders.length === 0) return reply.code(400).send({ error: "folders_unavailable" });

    db.courses[user.email] = folders.map((folder) => folder.id);
    save();
    invalidateCatalog(user.email);
    return { folders };
  },
);

// --- watch history --------------------------------------------------------

app.get("/api/progress", async (req, reply) => {
  const user = await currentUser(req, reply);
  if (!user) return;
  return db.progress[user.email] ?? {};
});

app.put<{ Params: { videoId: string }; Body: ProgressInput }>(
  "/api/progress/:videoId",
  {
    schema: {
      params: FILE_ID,
      body: {
        type: "object",
        properties: {
          position: { type: "number", minimum: 0 },
          duration: { type: "number", minimum: 0 },
          watched: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  async (req, reply) => {
    const user = await currentUser(req, reply);
    if (!user) return;
    const rows = (db.progress[user.email] ??= {});
    rows[req.params.videoId] = mergeProgress(rows[req.params.videoId], req.body);
    save();
    return rows[req.params.videoId];
  },
);

app.post<{ Body: { videoIds: string[]; watched: boolean } }>(
  "/api/progress/bulk",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          videoIds: { type: "array", maxItems: 500, items: { type: "string", pattern: "^[A-Za-z0-9_-]{6,120}$" } },
          watched: { type: "boolean" },
        },
        required: ["videoIds", "watched"],
        additionalProperties: false,
      },
    },
  },
  async (req, reply) => {
    const user = await currentUser(req, reply);
    if (!user) return;
    const rows = (db.progress[user.email] ??= {});
    for (const id of req.body.videoIds) rows[id] = mergeProgress(rows[id], { watched: req.body.watched });
    save();
    return rows;
  },
);

// --- video stream ---------------------------------------------------------

app.get<{ Params: { videoId: string } }>(
  "/api/media/:videoId",
  { schema: { params: FILE_ID } },
  async (req, reply) => {
    const user = await currentUser(req, reply);
    if (!user) return;
    if (env.mock) return reply.redirect(MOCK_CLIP);

    const token = await accessToken(user);
    const range = req.headers.range;
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.params.videoId)}?alt=media&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) } },
    );

    if (!upstream.ok || !upstream.body) {
      req.log.warn({ status: upstream.status, videoId: req.params.videoId }, "media upstream failed");
      return reply.code(upstream.status === 404 ? 404 : 502).send({ error: "media_unavailable" });
    }

    reply.code(upstream.status);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) reply.header(name, value);
    }
    reply.header("cache-control", "private, max-age=300");
    return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
  },
);

// --- errors ---------------------------------------------------------------

app.setErrorHandler((error: FastifyError, req, reply) => {
  if (error instanceof Reauth) {
    reply.code(401).send({ error: "reauth" });
    return;
  }
  if (error instanceof MissingScope) {
    reply.code(403).send({ error: "drive_scope" });
    return;
  }
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  if (status === 500) req.log.error(error);
  reply.code(status).send({ error: status === 500 ? "request_failed" : error.message });
});

// --- static web build -----------------------------------------------------

const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? "/";
    if (url.startsWith("/api/") || url.startsWith("/auth/")) return reply.code(404).send({ error: "not_found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: env.port, host: env.host });
if (!oauthReady && !env.mock) {
  app.log.warn("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are missing: login is disabled. Set MOCK=1 to preview the UI.");
}
