# MyPlayer — Documentação inicial do projeto

> Repositório: `github.com/wernerjr/MyPlayer`  
> Workspace local: `/tmp/opencode/MyPlayer`  
> Última atualização: 2026-11-27 · favoritos mergeados na `main` via PR #1

---

## 1. O que é

MyPlayer é um player pessoal de cursos em vídeo que lê pastas do Google Drive ou do OneDrive marcadas pelo usuário. Cada pasta marcada vira um curso, cada subpasta vira um módulo e cada vídeo vira uma aula. O histórico de reprodução fica no servidor, com retomada do ponto onde o usuário parou.

O projeto nasceu para quem estuda com bibliotecas de vídeo espalhadas em nuvem e quer uma interface única, com progresso salvo, sem precisar fazer upload dos arquivos para outro lugar.

## 2. Público e uso

- **Usuário final:** pessoa que consome cursos armazenados no próprio Google Drive ou OneDrive.
- **Ambiente:** uso pessoal, familiar ou pequenos grupos (homelab). Não é multi-tenant nem escalado para muitos usuários simultâneos.
- **Modo demonstração:** `MOCK=1 pnpm dev` liga uma versão local com dados fictícios, sem credenciais de nuvem.

## 3. Funcionalidades principais

| Funcionalidade | Descrição |
| --- | --- |
| Login | Google OAuth com escopo `drive.readonly`. Cookie de sessão `HttpOnly`. |
| Conectar OneDrive | Microsoft OAuth adicional, na mesma conta do app. |
| Escolher pastas | Seletor de pastas do Drive/OneDrive; seleção vira catálogo de cursos. |
| Biblioteca | Grade de cursos, card "Continuar de onde parou", seção "Favoritas". |
| Player | `<video>` nativo com `src=/api/media/:id?provider=`, seek e retomada via `Range`. |
| Progresso | Salva posição, duração e flag `watched` a cada 10 s e em eventos de pausa/fim. |
| Favoritar aulas | Estrela na sidebar e no cabeçalho; até 100 por conta; lista na Biblioteca. |
| Materiais | Anexos de módulo abrem no link da nuvem. |
| Modo mock | `MOCK=1` usa catálogo fictício e vídeo público de exemplo. |

## 4. Regras de negócio

- **Curso:** qualquer pasta marcada pelo usuário.
- **Módulo:** subpasta direta de um curso. Arquivos soltos no curso viram o módulo "Conteúdo do curso".
- **Aula:** arquivo de vídeo (extensões `mp4|m4v|mov|webm|mkv|avi|ogv` ou `mimeType` começando com `video/`).
- **Ordem:** ordem natural dos nomes (`pt-BR`, numérica), então `1 - Intro` vem antes de `10 - Fim`.
- **Assistido:** `watched=true` quando o usuário marca manualmente ou quando a posição atinge ≥ 90 % da duração (`WATCHED_AT = 0.9`).
- **Retomada:** só propõe retomar se a posição for maior que 10 s e o vídeo ainda não estiver assistido.
- **Favoritos:** máximo 100 por conta; chave composta `provider:videoId`; ordem do mais recente para o mais antigo; órfãos (aula fora do catálogo) aparecem como "Indisponível" e podem ser removidos.
- **Sessão:** expira em 30 dias. Sem sessão, todas as rotas de API retornam 401.

## 5. Glossário

| Termo | Significado |
| --- | --- |
| `CloudProvider` | `gdrive` ou `onedrive`. |
| `cloudKey(provider, id)` | Chave composta `provider:id`. Usada em curso, módulo e favorito. |
| `Course` | Pasta marcada como curso. `id` é `provider:folderId`. |
| `Module` | Subpasta de curso. `id` é `provider:moduleId` ou `provider:courseId~files` para arquivos soltos. |
| `Video` | Aula. `id` é o id do provedor; `provider` pode vir do vídeo ou do curso. |
| `Attachment` | Arquivo que não é vídeo nem pasta, exibido como material. |
| `Progress` | `{ position, duration, watched, updatedAt }` por `videoId`. |
| `Favorite` | Snapshot `{ key, videoId, provider, courseId, courseName, moduleId, moduleName, videoName, addedAt }`. |
| `Catalog` | Árvore montada de cursos → módulos → aulas, cacheada por 60 s. |

## 6. Stack

