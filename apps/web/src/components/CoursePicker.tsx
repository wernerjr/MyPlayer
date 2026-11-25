import { cloudKey, type CloudFolder, type CloudProvider, type Me } from "@myplayer/shared";
import { ArrowLeft, Check, ChevronRight, Folder, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, HttpError } from "../lib/api";
import { Button, buttonClass, cn, Spinner } from "./ui";

const ROOT_NAME: Record<CloudProvider, string> = {
  gdrive: "Google Drive",
  onedrive: "OneDrive",
};

const root = (provider: CloudProvider): CloudFolder => ({ provider, id: "root", name: ROOT_NAME[provider] });
const keyOf = (folder: CloudFolder) => cloudKey(folder.provider, folder.id);

interface CoursePickerProps {
  me: Me;
  initialProvider?: CloudProvider;
  onClose: () => void;
  onSaved: () => void;
}

export function CoursePicker({ me, initialProvider = "gdrive", onClose, onSaved }: CoursePickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState<CloudProvider>(initialProvider);
  const [stack, setStack] = useState<CloudFolder[]>([root(initialProvider)]);
  const [folders, setFolders] = useState<CloudFolder[] | null>(null);
  const [selected, setSelected] = useState<CloudFolder[] | null>(null);
  const [listError, setListError] = useState<null | "generic" | "onedrive">(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const current = stack[stack.length - 1]!;
  const connected = provider === "gdrive" || Boolean(me.onedrive);
  const showOneDrive = Boolean(me.onedriveReady || me.onedrive);
  const isSelected = (folder: CloudFolder) => Boolean(selected?.some((item) => keyOf(item) === keyOf(folder)));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    api<{ folders: CloudFolder[] }>("/api/selection")
      .then((data) => setSelected(data.folders))
      .catch(() => setSaveError(true));
  }, []);

  useEffect(() => {
    if (!connected) {
      setFolders([]);
      setListError(null);
      return;
    }
    let alive = true;
    setFolders(null);
    setListError(null);
    api<{ folders: CloudFolder[] }>(
      `/api/folders?provider=${current.provider}&parent=${encodeURIComponent(current.id)}`,
    )
      .then((data) => {
        if (alive) setFolders(data.folders);
      })
      .catch((cause) => {
        if (!alive) return;
        setListError(
          cause instanceof HttpError && cause.status === 403 && cause.message.includes("onedrive_reauth")
            ? "onedrive"
            : "generic",
        );
        setFolders([]);
      });
    return () => {
      alive = false;
    };
  }, [current.id, current.provider, attempt, connected]);

  function close() {
    dialog.current?.close();
  }

  function switchProvider(next: CloudProvider) {
    if (next === provider) return;
    setProvider(next);
    setStack([root(next)]);
  }

  function toggle(folder: CloudFolder) {
    setSelected((list) => {
      if (!list) return list;
      return list.some((item) => keyOf(item) === keyOf(folder))
        ? list.filter((item) => keyOf(item) !== keyOf(folder))
        : [...list, folder];
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setSaveError(false);
    try {
      await api("/api/selection", {
        method: "PUT",
        body: JSON.stringify({ folderIds: selected.map(keyOf) }),
      });
      onSaved();
      close();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label="Pastas de cursos"
      className="m-auto w-[min(780px,calc(100vw-24px))] overflow-hidden rounded-[16px] border border-line bg-page p-0 text-ink"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium text-ink">Pastas de cursos</h2>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-3">
              Marque as pastas que são cursos no Drive ou no OneDrive. As subpastas de cada uma viram módulos.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        {showOneDrive ? (
          <div className="flex items-center gap-1 border-b border-line px-3 py-2" aria-label="Nuvem">
            {(["gdrive", "onedrive"] as const).map((item) => (
              <button
                key={item}
                onClick={() => switchProvider(item)}
                aria-pressed={provider === item}
                className={cn(
                  "h-8 rounded-[8px] px-3 text-[12.5px] transition-colors duration-150",
                  provider === item ? "bg-raised text-ink" : "text-ink-3 hover:bg-raised/50 hover:text-ink-2",
                )}
              >
                {ROOT_NAME[item]}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_250px] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-5 py-2.5">
              {stack.length > 1 ? (
                <button
                  onClick={() => setStack(stack.slice(0, -1))}
                  aria-label="Voltar para a pasta anterior"
                  className="grid size-7 shrink-0 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink"
                >
                  <ArrowLeft size={15} strokeWidth={1.5} />
                </button>
              ) : null}
              <nav aria-label="Pastas" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                {stack.map((folder, index) => (
                  <span key={keyOf(folder)} className="flex shrink-0 items-center gap-1.5">
                    {index > 0 ? <ChevronRight size={12} strokeWidth={1.5} className="text-ink-3/60" /> : null}
                    {index === stack.length - 1 ? (
                      <span className="text-[12px] text-ink-2">{folder.name}</span>
                    ) : (
                      <button
                        onClick={() => setStack(stack.slice(0, index + 1))}
                        className="text-[12px] text-ink-3 transition-colors duration-150 hover:text-ink"
                      >
                        {folder.name}
                      </button>
                    )}
                  </span>
                ))}
              </nav>

              {current.id !== "root" ? (
                <button
                  onClick={() => toggle(current)}
                  className={buttonClass("ghost", "sm", "shrink-0")}
                  aria-pressed={isSelected(current)}
                >
                  <Check size={14} strokeWidth={1.5} className={cn(isSelected(current) && "text-amber")} />
                  {isSelected(current) ? "Selecionada" : "Selecionar esta pasta"}
                </button>
              ) : null}
            </div>

            <div className="flex-1 p-2 lg:overflow-y-auto">
              {!connected ? (
                <div className="px-3 py-8">
                  <p className="text-[13px] text-ink-2">O OneDrive não está conectado nesta conta</p>
                  <p className="mt-1.5 max-w-[48ch] text-[12.5px] leading-5 text-ink-3">
                    Conecte a conta Microsoft para navegar pelas pastas e marcar cursos. O acesso é somente leitura.
                  </p>
                  <a href="/auth/microsoft" className={buttonClass("primary", "sm", "mt-4")}>
                    Conectar OneDrive
                  </a>
                </div>
              ) : folders === null ? (
                <div className="grid min-h-[180px] place-items-center">
                  <Spinner label="Lendo pastas" />
                </div>
              ) : listError ? (
                <div className="px-3 py-6">
                  <p className="text-[13px] text-ink-2">
                    {listError === "onedrive"
                      ? "O OneDrive precisa ser reconectado"
                      : "Não foi possível listar as pastas"}
                  </p>
                  {listError === "onedrive" ? (
                    me.onedriveReady ? (
                      <a href="/auth/microsoft" className={buttonClass("secondary", "sm", "mt-3")}>
                        Reconectar OneDrive
                      </a>
                    ) : (
                      <p className="mt-1.5 text-[12px] leading-5 text-ink-3">
                        Preencha MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET no .env para usar o OneDrive.
                      </p>
                    )
                  ) : (
                    <Button size="sm" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
                      Tentar de novo
                    </Button>
                  )}
                </div>
              ) : folders.length === 0 ? (
                <p className="px-3 py-6 text-[13px] text-ink-3">Nenhuma subpasta aqui</p>
              ) : (
                folders.map((folder) => (
                  <div
                    key={keyOf(folder)}
                    className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(folder)}
                      onChange={() => toggle(folder)}
                      aria-label={`Selecionar ${folder.name}`}
                      className="ml-1 size-4 shrink-0 cursor-pointer accent-[var(--color-amber)]"
                    />
                    <button
                      onClick={() => setStack([...stack, folder])}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-1 py-1 text-left"
                    >
                      <Folder size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">
                        {folder.name}
                      </span>
                      <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-ink-3/60" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col border-t border-line lg:border-t-0 lg:border-l">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-[12px] text-ink-3">Selecionadas</p>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">{selected?.length ?? 0}</span>
            </div>
            <div className="flex-1 p-2 lg:overflow-y-auto">
              {selected === null ? null : selected.length === 0 ? (
                <p className="px-2 py-4 text-[12.5px] leading-5 text-ink-3">Nenhuma pasta marcada ainda</p>
              ) : (
                selected.map((folder) => (
                  <div
                    key={keyOf(folder)}
                    className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
                  >
                    <Folder size={15} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={folder.name}>
                      {folder.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
                      {folder.provider === "onedrive" ? "OneDrive" : "Drive"}
                    </span>
                    <button
                      onClick={() => toggle(folder)}
                      aria-label={`Remover ${folder.name}`}
                      className="grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:text-ink"
                    >
                      <X size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-5 py-3.5">
          <p className={cn("text-[12px]", saveError ? "text-danger" : "hidden text-ink-3 sm:block")}>
            {saveError ? "Não foi possível salvar. Tente de novo." : "As pastas marcadas viram cursos"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} disabled={saving || !selected}>
              {saving ? "Salvando" : "Salvar"}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
