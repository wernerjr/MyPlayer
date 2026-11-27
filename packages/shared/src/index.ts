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

/** A lesson bookmarked by the account. The snapshot is for display only, never to open media. */
export interface Favorite {
  /** `provider:videoId`, stable across clouds. */
  key: string;
  videoId: string;
  provider: CloudProvider;
  courseId: string;
  courseName: string;
  moduleId: string;
  moduleName: string;
  videoName: string;
  /** Set by the server. */
  addedAt: number;
}

/** What the client knows about an open lesson when it favorites it. */
export interface FavoriteInput {
  courseId: string;
  courseName: string;
  moduleId: string;
  moduleName: string;
  videoName: string;
}

/** The lesson identity plus the display snapshot, used to build a `Favorite`. */
export type FavoriteCandidate = FavoriteInput & { videoId: string; provider: CloudProvider };

export interface FavoritesResponse {
  favorites: Favorite[];
  limit: number;
}

export const FAVORITES_MAX = 100;

export interface AddFavoriteResult {
  favorites: Favorite[];
  /** The lesson was new and joined the list. */
  added: boolean;
  /** The lesson was new but the account already reached `FAVORITES_MAX`. */
  limited: boolean;
}

/**
 * The single rule for adding a favorite, used by both sides: idempotent by
 * `provider:videoId`, newest first, and a hard limit.
 */
export function addFavorite(current: Favorite[], input: FavoriteCandidate, now = Date.now()): AddFavoriteResult {
  const key = cloudKey(input.provider, input.videoId);
  if (current.some((favorite) => favorite.key === key)) {
    return { favorites: current, added: false, limited: false };
  }
  if (current.length >= FAVORITES_MAX) {
    return { favorites: current, added: false, limited: true };
  }
  const favorite: Favorite = {
    key,
    videoId: input.videoId,
    provider: input.provider,
    courseId: input.courseId,
    courseName: input.courseName,
    moduleId: input.moduleId,
    moduleName: input.moduleName,
    videoName: input.videoName,
    addedAt: now,
  };
  return { favorites: [favorite, ...current], added: true, limited: false };
}

/** Removes by key; idempotent and returns the same list when nothing matched. */
export function removeFavorite(current: Favorite[], key: string): Favorite[] {
  const next = current.filter((favorite) => favorite.key !== key);
  return next.length === current.length ? current : next;
}

/** A canonical favorites list tied to the sequence of the mutation that produced it. */
export interface FavoritesMutationResult {
  sequence: number;
  favorites: Favorite[];
}

/**
 * Applies a canonical list only while its mutation is still the newest one
 * emitted. A slower older response must not overwrite newer local state.
 */
export function applyFavoritesResponse(
  current: Favorite[],
  result: FavoritesMutationResult,
  latestSequence: number,
): Favorite[] {
  return result.sequence === latestSequence ? result.favorites : current;
}

/** Puts a favorite back in newest-first order when an optimistic removal fails. */
export function restoreFavorite(current: Favorite[], favorite: Favorite): Favorite[] {
  if (current.some((item) => item.key === favorite.key)) return current;
  const index = current.findIndex((item) => item.addedAt < favorite.addedAt);
  if (index < 0) return [...current, favorite];
  return [...current.slice(0, index), favorite, ...current.slice(index)];
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