- **Monorepo:** pnpm workspaces + turbo.
- **Backend:** Node 24, TypeScript 5.9, Fastify 5, `tsx` em dev.
- **Frontend:** React 19, Vite 7, Tailwind CSS 4, Lucide React.
- **Compartilhado:** pacote `@myplayer/shared` com tipos e regras puras.
- **Dados:** JSON único (`db.json`), escrita atômica com debounce de 300 ms.
- **Testes:** Node built-in test runner (`node:test`).

## 7. Monorepo e entry points

```
MyPlayer/
├── apps/
│   ├── api/                 # Servidor Fastify
│   │   └── src/
│   │       ├── server.ts    # Entry point; rotas, auth, estática
│   │       ├── store.ts     # db.json, load/save atômico
│   │       ├── catalog.ts   # Normalização Drive/OneDrive + buildCatalog
│   │       ├── cloud.ts     # Driver unificado + cache de catálogo
│   │       ├── google.ts    # OAuth e tokens Google
│   │       ├── onedrive.ts  # OAuth e tokens Microsoft
│   │       ├── mock.ts      # Dados e catálogo fictícios
│   │       ├── env.ts       # Variáveis de ambiente
│   │       └── *.test.ts    # Testes de regras puras
│   └── web/                 # Aplicação React
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx     # Entry point React
│       │   ├── App.tsx      # Verifica sessão e renderiza AppShell ou Login
│       │   ├── components/
│       │   │   ├── AppShell.tsx     # Estado global, rotas de API, favoritos
│       │   │   ├── Sidebar.tsx      # Navegação, lista de módulos/aulas
│       │   │   ├── CourseView.tsx   # Player e detalhes da aula
│       │   │   ├── Library.tsx      # Biblioteca e seção Favoritas
│       │   │   ├── CoursePicker.tsx # Seletor de pastas
│       │   │   ├── Login.tsx        # Tela de login
│       │   │   └── ui.tsx           # Botões e utilitários de classe
│       │   └── lib/
│       │       ├── api.ts           # Cliente fetch + HttpError
│       │       ├── favorites.ts     # Resolver favoritos no catálogo
│       │       ├── stats.ts         # Estatísticas de progresso
│       │       └── format.ts        # Formatadores de tempo
│       └── styles.css
└── packages/
    └── shared/
        └── src/
            └── index.ts     # Tipos e regras puras compartilhadas
```

### Entry points de execução

- Dev: `pnpm dev` (turbo roda `apps/api` e `apps/web` em paralelo).
- Build: `pnpm build` (gera `apps/web/dist` e `apps/api/dist`).
- Produção: `pnpm start` roda `apps/api/dist/server.js`, que também serve `apps/web/dist`.
- Testes: `pnpm test`.
- Typecheck: `pnpm typecheck`.

## 8. Fluxo de dados

### 8.1 Login e sessão

1. Usuário clica em "Entrar com Google" → `/auth/google`.
2. Servidor redireciona para OAuth do Google com `state` e cookie `mp_state`.
3. Callback `/auth/google/callback` valida `state`, escopo e troca o code por tokens.
4. Servidor cria sessão `mp_sid` (cookie `HttpOnly`, 30 dias) e salva `users`/`sessions` em `db.json`.
5. OneDrive é conectado depois, via `/auth/microsoft`, e salvo no mesmo `User`.

### 8.2 Montar o catálogo

1. Frontend chama `GET /api/catalog`.
2. `cloud.ts` agrupa as seleções por `provider`, busca tokens, resolve pastas, lista filhos e netos.
3. `catalog.ts/buildCatalog` monta a árvore `Course[] → Module[] → Video[]/Attachment[]`.
4. Resultado é cacheado por conta por 60 s; `invalidateCatalog` limpa o cache ao salvar nova seleção.

### 8.3 Reproduzir vídeo

1. Player usa `src="/api/media/:videoId?provider=gdrive"`.
2. Servidor valida sessão, obtém token do provedor e repassa o `Range` para a API de nuvem.
3. Cabeçalhos de resposta (`content-type`, `content-range`, etc.) são retransmitidos.
4. A cada 10 s e em pause/end, o frontend envia `PUT /api/progress/:videoId`.
5. Servidor aplica `mergeProgress` e salva no `db.json`.

### 8.4 Favoritar aulas

