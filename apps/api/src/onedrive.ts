import type { CloudFolder } from "@myplayer/shared";
import { env } from "./env.js";
import { FOLDER, type CloudFile } from "./catalog.js";
import { save, type CloudTokens, type User } from "./store.js";

const AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0/me/drive";

/** Read-only files plus offline_access, which is what returns a refresh token. */
export const ONEDRIVE_SCOPE = "offline_access Files.Read.All";

export class OneDriveReauth extends Error {}

export function redirectUri() {
  return `${env.apiUrl}/auth/microsoft/callback`;
}

export function authUrl(state: string) {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: env.microsoftClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: ONEDRIVE_SCOPE,
    response_mode: "query",
    // Forces a fresh consent, so a reconnect also repairs a stale or revoked token.
    prompt: "consent",
    state,
  }).toString();
  return url.href;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function tokensOf(response: TokenResponse): CloudTokens {
  return {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshToken: response.refresh_token,
  };
}

export async function exchangeCode(code: string): Promise<CloudTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.microsoftClientId,
      client_secret: env.microsoftClientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: ONEDRIVE_SCOPE,
    }),
  });
  if (!response.ok) throw new Error(`OneDrive token exchange failed (${response.status}): ${await response.text()}`);
  const token = (await response.json()) as TokenResponse;
  // Granular consent (common in work accounts) can grant a subset; without files the link is useless.
  if (token.scope && !token.scope.split(" ").some((scope) => scope.endsWith("Files.Read.All"))) {
    throw new Error(`OneDrive consent without Files.Read.All: ${token.scope}`);
  }
  return tokensOf(token);
}

/** Refreshes the access token when it is about to expire. */
export async function accessToken(user: User): Promise<string> {
  const tokens = user.onedrive;
  if (!tokens) throw new OneDriveReauth();
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new OneDriveReauth();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.microsoftClientId,
      client_secret: env.microsoftClientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
      scope: ONEDRIVE_SCOPE,
    }),
  });
  if (!response.ok) throw new OneDriveReauth();

  const token = (await response.json()) as TokenResponse;
  tokens.accessToken = token.access_token;
  tokens.expiresAt = Date.now() + token.expires_in * 1000;
  tokens.refreshToken = token.refresh_token ?? tokens.refreshToken;
  save();
  return tokens.accessToken;
}

interface GraphItem {
  id: string;
  name: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  video?: { duration?: number };
  size?: number;
  webUrl?: string;
  parentReference?: { id?: string };
}

interface GraphPage {
  value?: GraphItem[];
  "@odata.nextLink"?: string;
}

async function graph<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new OneDriveReauth();
  if (!response.ok) throw new Error(`OneDrive ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

function toCloudFile(item: GraphItem, parent: string): CloudFile {
  return {
    provider: "onedrive",
    id: item.id,
    name: item.name,
    // The catalog builder only needs to tell folders from files; the rest is a real mime type.
    mimeType: item.folder ? FOLDER : item.file?.mimeType ?? "",
    size: item.size || undefined,
    webViewLink: item.webUrl,
    parents: [parent],
    durationMs: item.video?.duration || undefined,
  };
}

async function children(token: string, parent: string): Promise<CloudFile[]> {
  const base = parent === "root" ? `${GRAPH}/root/children` : `${GRAPH}/items/${encodeURIComponent(parent)}/children`;
  const files: CloudFile[] = [];
  let next: string | undefined = `${base}?$select=id,name,folder,file,video,size,webUrl&$top=200`;
  do {
    const page: GraphPage = await graph<GraphPage>(next, token);
    files.push(...(page.value ?? []).map((item) => toCloudFile(item, parent)));
    next = page["@odata.nextLink"];
  } while (next);
  return files;
}

/** Subfolders of one folder, for the picker. "root" means the OneDrive root. */
export async function listFolders(token: string, parent: string): Promise<CloudFolder[]> {
  return (await children(token, parent))
    .filter((file) => file.mimeType === FOLDER)
    .map((file) => ({ provider: "onedrive" as const, id: file.id, name: file.name, webViewLink: file.webViewLink }));
}

/** Resolves ids to folders, dropping items that vanished or were not folders. */
export async function resolveFolders(token: string, ids: string[]): Promise<CloudFolder[]> {
  const resolved = await Promise.all(
    ids.map(async (id): Promise<CloudFolder | null> => {
      try {
        const item = await graph<GraphItem>(
          `${GRAPH}/items/${encodeURIComponent(id)}?$select=id,name,folder,webUrl`,
          token,
        );
        return item.folder
          ? { provider: "onedrive" as const, id: item.id, name: item.name, webViewLink: item.webUrl }
          : null;
      } catch (error) {
        if (error instanceof OneDriveReauth) throw error;
        return null;
      }
    }),
  );
  return resolved.filter((folder): folder is CloudFolder => folder !== null);
}

/** Children of every parent, one Graph call per folder; the catalog is cached per account. */
export async function listChildren(token: string, parents: string[]): Promise<CloudFile[]> {
  // shortcut: one request per folder, in parallel; fine for personal libraries, batch if one grows past a few hundred folders.
  const pages = await Promise.all(parents.map((parent) => children(token, parent)));
  return pages.flat();
}

export async function mediaResponse(token: string, id: string, range?: string) {
  const response = await fetch(`${GRAPH}/items/${encodeURIComponent(id)}/content`, {
    headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
    redirect: "follow",
  });
  if (response.status === 401) throw new OneDriveReauth();
  return response;
}
