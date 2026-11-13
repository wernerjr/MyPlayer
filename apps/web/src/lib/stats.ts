import type { Catalog, Course, Module, ProgressMap, Video } from "@myplayer/shared";

export function moduleStats(mod: Module, progress: ProgressMap) {
  const watched = mod.videos.filter((video) => progress[video.id]?.watched).length;
  return { watched, total: mod.videos.length, ratio: mod.videos.length ? watched / mod.videos.length : 0 };
}

export function courseStats(course: Course, progress: ProgressMap) {
  const videos = course.modules.flatMap((mod) => mod.videos);
  const watched = videos.filter((video) => progress[video.id]?.watched).length;
  const durationMs = videos.reduce((sum, video) => sum + (video.durationMs ?? 0), 0);
  return {
    watched,
    total: videos.length,
    ratio: videos.length ? watched / videos.length : 0,
    durationMs,
  };
}

export function nextVideo(course: Course, videoId: string) {
  const videos = course.modules.flatMap((mod) => mod.videos);
  const index = videos.findIndex((video) => video.id === videoId);
  return index >= 0 ? videos[index + 1] : undefined;
}

export function resumePoint(catalog: Catalog, progress: ProgressMap) {
  let best: { course: Course; module: Module; video: Video; position: number; updatedAt: number } | undefined;
  for (const course of catalog.courses) {
    for (const mod of course.modules) {
      for (const video of mod.videos) {
        const row = progress[video.id];
        if (!row || row.watched || row.position < 10) continue;
        if (!best || row.updatedAt > best.updatedAt) {
          best = { course, module: mod, video, position: row.position, updatedAt: row.updatedAt };
        }
      }
    }
  }
  return best;
}

/** The video a course should open on: the one asked for, the latest unfinished one, else the first unwatched one. */
export function pickVideo(course: Course, progress: ProgressMap, prefer?: string) {
  const videos = course.modules.flatMap((mod) => mod.videos);
  if (prefer) {
    const chosen = videos.find((video) => video.id === prefer);
    if (chosen) return chosen;
  }
  const resumable = videos
    .filter((video) => {
      const row = progress[video.id];
      return row && !row.watched && row.position >= 10;
    })
    .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0));
  return resumable[0] ?? videos.find((video) => !progress[video.id]?.watched) ?? videos[0];
}