1. Usuário clica na estrela na `Sidebar` ou no cabeçalho de `CourseView`.
2. `AppShell` monta o candidato com `toFavorite(course, module, video)`.
3. Toggle otimista atualiza o estado local; requisição `PUT /api/favorites/:provider/:videoId` leva só o snapshot de exibição.
4. Servidor monta a chave `provider:videoId`, aplica `addFavorite` e retorna a lista canônica.
5. Resposta só é aplicada se for da mutação mais recente (`favoritesSequence` + `applyFavoritesResponse`); em falha, o rollback desfaz só aquela chave.
6. A seção "Favoritas" em `Library` lista por `addedAt` decrescente; `resolveFavorite` encontra a aula no catálogo atual para abrir.

## 9. Modelo de dados

O estado persistente fica em `DATA_DIR/db.json` (padrão `apps/api/data/db.json`):

```ts
interface Db {
  users: Record<email, User>;
  sessions: Record<sid, Session>;
  progress: Record<email, ProgressMap>;
  courses: Record<email, string[]>;   // ids de pastas marcadas
  favorites: Record<email, Favorite[]>;
}
```

- Escrita atômica: `db.json.tmp` → rename → `db.json`.
- Debounce de 300 ms; flush no `process.exit`.
- Não há migração: `load()` preenche campos ausentes com defaults.

## 10. API

### Autenticação

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/auth/google` | Inicia login Google. |
| GET | `/auth/google/callback` | Callback OAuth Google. |
| GET | `/auth/microsoft` | Inicia conexão OneDrive. |
| GET | `/auth/microsoft/callback` | Callback OAuth Microsoft. |
| POST | `/auth/logout` | Encerra sessão. |
| GET | `/api/me` | Dados do usuário logado. |
| GET | `/api/config` | `{ mock, oauthReady, onedriveReady }`. |
| GET | `/api/health` | `{ ok: true }`. |

### Biblioteca e seleção

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/catalog?refresh=1` | Catálogo montado (cache 60 s, `refresh` força). |
| GET | `/api/folders?provider=&parent=` | Lista pastas para o seletor. |
| GET | `/api/selection` | Pastas marcadas resolvidas. |
| PUT | `/api/selection` | Salva nova seleção de pastas. |

### Progresso

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/progress` | Mapa de progresso da conta. |
| PUT | `/api/progress/:videoId` | Atualiza posição/duração/assistido. |
| POST | `/api/progress/bulk` | Marca/desmarca várias aulas como assistidas. |

### Favoritos

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/favorites` | Lista de favoritos + limite. |
| PUT | `/api/favorites/:provider/:videoId` | Adiciona favorito (idempotente). Retorna 409 no limite. |
| DELETE | `/api/favorites/:provider/:videoId` | Remove favorito (idempotente). |

### Mídia

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/media/:videoId?provider=` | Proxy de stream do vídeo. |

## 11. Web app

### Componentes principais

- `App.tsx`: carrega `/api/me` e decide entre `Login` e `AppShell`.
- `AppShell.tsx`: fonte única de estado global (`catalog`, `progress`, `favorites`, `courseId`, `videoId`, `libraryView`).
- `Sidebar.tsx`: navegação fixa de 280 px (drawer em mobile), lista de cursos ou módulos/aulas do curso ativo.
- `CourseView.tsx`: player, breadcrumb, botões de favorito/assistido e lista de aulas do módulo.
- `Library.tsx`: biblioteca, "Continuar de onde parou", seção "Favoritas" e grade de cursos.
- `CoursePicker.tsx`: modal de seleção de pastas do Drive/OneDrive.

### Estado global

Toda a navegação é local: não há router. `AppShell` mantém:

- `courseId` / `videoId`: aula aberta.
- `openModules`: módulos expandidos na sidebar.
- `libraryView`: `"courses" | "favorites"`.
- `favorites`: lista canônica vinda do servidor.
- `favoriteKeys`: `Set` memoizado para lookup O(1) nas linhas de aula.

### Acessibilidade

- Botões de favorito usam `aria-pressed` e rótulos dinâmicos (`Favoritar {aula}` / `Remover {aula} dos favoritos`).
- Avisos usam `role="status"` e `aria-live="polite"`.
- A estrela da linha de aula é um botão irmão do botão que abre a aula, evitando botão dentro de botão.

## 12. Configuração

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | — | Client ID do Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | — | Client secret do Google Cloud. |
| `MICROSOFT_CLIENT_ID` | — | Application ID do Microsoft Entra. |
| `MICROSOFT_CLIENT_SECRET` | — | Client secret do Microsoft Entra. |
| `APP_URL` | `http://localhost:5173` | URL do frontend em dev. |
| `API_URL` | `http://localhost:8788` | URL da API. |
| `PORT` | `8788` | Porta da API. |
| `HOST` | `127.0.0.1` | Host de bind da API. |
| `DATA_DIR` | `data` | Pasta do `db.json`. |
| `MOCK` | `0` | `1` ativa o modo demonstração. |
| `PUBLIC_URL` | — | URL pública em Docker (sem barra no final). |

