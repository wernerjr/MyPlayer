import type { Catalog, CloudFolder, CloudProvider } from "@myplayer/shared";
import { buildCatalog, FOLDER, parseRef, refKey, type CloudFile } from "./catalog.js";
import * as drive from "./catalog.js";
import { accessToken } from "./google.js";
import * as onedrive from "./onedrive.js";
import type { User } from "./store.js";

const CACHE_MS = 60_000;
const PROVIDERS: CloudProvider[] = ["gdrive", "onedrive"];

interface Driver {
  token: (user: User) => Promise<string>;
  list: (token: string, parent: string) => Promise<CloudFolder[]>;
  resolve: (token: string, ids: string[]) => Promise<CloudFolder[]>;
  children: (token: string, parents: string[]) => Promise<CloudFile[]>;
  media: (token: string, id: string, range?: string) => Promise<Response>;
}

const drivers: Record<CloudProvider, Driver> = {
  gdrive: {
    token: accessToken,
    list: drive.listFolders,
    resolve: drive.resolveFolders,
    children: drive.listChildren,
    media: drive.mediaResponse,
  },
  onedrive: {
    token: onedrive.accessToken,
    list: onedrive.listFolders,
    resolve: onedrive.resolveFolders,
    children: onedrive.listChildren,
    media: onedrive.mediaResponse,
  },
};

function keyOf(ref: string) {
  const { provider, id } = parseRef(ref);
  return refKey(provider, id);
}

function group(refs: string[]) {
  const groups: Record<CloudProvider, string[]> = { gdrive: [], onedrive: [] };
  for (const ref of refs) {
    const { provider, id } = parseRef(ref);
    groups[provider].push(id);
  }
  return groups;
}

export function listFolders(user: User, provider: CloudProvider, parent: string) {
  return drivers[provider].token(user).then((token) => drivers[provider].list(token, parent));
}

/** Turns composite selection keys into folders, preserving selection order. */
export async function resolveFolders(user: User, refs: string[]): Promise<CloudFolder[]> {
  const groups = group(refs);
  const found = new Map<string, CloudFolder>();

  await Promise.all(
    PROVIDERS.map(async (provider) => {
      const ids = groups[provider];
      if (ids.length === 0) return;
      const driver = drivers[provider];
      const folders = await driver.resolve(await driver.token(user), ids);
      for (const folder of folders) found.set(refKey(provider, folder.id), folder);
    }),
  );

  return refs
    .map((ref) => found.get(keyOf(ref)))
    .filter((folder): folder is CloudFolder => folder !== undefined);
}

const caches = new Map<string, { at: number; catalog: Catalog }>();

/** Cached per account: a user without access to a folder must never see another user's catalog. */
export async function getCatalog(
  user: User,
  account: string,
  selected: string[],
  force = false,
): Promise<Catalog> {
  const cached = caches.get(account);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.catalog;

  const groups = group(selected);
  const loaded = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const ids = groups[provider];
      if (ids.length === 0) return { courses: [] as CloudFolder[], files: [] as CloudFile[] };
      const driver = drivers[provider];
      const token = await driver.token(user);
      const courses = await driver.resolve(token, ids);
      const courseChildren =
        courses.length > 0 ? await driver.children(token, courses.map((course) => course.id)) : [];
      const moduleIds = courseChildren.filter((file) => file.mimeType === FOLDER).map((file) => file.id);
      const moduleChildren = moduleIds.length > 0 ? await driver.children(token, moduleIds) : [];
      return { courses, files: [...courseChildren, ...moduleChildren] };
    }),
  );

  const found = new Map(loaded.flatMap((leg) => leg.courses).map((folder) => [refKey(folder.provider, folder.id), folder]));
  const courses = selected
    .map((ref) => found.get(keyOf(ref)))
    .filter((folder): folder is CloudFolder => folder !== undefined);

  const catalog = buildCatalog(courses, loaded.flatMap((leg) => leg.files));
  caches.set(account, { at: Date.now(), catalog });
  return catalog;
}

export function invalidateCatalog(account: string) {
  caches.delete(account);
}

export async function openMedia(user: User, provider: CloudProvider, id: string, range?: string) {
  const driver = drivers[provider];
  return driver.media(await driver.token(user), id, range);
}
