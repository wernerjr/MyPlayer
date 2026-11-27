import {
  addFavorite,
  applyFavoritesResponse,
  FAVORITES_MAX,
  mergeProgress,
  removeFavorite,
  restoreFavorite,
  type Catalog,
  type CloudProvider,
  type Favorite,
  type FavoriteInput,
  type FavoritesResponse,
  type Module,
  type ProgressInput,
  type ProgressMap,
} from "@myplayer/shared";
import { ChevronLeft, ExternalLink, Menu, X } from "lucide-react";
import type { Course, Me, Video } from "@myplayer/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, HttpError } from "../lib/api";
import {
  favoriteKey,
  FAVORITES_ERROR_MESSAGE,
  FAVORITES_LIMIT_MESSAGE,
  resolveFavorite,
  toFavorite,
} from "../lib/favorites";
import { courseStats, pickVideo } from "../lib/stats";
import { CoursePicker } from "./CoursePicker";
import { CourseView } from "./CourseView";
import { Library } from "./Library";
import { Sidebar } from "./Sidebar";
import { Button, buttonClass, Spinner } from "./ui";

type LibraryView = "courses" | "favorites";

export function AppShell({ me }: { me: Me }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  /** Sequence of the newest favorites mutation sent; older responses are ignored. */
  const favoritesSequence = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryView, setLibraryView] = useState<LibraryView>("courses");
  const [error, setError] = useState<null | "scope" | "drive" | "onedrive" | "onedrive_connect">(null);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProvider, setPickerProvider] = useState<CloudProvider>("gdrive");

  const loadCatalog = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    api<Catalog>(`/api/catalog${refresh ? "?refresh=1" : ""}`)
      .then(setCatalog)
      .catch((cause) => {
        if (cause instanceof HttpError && cause.status === 401) location.assign("/auth/google");
        else if (cause instanceof HttpError && cause.status === 403 && cause.message.includes("onedrive_reauth"))
          setError("onedrive");
        else if (cause instanceof HttpError && cause.status === 403) setError("scope");
        else setError("drive");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCatalog();
    api<ProgressMap>("/api/progress")
      .then(setProgress)
      .catch((cause) => {
        if (cause instanceof HttpError && cause.status === 401) location.assign("/auth/google");
      });
    api<FavoritesResponse>("/api/favorites")
      .then((response) => setFavorites(response.favorites))
      .catch((cause) => {
        if (cause instanceof HttpError && cause.status === 401) location.assign("/auth/google");
      });
  }, [loadCatalog]);

  const favoriteKeys = useMemo(() => new Set(favorites.map((favorite) => favorite.key)), [favorites]);

  useEffect(() => {
    // Coming back from the OneDrive consent, reopen the picker or explain the failure.
    const params = new URLSearchParams(location.search);
    const status = params.get("onedrive");
    if (status !== "connected" && status !== "error") return;
    if (status === "connected") {
      setPickerProvider("onedrive");
      setPickerOpen(true);
    } else {
      setError("onedrive_connect");
    }
    history.replaceState(null, "", location.pathname);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const save = useCallback((id: string, input: ProgressInput) => {
    setProgress((current) => ({ ...current, [id]: mergeProgress(current[id], input) }));
    void fetch(`/api/progress/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const setModuleWatched = useCallback((mod: Module, watched: boolean) => {
    const videoIds = mod.videos.map((item) => item.id);
    if (videoIds.length === 0) return;
    setProgress((current) => {
      const next = { ...current };
      for (const id of videoIds) next[id] = mergeProgress(next[id], { watched });
      return next;
    });
    void fetch("/api/progress/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoIds, watched }),
    }).catch(() => {});
  }, []);

  /** Removes one favorite, restoring only that key by recency when the API fails. */
  const removeFavoriteByKey = useCallback((favorite: Favorite) => {
    const key = favorite.key;
    const sequence = ++favoritesSequence.current;
    setNotice(null);
    setFavorites((current) => removeFavorite(current, key));
    void api<FavoritesResponse>(
      `/api/favorites/${favorite.provider}/${encodeURIComponent(favorite.videoId)}`,
      { method: "DELETE" },
    )
      .then((response) =>
        setFavorites((current) =>
          applyFavoritesResponse(current, { sequence, favorites: response.favorites }, favoritesSequence.current),
        ),
      )
      .catch(() => {
        setFavorites((current) => restoreFavorite(current, favorite));
        setNotice(FAVORITES_ERROR_MESSAGE);
      });
  }, []);

  const toggleFavorite = useCallback(
    (targetCourse: Course, targetModule: Module, targetVideo: Video) => {
      const candidate = toFavorite(targetCourse, targetModule, targetVideo);
      const key = favoriteKey(candidate.provider, candidate.videoId);
      const existing = favorites.find((item) => item.key === key);
      if (existing) {
        removeFavoriteByKey(existing);
        return;
      }
      // The server is the authority; this pre-check only avoids a pointless call.
      if (favorites.length >= FAVORITES_MAX) {
        setNotice(FAVORITES_LIMIT_MESSAGE);
        return;
      }

      const sequence = ++favoritesSequence.current;
      setNotice(null);
      setFavorites((current) => addFavorite(current, candidate, Date.now()).favorites);
      const input: FavoriteInput = {
        courseId: candidate.courseId,
        courseName: candidate.courseName,
        moduleId: candidate.moduleId,
        moduleName: candidate.moduleName,
        videoName: candidate.videoName,
      };
      void api<FavoritesResponse>(
        `/api/favorites/${candidate.provider}/${encodeURIComponent(candidate.videoId)}`,
        { method: "PUT", body: JSON.stringify(input) },
      )
        .then((response) =>
          setFavorites((current) =>
            applyFavoritesResponse(current, { sequence, favorites: response.favorites }, favoritesSequence.current),
          ),
        )
        .catch((cause) => {
          setFavorites((current) => removeFavorite(current, key));
          setNotice(
            cause instanceof HttpError && cause.status === 409
              ? FAVORITES_LIMIT_MESSAGE
              : FAVORITES_ERROR_MESSAGE,
          );
        });
    },
    [favorites, removeFavoriteByKey],
  );

  const course = catalog?.courses.find((item) => item.id === courseId);
  const module = course?.modules.find((item) => item.videos.some((video) => video.id === videoId));
  const video = module?.videos.find((item) => item.id === videoId);
  const moduleId = module?.id;

  useEffect(() => {
    if (!moduleId) return;
    setOpenModules((ids) => (ids.includes(moduleId) ? ids : [...ids, moduleId]));
  }, [moduleId]);

  useEffect(() => {
    if (!catalog || !courseId) return;
    if (!catalog.courses.some((item) => item.id === courseId)) {
      setCourseId(null);
      setVideoId(null);
      setOpenModules([]);
    }
  }, [catalog, courseId]);

  function openCourse(target: Course, preferred?: string) {
    const pick = pickVideo(target, progress, preferred);
    setCourseId(target.id);
    setVideoId(pick?.id ?? null);
    setMobileOpen(false);
  }

  function openCourseById(id: string) {
    const target = catalog?.courses.find((item) => item.id === id);
    if (target) openCourse(target);
  }

  function openVideo(item: Video) {
    setVideoId(item.id);
    setMobileOpen(false);
  }

  function openFavorite(favorite: Favorite) {
    if (!catalog) return;
    const target = resolveFavorite(catalog, favorite);
    if (!target) return;
    openCourse(target.course, target.video.id);
  }

  function openLibrary(view: LibraryView = "courses") {
    setLibraryView(view);
    setCourseId(null);
    setVideoId(null);
    setOpenModules([]);
    setMobileOpen(false);
  }

  function toggleModule(id: string) {
    setOpenModules((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  const stats = course ? courseStats(course, progress) : undefined;

  const sidebar = (onClose?: () => void) => (
    <Sidebar
      me={me}
      catalog={catalog ?? undefined}
      course={course}
      progress={progress}
      activeVideoId={videoId}
      openModules={openModules}
      libraryView={libraryView}
      favoriteKeys={favoriteKeys}
      onToggleModule={toggleModule}
      onOpenVideo={openVideo}
      onOpenCourse={openCourseById}
      onOpenLibrary={openLibrary}
      onToggleFavorite={toggleFavorite}
      onClose={onClose}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      <div className="hidden lg:flex">{sidebar()}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fechar navegação"
            onClick={() => setMobileOpen(false)}
            className="fade-in absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            className="drawer-in absolute inset-y-0 left-0 flex shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
          >
            {sidebar(() => setMobileOpen(false))}
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegação"
            className="grid size-9 place-items-center rounded-[8px] text-ink-2 transition-colors duration-150 hover:bg-raised lg:hidden"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>

          <nav aria-label="Trilha" className="flex min-w-0 items-center gap-2 text-[13px]">
            {course ? (
              <button
                onClick={() => openLibrary()}
                className="-ml-1.5 flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-1 text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
              >
                <ChevronLeft size={14} strokeWidth={1.5} />
                Cursos
              </button>
            ) : (
              <span className="text-ink-2">Cursos</span>
            )}
            {course ? (
              <>
                <span className="shrink-0 text-ink-3/50">/</span>
                <span className="truncate text-ink">{course.name}</span>
              </>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {stats && stats.total > 0 ? (
              <span className="mr-2 hidden font-mono text-[11px] tabular-nums text-ink-3 sm:block">
                {stats.watched}/{stats.total} aulas
              </span>
            ) : null}
            {course?.webViewLink ? (
              <a
                href={course.webViewLink}
                target="_blank"
                rel="noreferrer"
                title={`Abrir pasta do curso no ${course.provider === "onedrive" ? "OneDrive" : "Drive"}`}
                aria-label={`Abrir pasta do curso no ${course.provider === "onedrive" ? "OneDrive" : "Drive"}`}
                className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
              >
                <ExternalLink size={15} strokeWidth={1.5} />
              </a>
            ) : null}
          </div>
        </header>

        <div
          role="status"
          aria-live="polite"
          className={
            notice
              ? "flex items-center gap-3 border-b border-line bg-raised px-4 py-2 text-[12.5px] text-ink-2 lg:px-8"
              : "sr-only"
          }
        >
          {notice}
          {notice ? (
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Fechar aviso"
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="mx-auto mt-20 max-w-[480px] px-6 text-center">
              <p className="text-[14px] text-ink-2">
                {error === "scope"
                  ? "A conta entrou sem permissão de leitura do Drive"
                  : error === "onedrive"
                    ? "O OneDrive precisa ser reconectado"
                    : error === "onedrive_connect"
                      ? "Não foi possível conectar o OneDrive"
                      : "Não foi possível ler as pastas da nuvem"}
              </p>
              {error === "scope" ? (
                <>
                  <p className="mt-2 text-[13px] leading-5 text-ink-3">
                    Entre de novo mantendo o acesso ao Drive marcado. Se o pedido não aparecer, adicione o escopo{" "}
                    <span className="font-mono text-[12px]">drive.readonly</span> em Data access no Google Cloud.
                  </p>
                  <a href="/auth/google" className={buttonClass("primary", "md", "mt-5")}>
                    Entrar de novo
                  </a>
                </>
              ) : error === "onedrive_connect" ? (
                <>
                  <p className="mt-2 text-[13px] leading-5 text-ink-3">
                    Confira a URI de redirecionamento e a permissão delegada Files.Read.All no Microsoft Entra e tente
                    de novo.
                  </p>
                  {me.onedriveReady ? (
                    <a href="/auth/microsoft" className={buttonClass("primary", "md", "mt-5")}>
                      Tentar de novo
                    </a>
                  ) : null}
                </>
              ) : error === "onedrive" ? (
                <>
                  <p className="mt-2 text-[13px] leading-5 text-ink-3">
                    {me.onedriveReady
                      ? "A conexão com a conta Microsoft expirou ou foi revogada. Reconecte para voltar a ler as pastas."
                      : "O OneDrive não está configurado no servidor. Preencha MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET no .env."}
                  </p>
                  {me.onedriveReady ? (
                    <a href="/auth/microsoft" className={buttonClass("primary", "md", "mt-5")}>
                      Reconectar OneDrive
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-2 text-[13px] leading-5 text-ink-3">
                    Confira se a conta tem acesso à pasta e tente de novo.
                  </p>
                  <Button className="mt-5" onClick={() => loadCatalog(true)}>
                    Tentar de novo
                  </Button>
                </>
              )}
            </div>
          ) : !catalog ? (
            <div className="grid min-h-[60vh] place-items-center">
              {loading ? <Spinner label="Lendo a pasta" /> : null}
            </div>
          ) : course ? (
            <CourseView
              course={course}
              module={module}
              video={video}
              progress={progress}
              favoriteKeys={favoriteKeys}
              onOpenVideo={openVideo}
              onSave={save}
              onSetModuleWatched={setModuleWatched}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <Library
              catalog={catalog}
              progress={progress}
              loading={loading}
              view={libraryView}
              favorites={favorites}
              onOpenCourse={openCourse}
              onOpenFavorite={openFavorite}
              onRemoveFavorite={removeFavoriteByKey}
              onSelectCourses={() => setPickerOpen(true)}
              onRefresh={() => loadCatalog(true)}
            />
          )}
        </div>
      </main>

      {pickerOpen ? (
        <CoursePicker
          me={me}
          initialProvider={pickerProvider}
          onClose={() => setPickerOpen(false)}
          onSaved={() => loadCatalog(true)}
        />
      ) : null}
    </div>
  );
}
