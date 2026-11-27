import { FAVORITES_MAX, type Catalog, type Course, type Favorite, type Module, type ProgressMap } from "@myplayer/shared";
import { ArrowRight, FolderTree, RefreshCw, Star } from "lucide-react";
import { useEffect, useRef } from "react";
import { resolveFavorite } from "../lib/favorites";
import { clock, clockMs, span } from "../lib/format";
import { courseStats, moduleStats, resumePoint } from "../lib/stats";
import { Button, cn } from "./ui";

interface LibraryProps {
  catalog: Catalog;
  progress: ProgressMap;
  loading: boolean;
  view: "courses" | "favorites";
  favorites: Favorite[];
  onOpenCourse: (course: Course, videoId?: string) => void;
  onOpenFavorite: (favorite: Favorite) => void;
  onRemoveFavorite: (favorite: Favorite) => void;
  onSelectCourses: () => void;
  onRefresh: () => void;
}

export function Library({
  catalog,
  progress,
  loading,
  view,
  favorites,
  onOpenCourse,
  onOpenFavorite,
  onRemoveFavorite,
  onSelectCourses,
  onRefresh,
}: LibraryProps) {
  const favoritesRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (view === "favorites") favoritesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);
  const resume = resumePoint(catalog, progress);
  const totals = catalog.courses.reduce(
    (sum, course) => {
      const stats = courseStats(course, progress);
      return { watched: sum.watched + stats.watched, total: sum.total + stats.total, durationMs: sum.durationMs + stats.durationMs };
    },
    { watched: 0, total: 0, durationMs: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 lg:px-8 lg:py-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-8 tracking-[-0.01em] text-ink">Cursos</h1>
          <p className="mt-2 text-[13px] text-ink-2">
            {totals.total === 0 ? (
              "Nenhuma aula ainda"
            ) : (
              <>
                <span className="font-mono tabular-nums">{totals.watched}</span> de{" "}
                <span className="font-mono tabular-nums">{totals.total}</span> aulas assistidas
                {totals.durationMs > 0 ? ` · ${span(totals.durationMs)} de vídeo` : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {catalog.courses.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={onSelectCourses}>
              <FolderTree size={14} strokeWidth={1.5} />
              Escolher pastas
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} strokeWidth={1.5} className={cn(loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {resume ? (
        <button
          onClick={() => onOpenCourse(resume.course, resume.video.id)}
          className="group relative mt-8 block w-full overflow-hidden rounded-[16px] border border-line bg-card p-6 text-left transition-colors duration-150 hover:bg-raised/40"
        >
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[12px] text-ink-3">Continuar de onde parou</p>
              <p className="mt-2 truncate text-[17px] font-medium leading-6 text-ink">{resume.course.name}</p>
              <p className="mt-1 truncate text-[13px] text-ink-2">
                {resume.module.name} · {resume.video.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 pb-0.5">
              <span className="font-mono text-[11px] tabular-nums text-ink-3">
                {clock(resume.position)}
                <span className="text-ink-3/60"> / {clockMs(resume.video.durationMs)}</span>
              </span>
              <span className="grid size-9 place-items-center rounded-full border border-line bg-raised text-ink transition-transform duration-150 group-hover:translate-x-0.5">
                <ArrowRight size={16} strokeWidth={1.5} />
              </span>
            </div>
          </div>
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
            <span
              className="block h-full bg-amber"
              style={{
                width: `${Math.min(100, (resume.position / (resume.video.durationMs ? resume.video.durationMs / 1000 : 1)) * 100)}%`,
              }}
            />
          </span>
        </button>
      ) : null}

      {favorites.length > 0 ? (
        <section ref={favoritesRef} aria-labelledby="favorites-heading" className="mt-8 scroll-mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="favorites-heading" className="text-[15px] font-medium text-ink">
              Favoritas
            </h2>
            <p className="font-mono text-[11px] tabular-nums text-ink-3">
              {favorites.length}/{FAVORITES_MAX}
            </p>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">
            {favorites.map((favorite) => {
              const target = resolveFavorite(catalog, favorite);
              return (
                <li key={favorite.key} className="flex items-center gap-3 px-4 py-3">
                  {target ? (
                    <button
                      onClick={() => onOpenFavorite(favorite)}
                      className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-5 text-ink-2 transition-colors group-hover:text-ink">
                          {favorite.videoName}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">
                          {favorite.courseName} · {favorite.moduleName}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        strokeWidth={1.5}
                        className="shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] leading-5 text-ink-2">{favorite.videoName}</span>
                        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                          Indisponível
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
                        {favorite.courseName} · {favorite.moduleName}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveFavorite(favorite)}
                    aria-label={`Remover ${favorite.videoName} dos favoritos`}
                    title="Remover dos favoritos"
                    className="grid size-7 shrink-0 place-items-center rounded-[6px] text-amber transition-colors duration-150 hover:bg-white/[0.06]"
                  >
                    <Star size={14} strokeWidth={1.5} className="fill-current" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {catalog.courses.length === 0 ? (
        <div className="mx-auto mt-10 max-w-[560px] rounded-[16px] border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[14px] text-ink-2">Nenhum curso selecionado</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-[13px] leading-5 text-ink-3">
            Marque as pastas do Drive ou do OneDrive que são cursos. As subpastas de cada uma viram módulos e os
            vídeos entram na ordem dos arquivos.
          </p>
          <Button variant="primary" className="mt-5" onClick={onSelectCourses}>
            Escolher pastas
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <CourseCard key={course.id} course={course} progress={progress} onOpen={() => onOpenCourse(course)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, progress, onOpen }: { course: Course; progress: ProgressMap; onOpen: () => void }) {
  const stats = courseStats(course, progress);

  return (
    <button
      onClick={onOpen}
      className="group flex flex-col rounded-[14px] border border-line bg-card p-5 text-left transition-colors duration-150 hover:bg-raised/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[15px] font-medium leading-5 text-ink">{course.name}</h2>
        <span className="mt-px shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
          {Math.round(stats.ratio * 100)}%
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[11px] leading-4 text-ink-3">
        {course.modules.length} {course.modules.length === 1 ? "módulo" : "módulos"} ·{" "}
        {stats.watched}/{stats.total} aulas
        {stats.durationMs > 0 ? ` · ${span(stats.durationMs)}` : ""}
      </p>
      <div className="mt-auto pt-5">
        <ModuleRail modules={course.modules} progress={progress} />
      </div>
    </button>
  );
}

/** One segment per module: the course read as a tape, not a single percentage. */
function ModuleRail({ modules, progress }: { modules: Module[]; progress: ProgressMap }) {
  return (
    <div className="flex h-1 gap-1" aria-hidden="true">
      {modules.map((mod) => {
        const stats = moduleStats(mod, progress);
        return (
          <span key={mod.id} className="relative h-full flex-1 overflow-hidden rounded-[2px] bg-white/8">
            <span className="absolute inset-y-0 left-0 bg-amber" style={{ width: `${stats.ratio * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}
