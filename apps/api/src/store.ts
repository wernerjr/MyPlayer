import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Favorite, ProgressMap } from "@myplayer/shared";
import { env } from "./env.js";

export interface CloudTokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface User {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  /** OneDrive link; absent until the account connects it. */
  onedrive?: CloudTokens;
}

export interface Session {
  email: string;
  createdAt: number;
}

export interface Db {
  users: Record<string, User>;
  sessions: Record<string, Session>;
  progress: Record<string, ProgressMap>;
  /** Folder ids the account marked as courses, in the order they were chosen. */
  courses: Record<string, string[]>;
  /** Favorite lessons per account, newest first. */
  favorites: Record<string, Favorite[]>;
}

const file = join(env.dataDir, "db.json");

function load(): Db {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Db>;
    return {
      users: parsed.users ?? {},
      sessions: parsed.sessions ?? {},
      progress: parsed.progress ?? {},
      courses: parsed.courses ?? {},
      favorites: parsed.favorites ?? {},
    };
  } catch (error) {
    // A corrupt database must not be silently replaced: that would lose watch history.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { users: {}, sessions: {}, progress: {}, courses: {}, favorites: {} };
  }
}

export const db = load();

let pending: NodeJS.Timeout | undefined;

function write() {
  mkdirSync(env.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, file);
}

/** Debounced, atomic write. The file is small, so a full rewrite is cheaper than a log. */
export function save() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = undefined;
    write();
  }, 300);
}

process.on("exit", () => {
  if (pending) write();
});
