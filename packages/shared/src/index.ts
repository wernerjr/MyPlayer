/** Types and rules shared by the API and the web app. */

export type CloudProvider = "gdrive" | "onedrive";

/** Selection key for a folder: `provider:id`. */
export function cloudKey(provider: CloudProvider, id: string) {
  return `${provider}:${id}`;
}

/** A folder in one of the connected clouds. `id` is the provider's own id. */
export interface CloudFolder {
  provider: CloudProvider;
  id: string;
  name: string;
  webViewLink?: string;
}

export interface Video {
  kind: "video";
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  provider?: CloudProvider;
  /** From the provider's metadata, so the list can show durations before playback. */
  durationMs?: number;
}

export interface Attachment {
  kind: "attachment";
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  provider?: CloudProvider;
}

export interface Module {
  id: string;
  name: string;
  videos: Video[];
  attachments: Attachment[];
}

export interface Course {
  /** Composite key: `provider:folderId`. */
  id: string;
  name: string;
  provider?: CloudProvider;
  webViewLink?: string;
  modules: Module[];
}

export interface Catalog {
  courses: Course[];
}

export interface Progress {
  /** Seconds into the video. */
  position: number;
  duration: number;
  watched: boolean;
  updatedAt: number;
}

export type ProgressMap = Record<string, Progress>;

export interface ProgressInput {
  position?: number;
  duration?: number;
  watched?: boolean;
}

export interface Me {
  email: string;
  name: string;
  picture?: string;
  /** OneDrive is linked to this account. */
  onedrive?: boolean;
  /** Microsoft credentials are configured on the server. */
  onedriveReady?: boolean;
}

/** Fraction of a video that counts as watched. */
export const WATCHED_AT = 0.9;

/** The single source of truth for what a progress update means, used by both sides. */
export function mergeProgress(prev: Progress | undefined, input: ProgressInput, now = Date.now()): Progress {
  const duration = nonNegative(input.duration) ?? prev?.duration ?? 0;
  const requested = nonNegative(input.position) ?? prev?.position ?? 0;
  const position = duration > 0 ? Math.min(requested, duration) : requested;
  const reachedEnd = duration > 0 && position >= duration * WATCHED_AT;
  return {
    position,
    duration,
    watched: input.watched ?? Boolean(prev?.watched || reachedEnd),
    updatedAt: now,
  };
}

function nonNegative(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
