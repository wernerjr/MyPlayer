import type { Catalog, Course, Me, Module, ProgressMap, Video } from "@myplayer/shared";
import {
  ArrowUpRight,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  FolderTree,
  LogOut,
  Paperclip,
  Star,
  X,
} from "lucide-react";
import { favoriteKey } from "../lib/favorites";
import { clockMs, initials } from "../lib/format";
import { moduleStats } from "../lib/stats";
import { cn } from "./ui";

interface SidebarProps {
  me: Me;
  catalog?: Catalog;
  /** The course being watched. Without it the sidebar lists every course. */
  course?: Course;
  progress: ProgressMap;
  activeVideoId?: string | null;
  openModules: string[];
  libraryView: "courses" | "favorites";
  favoriteKeys: Set<string>;
  onToggleModule: (id: string) => void;
  onOpenVideo: (video: Video) => void;
  onOpenCourse: (courseId: string) => void;
  onOpenLibrary: (view?: "courses" | "favorites") => void;
  onToggleFavorite: (course: Course, mod: Module, video: Video) => void;
  onClose?: () => void;
}

export function Sidebar({
  me,
  catalog,
  course,
  progress,
  activeVideoId,
  openModules,
  libraryView,
  favoriteKeys,
  onToggleModule,
  onOpenVideo,
  onOpenCourse,
  onOpenLibrary,
  onToggleFavorite,
  onClose,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-deep">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <button onClick={() => onOpenLibrary()} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          MyPlayer
        </button>
        {onClose ? (
          <button
            onClick={onClose}
            autoFocus
            aria-label="Fechar navegação"
            className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="space-y-0.5 px-3">
        <button
          onClick={() => onOpenLibrary("courses")}
          aria-current={!course && libraryView === "courses" ? "page" : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-[8px] px-2 text-left text-[13px] transition-colors duration-150",
            !course && libraryView === "courses" ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised hover:text-ink",
          )}
        >
          <FolderTree
            size={16}
            strokeWidth={1.5}
            className={cn("shrink-0", !course && libraryView === "courses" ? "text-ink-2" : "text-ink-3")}
          />
          Cursos
        </button>
        <button
          onClick={() => onOpenLibrary("favorites")}
          aria-current={!course && libraryView === "favorites" ? "page" : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-[8px] px-2 text-left text-[13px] transition-colors duration-150",
            !course && libraryView === "favorites" ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised hover:text-ink",
          )}
        >
          <Star
            size={16}
            strokeWidth={1.5}
            className={cn(
              "shrink-0",
              !course && libraryView === "favorites" ? "fill-current text-amber" : "text-ink-3",
            )}
          />
          Favoritas
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto pb-4">
        {!catalog ? null : course ? (
          <>
            <div className="px-5 pb-3">
              <p className="truncate text-[13px] font-medium text-ink" title={course.name}>
                {course.name}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                {course.modules.length} {course.modules.length === 1 ? "módulo" : "módulos"}
              </p>
            </div>
            {course.modules.map((mod, index) => (
              <ModuleGroup
                key={mod.id}
                course={course}
                mod={mod}
                index={index}
                open={openModules.includes(mod.id)}
                progress={progress}
                activeVideoId={activeVideoId}
                favoriteKeys={favoriteKeys}
                onToggle={() => onToggleModule(mod.id)}
                onOpenVideo={onOpenVideo}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </>
        ) : catalog.courses.length === 0 ? (
          <p className="px-5 text-[12.5px] leading-5 text-ink-3">Nenhuma pasta marcada</p>
        ) : (
          catalog.courses.map((item) => {
            const watched = item.modules.reduce((sum, mod) => sum + moduleStats(mod, progress).watched, 0);
            const total = item.modules.reduce((sum, mod) => sum + mod.videos.length, 0);
            return (
              <button
                key={item.id}
                onClick={() => onOpenCourse(item.id)}
                title={item.name}
                className="group flex w-full items-center gap-3 px-5 py-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 transition-colors group-hover:text-ink">
                  {item.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
                  {watched}/{total}
                </span>
              </button>
            );
          })
        )}
      </nav>

      <div className="mt-auto shrink-0 border-t border-line px-4 py-3">
        <div className="flex items-center gap-3">
          {me.picture ? (
            <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
          ) : (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-medium text-ink-2">
              {initials(me.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] text-ink-2">{me.name}</p>
            <p className="truncate font-mono text-[10.5px] text-ink-3">{me.email}</p>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
            >
              <LogOut size={15} strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

interface ModuleGroupProps {
  course: Course;
  mod: Module;
  index: number;
  open: boolean;
  progress: ProgressMap;
  activeVideoId?: string | null;
  favoriteKeys: Set<string>;
  onToggle: () => void;
  onOpenVideo: (video: Video) => void;
  onToggleFavorite: (course: Course, mod: Module, video: Video) => void;
}

function ModuleGroup({
  course,
  mod,
  index,
  open,
  progress,
  activeVideoId,
  favoriteKeys,
  onToggle,
  onOpenVideo,
  onToggleFavorite,
}: ModuleGroupProps) {
  const stats = moduleStats(mod, progress);

  return (
    <section>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 px-5 py-2 text-left"
      >
        <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2 transition-colors group-hover:text-ink">
          {mod.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
          {stats.watched}/{stats.total}
        </span>
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className={cn("shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-90")}
        />
      </button>

      {open ? (
        <div className="pb-2">
          {mod.videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              active={video.id === activeVideoId}
              progress={progress[video.id]}
              favorited={favoriteKeys.has(favoriteKey(video.provider ?? course.provider ?? "gdrive", video.id))}
              onClick={() => onOpenVideo(video)}
              onToggleFavorite={() => onToggleFavorite(course, mod, video)}
            />
          ))}
          {mod.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.webViewLink}
              target="_blank"
              rel="noreferrer"
              title={attachment.name}
              className="group flex w-full items-center gap-3 py-2 pr-5 pl-5 text-left"
            >
              <Paperclip size={16} strokeWidth={1.5} className="shrink-0 text-ink-3/70" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3 transition-colors group-hover:text-ink-2">
                {attachment.name}
              </span>
              <ArrowUpRight
                size={13}
                strokeWidth={1.5}
                className="shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              />
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function VideoRow({
  video,
  active,
  progress,
  favorited,
  onClick,
  onToggleFavorite,
}: {
  video: Video;
  active: boolean;
  progress?: ProgressMap[string];
  favorited: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center transition-colors duration-150",
        active ? "bg-raised" : "hover:bg-white/[0.03]",
      )}
    >
      {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-amber" /> : null}
      <button
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 pl-5 text-left"
      >
        <StatusIcon watched={progress?.watched} started={(progress?.position ?? 0) > 5} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] leading-5",
            active ? "text-ink" : progress?.watched ? "text-ink-3 group-hover:text-ink-2" : "text-ink-2 group-hover:text-ink",
          )}
        >
          {video.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">{clockMs(video.durationMs)}</span>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorited}
        aria-label={favorited ? `Remover ${video.name} dos favoritos` : `Favoritar ${video.name}`}
        title={favorited ? "Remover dos favoritos" : "Favoritar aula"}
        className={cn(
          "mr-2 grid size-7 shrink-0 place-items-center rounded-[6px] transition-colors duration-150 hover:bg-white/[0.06]",
          favorited ? "text-amber hover:text-amber" : "text-ink-3 hover:text-ink",
        )}
      >
        <Star size={14} strokeWidth={1.5} className={cn(favorited && "fill-current")} />
      </button>
    </div>
  );
}

export function StatusIcon({ watched, started }: { watched?: boolean; started?: boolean }) {
  if (watched) return <CircleCheck size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />;
  if (started) return <CircleDot size={16} strokeWidth={1.5} className="shrink-0 text-amber" />;
  return <Circle size={16} strokeWidth={1.5} className="shrink-0 text-ink-3/50" />;
}
