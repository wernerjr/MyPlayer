import type { Attachment, Catalog, Course, Module, Video } from "@myplayer/shared";
import { Reauth } from "./google.js";

const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,size,webViewLink,parents,videoMediaMetadata(durationMillis)";
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i;
const CACHE_MS = 60_000;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  videoMediaMetadata?: { durationMillis?: string };
}

export class MissingScope extends Error {}

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

/** One query per 20 parents keeps Drive's `q` short; the rest is pagination. */
async function listChildren(token: string, parents: string[]): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
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
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return files;
}

function isFolder(file: DriveFile) {
  return file.mimeType === FOLDER;
}
function isVideo(file: DriveFile) {
  return file.mimeType.startsWith("video/") || VIDEO_EXT.test(file.name);
}

/** Drive's own ordering differs between queries, so the sequence is defined here. */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });

export interface FolderRef {
  id: string;
  name: string;
}

/** Subfolders of one folder, for the picker. "root" means My Drive. */
export async function listFolders(token: string, parent: string): Promise<FolderRef[]> {
  const folders: FolderRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and mimeType = '${FOLDER}' and trashed = false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await drive<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}?${params}`, token);
    folders.push(...(page.files ?? []).map(({ id, name }) => ({ id, name })));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return folders.sort(byName);
}

/** Turns ids into folders, dropping the ones that vanished, were deleted or are not folders. */
export async function resolveFolders(token: string, ids: string[]): Promise<FolderRef[]> {
  const resolved = await Promise.all(
    ids.map(async (id) => {
      try {
        const file = await drive<DriveFile>(`${API}/${id}?fields=id,name,mimeType&supportsAllDrives=true`, token);
        return isFolder(file) ? { id: file.id, name: file.name } : null;
      } catch (error) {
        if (error instanceof Reauth || error instanceof MissingScope) throw error;
        return null;
      }
    }),
  );
  return resolved.filter((folder): folder is FolderRef => folder !== null);
}

function toVideo(file: DriveFile): Video {
  return {
    kind: "video",
    id: file.id,
    // Extensions are noise in a lesson list; attachments keep theirs.
    name: file.name.replace(VIDEO_EXT, "") || file.name,
    mimeType: file.mimeType,
    size: Number(file.size) || undefined,
    webViewLink: file.webViewLink,
    durationMs: Number(file.videoMediaMetadata?.durationMillis) || undefined,
  };
}

function toAttachment(file: DriveFile): Attachment {
  return {
    kind: "attachment",
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size) || undefined,
    webViewLink: file.webViewLink,
  };
}

/** Pure so it can be tested without Drive. Chosen folders are courses; their subfolders are modules. */
export function buildCatalog(courses: FolderRef[], files: DriveFile[]): Catalog {
  const byParent = new Map<string, DriveFile[]>();
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
          id: mod.id,
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
        modules.push({ id: `${course.id}~files`, name: "Conteúdo do curso", videos, attachments });
      }

      return { id: course.id, name: course.name, modules };
    }),
  };
}

const caches = new Map<string, { at: number; catalog: Catalog }>();

/** Cached per account: a user without access to a folder must never see another user's catalog. */
export async function getCatalog(
  token: string,
  account: string,
  selected: string[],
  force = false,
): Promise<Catalog> {
  const cached = caches.get(account);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.catalog;

  const courses = await resolveFolders(token, selected);
  const courseChildren =
    courses.length > 0 ? await listChildren(token, courses.map((course) => course.id)) : [];
  const modules = courseChildren.filter(isFolder);
  const moduleChildren = modules.length > 0 ? await listChildren(token, modules.map((mod) => mod.id)) : [];

  const catalog = buildCatalog(courses, [...courseChildren, ...moduleChildren]);
  caches.set(account, { at: Date.now(), catalog });
  return catalog;
}

export function invalidateCatalog(account: string) {
  caches.delete(account);
}
