import { ArrowLeft, Check, ChevronRight, Folder, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Button, buttonClass, cn, Spinner } from "./ui";

interface FolderRef {
  id: string;
  name: string;
}

interface CoursePickerProps {
  onClose: () => void;
  onSaved: () => void;
}

export function CoursePicker({ onClose, onSaved }: CoursePickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stack, setStack] = useState<FolderRef[]>([{ id: "root", name: "Meu Drive" }]);
  const [folders, setFolders] = useState<FolderRef[] | null>(null);
  const [selected, setSelected] = useState<FolderRef[] | null>(null);
  const [listError, setListError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const current = stack[stack.length - 1]!;
  const isSelected = (id: string) => Boolean(selected?.some((folder) => folder.id === id));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    api<{ folders: FolderRef[] }>("/api/selection")
      .then((data) => setSelected(data.folders))
      .catch(() => setSaveError(true));
  }, []);

  useEffect(() => {
    let alive = true;
    setFolders(null);
    setListError(false);
    api<{ folders: FolderRef[] }>(`/api/folders?parent=${encodeURIComponent(current.id)}`)
      .then((data) => {
        if (alive) setFolders(data.folders);
      })
      .catch(() => {
        if (!alive) return;
        setListError(true);
        setFolders([]);
      });
    return () => {
      alive = false;
    };
  }, [current.id, attempt]);

  function close() {
    dialog.current?.close();
  }

  function toggle(folder: FolderRef) {
    setSelected((list) => {
      if (!list) return list;
      return list.some((item) => item.id === folder.id)
        ? list.filter((item) => item.id !== folder.id)
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
        body: JSON.stringify({ folderIds: selected.map((folder) => folder.id) }),
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
              Marque as pastas que são cursos. As subpastas de cada uma viram módulos.
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
                  <span key={folder.id} className="flex shrink-0 items-center gap-1.5">
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
                  aria-pressed={isSelected(current.id)}
                >
                  <Check size={14} strokeWidth={1.5} className={cn(isSelected(current.id) && "text-amber")} />
                  {isSelected(current.id) ? "Selecionada" : "Selecionar esta pasta"}
                </button>
              ) : null}
            </div>

            <div className="flex-1 p-2 lg:overflow-y-auto">
              {folders === null ? (
                <div className="grid min-h-[180px] place-items-center">
                  <Spinner label="Lendo pastas" />
                </div>
              ) : listError ? (
                <div className="px-3 py-6">
                  <p className="text-[13px] text-ink-2">Não foi possível listar as pastas</p>
                  <Button size="sm" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
                    Tentar de novo
                  </Button>
                </div>
              ) : folders.length === 0 ? (
                <p className="px-3 py-6 text-[13px] text-ink-3">Nenhuma subpasta aqui</p>
              ) : (
                folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(folder.id)}
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
                    key={folder.id}
                    className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
                  >
                    <Folder size={15} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={folder.name}>
                      {folder.name}
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
