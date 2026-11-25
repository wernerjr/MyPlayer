import { resolve } from "node:path";

// Root .env is shared by the API and the images/story tooling.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No .env is fine; everything can come from the environment.
}

const port = Number(process.env.PORT ?? 8788);
const appUrl = process.env.APP_URL ?? "http://localhost:5173";

export const env = {
  port,
  host: process.env.HOST ?? "127.0.0.1",
  appUrl,
  apiUrl: process.env.API_URL ?? `http://localhost:${port}`,
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  dataDir: resolve(process.env.DATA_DIR ?? "data"),
  mock: process.env.MOCK === "1",
  secureCookies: appUrl.startsWith("https://"),
};

export const oauthReady = Boolean(env.clientId && env.clientSecret);
export const oneDriveReady = Boolean(env.microsoftClientId && env.microsoftClientSecret);
