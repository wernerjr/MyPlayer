import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProgress } from "@myplayer/shared";
import type { CloudProvider } from "@myplayer/shared";
import { buildCatalog, FOLDER, parseRef, type CloudFile } from "./catalog.js";

test("progress marks watched only near the end", () => {
  const partial = mergeProgress(undefined, { position: 300, duration: 600 }, 1);
  assert.equal(partial.watched, false);
  assert.equal(partial.position, 300);

  const finished = mergeProgress(partial, { position: 540, duration: 600 }, 2);
  assert.equal(finished.watched, true);
});

test("watched survives a rewind and can be cleared explicitly", () => {
  const watched = { position: 600, duration: 600, watched: true, updatedAt: 1 };
  assert.equal(mergeProgress(watched, { position: 12 }, 2).watched, true);
  const cleared = mergeProgress(watched, { watched: false }, 3);
  assert.equal(cleared.watched, false);
  assert.equal(cleared.position, 600);
});

test("progress ignores bad numbers and never exceeds duration", () => {
  const row = mergeProgress(undefined, { position: 900, duration: 600 }, 1);
  assert.equal(row.position, 600);
  const kept = mergeProgress({ position: 42, duration: 600, watched: false, updatedAt: 1 }, { position: Number.NaN }, 2);
  assert.equal(kept.position, 42);
  assert.equal(kept.duration, 600);
});

const folder = (id: string, name: string, parents: string[], provider: CloudProvider = "gdrive"): CloudFile => ({
  provider,
  id,
  name,
  mimeType: FOLDER,
  parents,
});
const video = (id: string, name: string, parents: string[], provider: CloudProvider = "gdrive"): CloudFile => ({
  provider,
  id,
  name,
  mimeType: "video/mp4",
  parents,
  durationMs: 600_000,
});
const file = (
  id: string,
  name: string,
  mimeType: string,
  parents: string[],
  provider: CloudProvider = "gdrive",
): CloudFile => ({
  provider,
  id,
  name,
  mimeType,
  parents,
});

test("only the selected folders become courses, in selection order", () => {
  const catalog = buildCatalog(
    [
      { provider: "gdrive", id: "c2", name: "Curso B" },
      { provider: "gdrive", id: "c1", name: "Curso A" },
    ],
    [folder("c1", "Curso A", ["somewhere"]), folder("c2", "Curso B", ["somewhere"])],
  );

  assert.deepEqual(
    catalog.courses.map((course) => course.name),
    ["Curso B", "Curso A"],
  );
  assert.deepEqual(catalog.courses[0]!.modules, []);
});

test("courses from both clouds keep selection order and carry their provider", () => {
  const catalog = buildCatalog(
    [
      { provider: "onedrive", id: "o1", name: "Curso One" },
      { provider: "gdrive", id: "g1", name: "Curso Google" },
    ],
    [
      folder("o1", "Curso One", ["od"], "onedrive"),
      folder("om", "Módulo One", ["o1"], "onedrive"),
      video("ov", "Aula One.mp4", ["om"], "onedrive"),
      folder("g1", "Curso Google", ["gd"]),
      video("gv", "Aula Google.mp4", ["g1"]),
    ],
  );

  assert.deepEqual(
    catalog.courses.map((course) => [course.id, course.provider]),
    [
      ["onedrive:o1", "onedrive"],
      ["gdrive:g1", "gdrive"],
    ],
  );
  assert.equal(catalog.courses[0]!.modules[0]!.videos[0]!.provider, "onedrive");
  assert.equal(catalog.courses[1]!.modules[0]!.videos[0]!.provider, "gdrive");
});

test("legacy ids without a provider belong to Google Drive", () => {
  assert.deepEqual(parseRef("1AbC-xyz_123"), { provider: "gdrive", id: "1AbC-xyz_123" });
  assert.deepEqual(parseRef("onedrive:F4C71C6B4B0A1E33!123"), {
    provider: "onedrive",
    id: "F4C71C6B4B0A1E33!123",
  });
});

test("catalog maps course > module > videos and attachments", () => {
  const catalog = buildCatalog(
    [
      { provider: "gdrive", id: "c1", name: "Curso A" },
      { provider: "gdrive", id: "c2", name: "Curso B" },
    ],
    [
      folder("m1", "Módulo 1", ["c1"]),
      video("v1", "Aula 1.mp4", ["m1"]),
      file("v2", "Aula 2.mkv", "application/octet-stream", ["m1"]),
      file("a1", "Slides.pdf", "application/pdf", ["m1"]),
      folder("nested", "Extras", ["m1"]),
      folder("m2", "Módulo 2", ["c1"]),
      video("v3", "Aula 3.webm", ["m2"]),
    ],
  );

  const first = catalog.courses[0]!;
  assert.equal(first.modules.length, 2);
  assert.deepEqual(
    first.modules[0]!.videos.map((item) => item.name),
    ["Aula 1", "Aula 2"],
  );
  assert.equal(first.modules[0]!.videos[0]!.durationMs, 600_000);
  assert.deepEqual(
    first.modules[0]!.attachments.map((item) => item.name),
    ["Slides.pdf"],
  );
  assert.equal(first.modules[1]!.attachments.length, 0);
  assert.equal(catalog.courses[1]!.modules.length, 0);
});

test("files loose in the course folder become a module instead of disappearing", () => {
  const catalog = buildCatalog(
    [{ provider: "gdrive", id: "c1", name: "Curso A" }],
    [
      video("v1", "Aula solta.mp4", ["c1"]),
      file("a1", "Programa.pdf", "application/pdf", ["c1"]),
      folder("m1", "Módulo 1", ["c1"]),
    ],
  );

  const modules = catalog.courses[0]!.modules;
  assert.deepEqual(
    modules.map((item) => item.name),
    ["Módulo 1", "Conteúdo do curso"],
  );
  assert.deepEqual(
    modules[1]!.videos.map((item) => item.name),
    ["Aula solta"],
  );
  assert.deepEqual(
    modules[1]!.attachments.map((item) => item.name),
    ["Programa.pdf"],
  );
});