## 13. Convenções

- **Idioma do código:** TypeScript, nomes em inglês; interfaces e funções no pacote `@myplayer/shared`.
- **Idioma da UI:** português do Brasil.
- **Regras puras no `shared`:** `mergeProgress`, `addFavorite`, `removeFavorite`, `applyFavoritesResponse`, `restoreFavorite` são testáveis sem React ou Fastify.
- **Chaves compostas:** sempre `provider:id` para evitar colisão entre Drive e OneDrive.
- **Catálogo imutável:** o frontend recebe `Catalog` e nunca o muta; novas seleções refazem `GET /api/catalog`.
- **Tratamento de erro:** `HttpError` no cliente; `reply.code(...).send({ error })` no servidor.
- **Estilo:** Tailwind com tokens customizados (`bg-page`, `text-ink`, `border-line`, etc.) em `apps/web/src/styles.css`.

## 14. Decisões técnicas recentes: favoritar aulas

Entrega mergeada na `main` em 2026-11-27 via PR #1 (`cb5b2c0` + merge `83c7cd3`).

- **Persistência:** lista `favorites` por email em `db.json`, máximo 100 itens.
- **Identidade:** chave `provider:videoId`, padrão já usado em `Course.id`.
- **Snapshot:** o favorito guarda nome do curso, módulo e aula só para exibição; para abrir, o sistema resolve a aula no catálogo atual.
- **Rotas próprias:** `GET/PUT/DELETE /api/favorites` ficam fora de `/api/catalog` para não invalidar o cache de 60 s a cada toggle.
- **Otimismo controlado:** toggle local imediato, rollback por chave em caso de falha, e proteção contra respostas canônicas fora de ordem via contador de sequência (`favoritesSequence`).
- **Órfãos:** itens de aulas ou cursos removidos aparecem como "Indisponível" e continuam removíveis.

Arquivos envolvidos na entrega: `packages/shared/src/index.ts`, `apps/api/src/store.ts`, `apps/api/src/server.ts`, `apps/api/src/favorites.test.ts`, `apps/web/src/lib/favorites.ts`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/CourseView.tsx`, `apps/web/src/components/Library.tsx`.

## 15. Limites e riscos conhecidos

- `db.json` é um único arquivo JSON. Serve para uso pessoal, não para alta concorrência de escrita.
- O cache do catálogo dura 60 s; mudanças nas nuvens só aparecem após "Atualizar" ou nova seleção.
- O escopo `drive.readonly` é restrito no Google Cloud: em modo *Testing* só funciona para usuários de teste e o token expira em ~7 dias.
- O seletor não tem busca; navegação hierárquica a partir da raiz.
- Pastas em drives compartilhados e itens compartilhados do OneDrive não aparecem no seletor.
- Formatos como MKV/AVI podem não reproduzir no navegador.
- Rollback de versão do servidor pode descartar `favorites` se o `db.json` for reescrito por uma versão anterior (risco aceito; deploy só para frente).
- Não testado em produção com Drive/OneDrive reais nem em telas pequenas após o merge.

## 16. Testes

```bash
pnpm typecheck   # 4/4 tarefas
pnpm test        # 15 testes (inclui 7 de favoritos)
```

Testes atuais cobrem regras puras em `packages/shared` e `catalog.ts`. Não há testes de componente nem de rota HTTP no momento.

---

## Referências

- README do projeto: [`/tmp/opencode/MyPlayer/README.md`](/tmp/opencode/MyPlayer/README.md)
- Instruções para agentes: [`/tmp/opencode/MyPlayer/AGENTS.md`](/tmp/opencode/MyPlayer/AGENTS.md)
- Pacote compartilhado: [`packages/shared/src/index.ts`](/tmp/opencode/MyPlayer/packages/shared/src/index.ts)
- Servidor: [`apps/api/src/server.ts`](/tmp/opencode/MyPlayer/apps/api/src/server.ts)
- Estado global da web: [`apps/web/src/components/AppShell.tsx`](/tmp/opencode/MyPlayer/apps/web/src/components/AppShell.tsx)
