import {
  cloudKey,
  type Attachment,
  type Catalog,
  type CloudFolder,
  type CloudProvider,
  type Course,
  type Module,
  type Video,
} from "@myplayer/shared";
import { Reauth } from "./google.js";

const API = "https://www.googleapis.com/drive/v3/files";
export const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,size,webViewLink,parents,videoMediaMetadata(durationMillis)";
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i;

/** A file shape both clouds can be normalized to, so the catalog builder stays provider-agnostic. */
export interface CloudFile {
  provider: CloudProvider;
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  parents?: string[];
  durationMs?: number;
}

/** Raw item from the Google Drive API. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  videoMediaMetadata?: { durationMillis?: string };
}

export type FolderRef = CloudFolder;

export class MissingScope extends Error {}

/** Selection keys carry the provider so the two clouds can coexist: `gdrive:<id>` / `onedrive:<id>`. */
export const refKey = cloudKey;

/** Bare ids come from selections saved before OneDrive support and are Google Drive ids. */
export function parseRef(ref: string): { provider: CloudProvider; id: string } {
  const at = ref.indexOf(":");
  if (at < 0) return { provider: "gdrive", id: ref };
  const provider = ref.slice(0, at);
  const id = ref.slice(at + 1);
  return provider === "onedrive" ? { provider, id } : { provider: "gdrive", id };
}

async function drive<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new Reauth();
  if (!response.ok) {
    const body = await response.text();
    // The account signed in without the Drive scope (e.g. it was left out of the consent screen).
    if (response.status === 403 && body.includes("insufficientPermissions")) throw new MissingScope();
    throw new Error(`Drive ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

function toCloudFile(file: DriveFile): CloudFile {
  return {
    provider: "gdrive",
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size) || undefined,
    webViewLink: file.webViewLink,
    parents: file.parents,
    durationMs: Number(file.videoMediaMetadata?.durationMillis) || undefined,
  };
}

/** One query per 20 parents keeps Drive's `q` short; the rest is pagination. */
export async function listChildren(token: string, parents: string[]): Promise<CloudFile[]> {
  const files: CloudFile[] = [];
  for (let index = 0; index < parents.length; index += 20) {
    const chunk = parents.slice(index, index + 20);
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `${chunk.map((id) => `'${id}' in parents`).join(" or ")} and trashed = false`,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await drive<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}?${params}`, token);
      files.push(...(page.files ?? []).map(toCloudFile));
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return files;
}

/** Drive's own ordering differs between queries, so the sequence is defined here. */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });

/** Subfolders of one folder, for the picker. "root" means My Drive. */
export async function listFolders(token: string, parent: string): Promise<FolderRef[]> {
  const folders: FolderRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and mimeType = '${FOLDER}' and trashed = false`,
      fields: "nextPageToken,files(id,name,webViewLink)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await drive<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}?${params}`, token);
    folders.push(
      ...(page.files ?? []).map(({ id, name, webViewLink }) => ({ provider: "gdrive" as const, id, name, webViewLink })),
    );
    pageToken = page.nextPageToken;
  } while (pageToken);
  return folders.sort(byName);
}

/** Turns ids into folders, dropping the ones that vanished, were deleted or are not folders. */
export async function resolveFolders(token: string, ids: string[]): Promise<FolderRef[]> {
  const resolved = await Promise.all(
    ids.map(async (id): Promise<FolderRef | null> => {
      try {
        const file = await drive<DriveFile>(
          `${API}/${id}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
          token,
        );
        return file.mimeType === FOLDER
          ? { provider: "gdrive" as const, id: file.id, name: file.name, webViewLink: file.webViewLink }
          : null;
      } catch (error) {
        if (error instanceof Reauth || error instanceof MissingScope) throw error;
        return null;
      }
    }),
  );
  return resolved.filter((folder): folder is FolderRef => folder !== null);
}

export async function mediaResponse(token: string, id: string, range?: string) {
  return fetch(
    `${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) } },
  );
}

function isFolder(file: CloudFile) {
  return file.mimeType === FOLDER;
}
function isVideo(file: CloudFile) {
  return file.mimeType.startsWith("video/") || VIDEO_EXT.test(file.name);
}

function toVideo(file: CloudFile): Video {
  return {
    kind: "video",
    id: file.id,
    // Extensions are noise in a lesson list; attachments keep theirs.
    name: file.name.replace(VIDEO_EXT, "") || file.name,
    mimeType: file.mimeType,
    size: file.size,
    webViewLink: file.webViewLink,
    provider: file.provider,
    durationMs: file.durationMs,
  };
}

function toAttachment(file: CloudFile): Attachment {
  return {
    kind: "attachment",
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    webViewLink: file.webViewLink,
    provider: file.provider,
  };
}

/** Pure so it can be tested without a cloud. Chosen folders are courses; their subfolders are modules. */
export function buildCatalog(courses: FolderRef[], files: CloudFile[]): Catalog {
  const byParent = new Map<string, CloudFile[]>();
  for (const file of files) {
    for (const parent of file.parents ?? []) {
      const siblings = byParent.get(parent);
      if (siblings) siblings.push(file);
      else byParent.set(parent, [file]);
    }
  }
  const children = (id: string) => [...(byParent.get(id) ?? [])].sort(byName);

  return {
    courses: courses.map((course): Course => {
      const own = children(course.id);
      const modules: Module[] = own
        .filter(isFolder)
        .map((mod) => ({
          id: refKey(course.provider, mod.id),
          name: mod.name,
          videos: children(mod.id).filter(isVideo).map(toVideo),
          attachments: children(mod.id)
            .filter((file) => !isFolder(file) && !isVideo(file))
            .map(toAttachment),
        }));

      // Files put straight in the course folder still show up, instead of an empty course.
      const videos = own.filter(isVideo).map(toVideo);
      const attachments = own.filter((file) => !isFolder(file) && !isVideo(file)).map(toAttachment);
      if (videos.length > 0 || attachments.length > 0) {
        modules.push({ id: `${refKey(course.provider, course.id)}~files`, name: "Conteúdo do curso", videos, attachments });
      }

      return {
        id: refKey(course.provider, course.id),
        name: course.name,
        provider: course.provider,
        webViewLink: course.webViewLink,
        modules,
      };
    }),
  };
}
