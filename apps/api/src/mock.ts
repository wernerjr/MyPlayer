import type { Catalog, Course, Module, ProgressMap, Video } from "@myplayer/shared";
import type { FolderRef } from "./catalog.js";
import { db, save } from "./store.js";

/** Public sample clip used by mock mode so the player can be exercised without Drive. */
export const MOCK_CLIP = "https://media.w3.org/2010/05/sintel/trailer.mp4";
export const MOCK_EMAIL = "demo@myplayer.local";

const video = (id: string, name: string, minutes: number): Video => ({
  kind: "video",
  id,
  name,
  mimeType: "video/mp4",
  webViewLink: "https://drive.google.com",
  durationMs: minutes * 60_000,
});

const mod = (id: string, name: string, videos: Video[], attachments: Module["attachments"] = []): Module => ({
  id,
  name,
  videos,
  attachments,
});

const course = (id: string, name: string, modules: Module[]): Course => ({ id, name, modules });

/** Everything the fake Drive knows about. Selection decides which of these become courses. */
export const mockCourses: Course[] = [
  course("mock-c1", "Arquitetura de software na prática", [
    mod(
      "mock-m1",
      "Fundamentos",
      [
        video("mock-v01", "01 — O que é arquitetura", 18),
        video("mock-v02", "02 — Fronteiras e responsabilidades", 24),
        video("mock-v03", "03 — Acoplamento na prática", 31),
        video("mock-v04", "04 — Quando dividir um módulo", 22),
      ],
      [
        { kind: "attachment", id: "mock-a1", name: "mapa-de-decisoes.pdf", mimeType: "application/pdf", size: 2_400_000, webViewLink: "https://drive.google.com" },
        { kind: "attachment", id: "mock-a2", name: "checklist-de-revisão.md", mimeType: "text/markdown", size: 8_200, webViewLink: "https://drive.google.com" },
      ],
    ),
    mod("mock-m2", "Camadas e contratos", [
      video("mock-v05", "05 — Contratos entre camadas", 27),
      video("mock-v06", "06 — Erros e limites de confiança", 19),
      video("mock-v07", "07 — Testes de integração", 34),
    ]),
    mod("mock-m3", "Persistência", [
      video("mock-v08", "08 — Escolhendo o banco", 29),
      video("mock-v09", "09 — Migrações sem sustos", 25),
    ]),
  ]),
  course("mock-c2", "TypeScript avançado", [
    mod("mock-m4", "Tipos que trabalham por você", [
      video("mock-v10", "01 — Tipos derivados", 21),
      video("mock-v11", "02 — Genéricos sem medo", 33),
      video("mock-v12", "03 — Unions e estreitamento", 26),
    ]),
    mod(
      "mock-m5",
      "Projeto real",
      [
        video("mock-v13", "04 — Configuração do projeto", 17),
        video("mock-v14", "05 — Erros em tempo de compilação", 23),
        video("mock-v15", "06 — Refatorando com segurança", 38),
      ],
      [{ kind: "attachment", id: "mock-a3", name: "tsconfig-comentado.json", mimeType: "application/json", size: 3_100, webViewLink: "https://drive.google.com" }],
    ),
  ]),
  course("mock-c3", "Design de interfaces", [
    mod("mock-m6", "Ritmo e espaço", [
      video("mock-v16", "01 — A grade de 4 pixels", 15),
      video("mock-v17", "02 — Hierarquia sem peso", 28),
    ]),
    mod("mock-m7", "Cor e contraste", [
      video("mock-v18", "03 — Uma cor de destaque", 24),
      video("mock-v19", "04 — Contraste que se mede", 20),
    ]),
  ]),
  course("mock-c4", "Banco de dados relacional", [
    mod("mock-m8", "Modelagem", [
      video("mock-v20", "01 — Normalizar até onde", 32),
      video("mock-v21", "02 — Índices e consultas", 41),
    ]),
  ]),
  course("mock-c5", "Rascunhos", [
    mod("mock-m9", "Anotações", [video("mock-v22", "Ideias para a próxima aula", 9)]),
  ]),
];

const folder = ({ id, name }: Course): FolderRef => ({ id, name });

const foldersOf: Record<string, FolderRef[]> = {
  root: mockCourses.map(folder),
};
for (const item of mockCourses) foldersOf[item.id] = item.modules.map(({ id, name }) => ({ id, name }));

export function mockFolders(parent: string): FolderRef[] {
  return foldersOf[parent] ?? [];
}

export function mockResolve(ids: string[]): FolderRef[] {
  return ids
    .map((id) => foldersOf.root.find((item) => item.id === id))
    .filter((item): item is FolderRef => item !== undefined);
}

export function mockCatalog(selected: string[]): Catalog {
  return { courses: mockCourses.filter((item) => selected.includes(item.id)) };
}

/** A few rows so the demo shows resume and watched states instead of an empty library. */
export function seedMockProgress() {
  const existing = db.progress[MOCK_EMAIL];
  if (existing && Object.keys(existing).length > 0) return;

  const row = (position: number, duration: number, watched = false) => ({
    position,
    duration,
    watched,
    updatedAt: Date.now() - (position % 3) * 86_400_000,
  });

  const progress: ProgressMap = {
    "mock-v01": row(18 * 60, 18 * 60, true),
    "mock-v02": row(24 * 60, 24 * 60, true),
    "mock-v03": row(18 * 60 + 42, 31 * 60),
    "mock-v10": row(9 * 60 + 10, 21 * 60),
    "mock-v16": row(15 * 60, 15 * 60, true),
  };
  db.progress[MOCK_EMAIL] = progress;
  save();
}

export function seedMockSelection() {
  if (db.courses[MOCK_EMAIL] !== undefined) return;
  db.courses[MOCK_EMAIL] = mockCourses.slice(0, 4).map((item) => item.id);
  save();
}
