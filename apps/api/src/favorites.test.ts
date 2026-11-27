import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addFavorite,
  applyFavoritesResponse,
  FAVORITES_MAX,
  removeFavorite,
  restoreFavorite,
  type CloudProvider,
  type Favorite,
  type FavoriteCandidate,
} from "@myplayer/shared";

function candidate(videoId: string, provider: CloudProvider = "gdrive"): FavoriteCandidate {
  return {
    videoId,
    provider,
    courseId: `${provider}:course-1`,
    courseName: "Curso",
    moduleId: `${provider}:module-1`,
    moduleName: "Módulo",
    videoName: `Aula ${videoId}`,
  };
}

test("addFavorite prepends a lesson with a composed key and the server time", () => {
  const first = addFavorite([], candidate("video-01"), 1000);
  assert.equal(first.added, true);
  assert.equal(first.limited, false);
  assert.equal(first.favorites.length, 1);
  assert.deepEqual(
    { key: first.favorites[0].key, addedAt: first.favorites[0].addedAt, videoId: first.favorites[0].videoId },
    { key: "gdrive:video-01", addedAt: 1000, videoId: "video-01" },
  );

  const second = addFavorite(first.favorites, candidate("video-02"), 2000);
  assert.equal(second.favorites[0].videoId, "video-02");
  assert.equal(second.favorites[1].videoId, "video-01");
});

test("addFavorite is idempotent by key and keeps the original addedAt", () => {
  const current = addFavorite([], candidate("video-01"), 1000).favorites;
  const again = addFavorite(current, candidate("video-01"), 5000);
  assert.equal(again.added, false);
  assert.equal(again.limited, false);
  assert.equal(again.favorites, current);
  assert.equal(again.favorites[0].addedAt, 1000);
  assert.equal(again.favorites.length, 1);
});

test("the same video id in another provider is a different favorite", () => {
  const drive = addFavorite([], candidate("video-01", "gdrive"), 1000).favorites;
  const both = addFavorite(drive, candidate("video-01", "onedrive"), 2000).favorites;
  assert.equal(both.length, 2);
  assert.deepEqual(
    both.map((favorite) => favorite.key),
    ["onedrive:video-01", "gdrive:video-01"],
  );
});

test("addFavorite blocks a new lesson at the limit without changing the list", () => {
  let favorites: Favorite[] = [];
  for (let index = 0; index < FAVORITES_MAX; index += 1) {
    favorites = addFavorite(favorites, candidate(`video-${String(index).padStart(3, "0")}`), index).favorites;
  }
  assert.equal(favorites.length, FAVORITES_MAX);

  const blocked = addFavorite(favorites, candidate("video-new"), 10_000);
  assert.equal(blocked.added, false);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.favorites, favorites);
  assert.equal(blocked.favorites.length, FAVORITES_MAX);

  // An existing lesson still succeeds at the limit.
  const repeated = addFavorite(favorites, candidate("video-099"), 10_001);
  assert.equal(repeated.added, false);
  assert.equal(repeated.limited, false);
});

test("an older canonical response does not overwrite the newest mutation", () => {
  const older = addFavorite([], candidate("video-01"), 1000).favorites;
  const newer = addFavorite(older, candidate("video-02"), 2000).favorites;

  // Sequence 1 resolves last, after sequence 2 was already applied.
  const afterOld = applyFavoritesResponse(newer, { sequence: 1, favorites: older }, 2);
  assert.equal(afterOld, newer);

  // The newest response still becomes the canonical list.
  const afterNew = applyFavoritesResponse([], { sequence: 2, favorites: newer }, 2);
  assert.equal(afterNew, newer);
});

test("restoreFavorite reinserts by addedAt without duplicating", () => {
  const older = addFavorite([], candidate("video-01"), 1000).favorites[0];
  const newer = addFavorite([], candidate("video-02"), 2000).favorites[0];

  const restored = restoreFavorite([newer], older);
  assert.deepEqual(
    restored.map((favorite) => favorite.videoId),
    ["video-02", "video-01"],
  );
  assert.equal(restoreFavorite(restored, older), restored);
});

test("removeFavorite drops only the matching key and is idempotent", () => {
  const current = addFavorite(
    addFavorite([], candidate("video-01"), 1000).favorites,
    candidate("video-02"),
    2000,
  ).favorites;

  const removed = removeFavorite(current, "gdrive:video-01");
  assert.deepEqual(
    removed.map((favorite) => favorite.videoId),
    ["video-02"],
  );

  const missing = removeFavorite(removed, "gdrive:video-01");
  assert.equal(missing, removed);
});
