import type { Me } from "@myplayer/shared";
import { env } from "./env.js";
import { save, type User } from "./store.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export class Reauth extends Error {}

export function redirectUri() {
  return `${env.apiUrl}/auth/google/callback`;
}

export function authUrl(state: string) {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email profile ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.href;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token: string;
}

export async function exchangeCode(code: string) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`token exchange failed (${response.status}): ${await response.text()}`);

  const token = (await response.json()) as TokenResponse;
  // This id_token came straight from Google over TLS in the exchange above, so its claims can be read without a second verification.
  const claims = JSON.parse(Buffer.from(token.id_token.split(".")[1]!, "base64url").toString()) as {
    email: string;
    name?: string;
    picture?: string;
  };
  const me: Me = { email: claims.email, name: claims.name || claims.email, picture: claims.picture };
  return { token, me };
}

export function toUser(me: Me, token: TokenResponse): User {
  return {
    email: me.email,
    name: me.name,
    picture: me.picture,
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken: token.refresh_token,
  };
}

/** Refreshes the access token when it is about to expire. */
export async function accessToken(user: User) {
  if (user.accessToken && user.expiresAt > Date.now() + 60_000) return user.accessToken;
  if (!user.refreshToken) throw new Reauth();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: user.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Reauth();

  const token = (await response.json()) as TokenResponse;
  user.accessToken = token.access_token;
  user.expiresAt = Date.now() + token.expires_in * 1000;
  // Google only returns refresh_token on the first consent, so keep the stored one.
  user.refreshToken ??= token.refresh_token;
  save();
  return user.accessToken;
}
