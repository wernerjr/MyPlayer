import {
  cloudKey,
  FAVORITES_MAX,
  type Catalog,
  type CloudProvider,
  type Course,
  type Favorite,
  type FavoriteCandidate,
  type Module,
  type Video,
} from "@myplayer/shared";

export const FAVORITES_LIMIT_MESSAGE = `Você atingiu o limite de ${FAVORITES_MAX} aulas favoritas. Remova uma para adicionar outra.`;

export const FAVORITES_ERROR_MESSAGE = "Não foi possível atualizar os favoritos. Tente de novo.";

export function favoriteKey(provider: CloudProvider, videoId: string) {
  return cloudKey(provider, videoId);
}

/** The display snapshot for an open lesson; the provider follows the video, then the course. */
export function toFavorite(course: Course, mod: Module, video: Video): FavoriteCandidate {
  return {
    videoId: video.id,
    provider: video.provider ?? course.provider ?? "gdrive",
    courseId: course.id,
    courseName: course.name,
    moduleId: mod.id,
    moduleName: mod.name,
    videoName: video.name,
  };
}

export interface FavoriteTarget {
  course: Course;
  module: Module;
  video: Video;
}

/**
 * Finds the lesson in the current catalog. The snapshot is display-only, so the
 * course and module in it are ignored; matching id and provider prevents the
 * same id in Drive and OneDrive from colliding.
 */
export function resolveFavorite(catalog: Catalog, favorite: Favorite): FavoriteTarget | undefined {
  for (const course of catalog.courses) {
    for (const mod of course.modules) {
      for (const video of mod.videos) {
        if (video.id !== favorite.videoId) continue;
        const provider = video.provider ?? course.provider ?? "gdrive";
        if (provider === favorite.provider) return { course, module: mod, video };
      }
    }
  }
  return undefined;
}
