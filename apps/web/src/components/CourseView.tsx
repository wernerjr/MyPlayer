import type { Attachment, CloudProvider, Course, Module, ProgressInput, ProgressMap, Video } from "@myplayer/shared";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clock, clockMs, percentOf, span } from "../lib/format";
import { moduleStats, nextVideo } from "../lib/stats";
import { StatusIcon } from "./Sidebar";
import { Button, buttonClass, cn } from "./ui";

const cloudName = (provider?: CloudProvider) => (provider === "onedrive" ? "OneDrive" : "Drive");

interface CourseViewProps {
  course?: Course;
  module?: Module;
  video?: Video;
  progress: ProgressMap;
  onOpenVideo: (video: Video) => void;
  onSave: (videoId: string, input: ProgressInput) => void;
  onSetModuleWatched: (mod: Module, watched: boolean) => void;
}

export function CourseView({ course, module, video, progress, onOpenVideo, onSave, onSetModuleWatched }: CourseViewProps) {
  if (!course || !module || !video) {
    return (
      <div className="grid min-h-full place-items-center px-6 py-20">
        <div className="text-center">
          <p className="text-[14px] text-ink-2">Escolha uma aula na lateral</p>
          <p className="mt-1.5 text-[12.5px] text-ink-3">As aulas aparecem na ordem dos módulos</p>
        </div>
      </div>
    );
  }

  const row = progress[video.id];
  const stats = moduleStats(module, progress);
  const allWatched = stats.total > 0 && stats.watched === stats.total;
  const next = nextVideo(course, video.id);
  const resumable = !row?.watched && (row?.position ?? 0) > 10;
  const moduleIndex = course.modules.indexOf(module) + 1;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-6 lg:px-8 lg:py-7">
      <VideoPlayer
        key={video.id}
        video={video}
        startAt={row?.position ?? 0}
        onSave={(input) => onSave(video.id, input)}
      />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-ink-3">{module.name}</p>
          <h1 className="mt-1.5 text-[21px] font-medium leading-7 text-ink">{video.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-3">
            <span>{clockMs(video.durationMs ?? (row?.duration ?? 0) * 1000)}</span>
            {row?.watched ? (
              <>
                <span className="text-ink-3/50">·</span>
                <span className="text-ink-2">Assistido</span>
              </>
            ) : resumable ? (
              <>
                <span className="text-ink-3/50">·</span>
                <span>Retomar em {clock(row?.position)}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            aria-pressed={Boolean(row?.watched)}
            title={row?.watched ? "Desmarcar como assistido" : "Marcar como assistido"}
            onClick={() => onSave(video.id, { watched: !row?.watched })}
          >
            <Check size={15} strokeWidth={1.5} className={cn(row?.watched && "text-amber")} />
            {row?.watched ? "Assistido" : "Marcar assistido"}
          </Button>
          {next ? (
            <Button variant="primary" onClick={() => onOpenVideo(next)}>
              Próxima aula
              <ArrowRight size={15} strokeWidth={1.5} />
            </Button>
          ) : null}
          {video.webViewLink ? (
            <a
              href={video.webViewLink}
              target="_blank"
              rel="noreferrer"
              title={`Abrir no ${cloudName(video.provider)}`}
              aria-label={`Abrir no ${cloudName(video.provider)}`}
              className={buttonClass("ghost", "icon")}
            >
              <ExternalLink size={15} strokeWidth={1.5} />
            </a>
          ) : null}
        </div>
      </div>

      <section className="mt-8 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-medium text-ink">
              Módulo {String(moduleIndex).padStart(2, "0")} · {module.name}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-ink-3">
              {stats.watched}/{stats.total} aulas
              {stats.total > 0 ? ` · ${span(module.videos.reduce((sum, item) => sum + (item.durationMs ?? 0), 0))}` : ""}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onSetModuleWatched(module, !allWatched)}>
            {allWatched ? "Desmarcar módulo" : "Marcar módulo como assistido"}
          </Button>
        </div>

        <div className={cn("mt-4 grid gap-6", module.attachments.length > 0 && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
          <ol className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">
            {module.videos.map((item, index) => {
              const itemRow = progress[item.id];
              const active = item.id === video.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onOpenVideo(item)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
                      active ? "bg-raised" : "hover:bg-raised/40",
                    )}
                  >
                    <span
                      className={cn(
                        "w-5 shrink-0 font-mono text-[11px] tabular-nums",
                        active ? "text-amber" : "text-ink-3",
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[13px] leading-5",
                          active ? "text-ink" : itemRow?.watched ? "text-ink-3 group-hover:text-ink-2" : "text-ink-2 group-hover:text-ink",
                        )}
                      >
                        {item.name}
                      </span>
                      {!itemRow?.watched && percentOf(itemRow?.position ?? 0, itemRow?.duration ?? 0) > 2 ? (
                        <span className="mt-1.5 block h-0.5 w-28 overflow-hidden rounded-[1px] bg-white/10">
                          <span
                            className="block h-full bg-amber"
                            style={{ width: `${percentOf(itemRow.position, itemRow.duration)}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
                      {clockMs(item.durationMs ?? (itemRow?.duration ?? 0) * 1000)}
                    </span>
                    <StatusIcon watched={itemRow?.watched} started={!active && (itemRow?.position ?? 0) > 5} />
                  </button>
                </li>
              );
            })}
          </ol>

          {module.attachments.length > 0 ? <Materials attachments={module.attachments} /> : null}
        </div>
      </section>
    </div>
  );
}

function Materials({ attachments }: { attachments: Attachment[] }) {
  return (
    <aside>
      <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <Paperclip size={15} strokeWidth={1.5} className="text-ink-3" />
        Materiais
      </h3>
      <ul className="mt-3 space-y-1">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a
              href={attachment.webViewLink}
              target="_blank"
              rel="noreferrer"
              title={attachment.name}
              className="group -mx-2 flex items-center gap-2.5 rounded-[8px] px-2 py-2 transition-colors duration-150 hover:bg-raised"
            >
              <FileIcon mimeType={attachment.mimeType} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 transition-colors group-hover:text-ink">
                {attachment.name}
              </span>
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
                className="shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              />
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const props = { size: 16, strokeWidth: 1.5, className: "shrink-0 text-ink-3" } as const;
  if (mimeType.startsWith("image/")) return <FileImage {...props} />;
  if (mimeType.includes("pdf") || mimeType.startsWith("text/")) return <FileText {...props} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return <FileSpreadsheet {...props} />;
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return <FileArchive {...props} />;
  if (mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("javascript")) return <FileCode {...props} />;
  return <File {...props} />;
}

function VideoPlayer({
  video,
  startAt,
  onSave,
}: {
  video: Video;
  startAt: number;
  onSave: (input: ProgressInput) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const save = useRef(onSave);
  save.current = onSave;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const tick = window.setInterval(() => {
      if (!element.paused && !element.ended && element.duration) {
        save.current({ position: element.currentTime, duration: element.duration });
      }
    }, 10_000);

    const flush = () => {
      if (element.duration && element.currentTime > 0) {
        save.current({ position: element.currentTime, duration: element.duration });
      }
    };

    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line bg-black">
      <video
        ref={ref}
        className="aspect-video w-full"
        controls
        playsInline
        preload="metadata"
        aria-label={`Aula: ${video.name}`}
        src={`/api/media/${encodeURIComponent(video.id)}?provider=${video.provider ?? "gdrive"}`}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          if (startAt > 5 && startAt < element.duration - 10) element.currentTime = startAt;
        }}
        onEnded={() => {
          const duration = ref.current?.duration;
          if (duration) save.current({ position: duration, duration, watched: true });
        }}
        onPause={(event) => {
          const element = event.currentTarget;
          if (element.duration && element.currentTime > 0 && !element.ended) {
            save.current({ position: element.currentTime, duration: element.duration });
          }
        }}
        onError={() => setFailed(true)}
      />

      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center">
          <div>
            <p className="text-[14px] text-ink-2">Não foi possível abrir este vídeo aqui</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-5 text-ink-3">
              O formato pode não ser suportado pelo navegador, ou o download está bloqueado na nuvem.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFailed(false);
                  ref.current?.load();
                }}
              >
                Tentar de novo
              </Button>
              {video.webViewLink ? (
                <a href={video.webViewLink} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
                  Abrir no {cloudName(video.provider)}
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
