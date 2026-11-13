import { ArrowUpRight, Check, Folder, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { buttonClass } from "./ui";

interface Config {
  mock: boolean;
  oauthReady: boolean;
}

export function Login() {
  const [config, setConfig] = useState<Config>();
  const [authError, setAuthError] = useState<"scope" | "other" | null>(null);

  useEffect(() => {
    api<Config>("/api/config")
      .then(setConfig)
      .catch(() => setConfig({ mock: false, oauthReady: false }));
    const code = new URLSearchParams(location.search).get("auth_error");
    if (code) {
      setAuthError(code === "scope" ? "scope" : "other");
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  return (
    <main className="min-h-dvh bg-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col lg:flex-row">
        <section className="flex flex-1 flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
          <div className="text-[17px] font-semibold tracking-[-0.01em] text-ink">MyPlayer</div>

          <div className="flex flex-1 items-center py-16 lg:py-0">
            <div className="w-full max-w-[430px]">
              <h1 className="text-[36px] font-medium leading-[1.08] tracking-[-0.02em] text-ink sm:text-[42px]">
                Seus cursos, na ordem em que você parou
              </h1>
              <p className="mt-5 max-w-[36ch] text-[15px] leading-6 text-ink-2">
                O MyPlayer lê as pastas do seu Google Drive que você marcar como cursos e monta cada módulo como uma
                sequência de aulas, com o ponto de retomada salvo.
              </p>

              <div className="mt-8">
                {!config ? (
                  <div className="h-12" />
                ) : config.oauthReady || config.mock ? (
                  <a
                    href="/auth/google"
                    className={buttonClass("primary", "lg", "w-full gap-3 sm:w-auto")}
                  >
                    <GoogleMark />
                    Continuar com Google
                  </a>
                ) : (
                  <div className="max-w-[380px] rounded-[12px] border border-line bg-card p-4">
                    <p className="text-[13px] text-ink-2">Falta configurar o acesso ao Google</p>
                    <p className="mt-2 font-mono text-[11px] leading-5 text-ink-3">
                      GOOGLE_CLIENT_ID
                      <br />
                      GOOGLE_CLIENT_SECRET
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-ink-3">
                      Preencha o arquivo <span className="font-mono text-[11px]">.env</span> e reinicie o servidor. Os
                      passos estão no README.
                    </p>
                  </div>
                )}
              </div>

              {authError === "scope" ? (
                <p className="mt-4 max-w-[40ch] text-[13px] leading-5 text-danger">
                  O Google não concedeu a leitura do Drive. Tente de novo e mantenha o acesso ao Drive marcado.
                </p>
              ) : authError ? (
                <p className="mt-4 text-[13px] text-danger">Não foi possível concluir a entrada. Tente novamente.</p>
              ) : null}

              <p className="mt-6 max-w-[38ch] text-[12px] leading-5 text-ink-3">
                Acesso somente leitura ao Drive. As aulas são transmitidas direto da sua pasta, sem cópia.
              </p>
            </div>
          </div>

          <p className="font-mono text-[11px] text-ink-3">
            {config?.mock ? "Modo demonstração · dados locais" : "Histórico salvo neste servidor"}
          </p>
        </section>

        <section className="relative hidden border-l border-line bg-deep lg:flex lg:w-[46%] lg:items-center lg:px-14">
          <FolderDiagram />
        </section>
      </div>
    </main>
  );
}

function FolderDiagram() {
  return (
    <div className="w-full max-w-[360px]">
      <p className="text-[12px] text-ink-3">Como as suas pastas são lidas</p>

      <div className="mt-4 rounded-[14px] border border-line bg-card p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <Folder size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          <span className="text-[13px] text-ink">Curso</span>
          <span className="ml-auto font-mono text-[11px] text-ink-3">3 módulos</span>
        </div>

        <div className="ml-3 border-l border-line pl-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Folder size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            <span className="text-[13px] text-ink-2">Módulo</span>
            <span className="ml-auto font-mono text-[11px] text-ink-3">4 aulas</span>
          </div>

          <div className="ml-3 border-l border-line pl-3">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Check size={15} strokeWidth={1.5} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">Aula 01.mp4</span>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">18:04</span>
            </div>
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2.5">
                <span className="size-[15px] shrink-0 rounded-full border border-amber" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">Aula 02.mp4</span>
                <span className="font-mono text-[11px] tabular-nums text-amber">24:31</span>
              </div>
              <div className="mt-2 ml-[25px] h-0.5 w-28 overflow-hidden rounded-[1px] bg-white/10">
                <div className="h-full w-2/5 bg-amber" />
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Paperclip size={15} strokeWidth={1.5} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">Slides.pdf</span>
              <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px] leading-5 text-ink-3">
        Você marca quais pastas são cursos. As subpastas viram módulos; os vídeos entram na sequência e o resto vira
        anexo.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3-2.32Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
