# MyPlayer

Player de cursos em vídeo que lê as pastas do Google Drive que você marcar como cursos: cada subpasta vira um
módulo, cada vídeo uma aula na sequência, e o resto vira anexo do módulo. O histórico fica no servidor, com
retomada do ponto onde parou.

## Como funciona

- **Login** com Google (OAuth, escopo `drive.readonly`). O refresh token fica no servidor; o navegador só recebe
  um cookie de sessão `HttpOnly`.
- **Cursos** são as pastas que você escolhe em **Escolher cursos**, navegando pelo seu Drive. A seleção fica salva
  por conta em `apps/api/data/db.json`.
- **Catálogo** montado a partir das pastas escolhidas (cursos → módulos → arquivos) e cacheado por 60 s.
- **Vídeo** é transmitido por um proxy autenticado (`/api/media/:id`) que repassa `Range`, então seek e retomada
  funcionam com o player nativo do navegador.
- **Histórico** em `apps/api/data/db.json`: posição, duração e assistido (≥ 90% ou fim do vídeo). Módulo é
  assistido quando todas as aulas do módulo foram assistidas.

## Rodar

Requer Node 24 e pnpm.

```bash
pnpm install
cp .env.example .env
pnpm dev            # API em :8788, web em :5173
```

Antes do login funcionar, crie o acesso no Google Cloud:

1. Crie um projeto e ative a **Google Drive API**.
2. Em **OAuth consent screen**, escolha *External*, adicione seu e-mail em *Test users* e inclua o escopo
   `.../auth/drive.readonly`.
3. Em **Credentials → Create credentials → OAuth client ID → Web application**, cadastre a URI de redirecionamento
   `http://localhost:8788/auth/google/callback`.
4. Copie client ID e secret para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`.
5. A conta usada no login precisa ter acesso às pastas que você vai marcar como cursos.

### Ver a interface sem configurar o Google

```bash
MOCK=1 pnpm dev
```

Modo demonstração: Drive fictício (dá para navegar e trocar a seleção), um vídeo de exemplo público e histórico
local.

### Build de produção

```bash
pnpm build
APP_URL=https://seu-dominio API_URL=https://seu-dominio DATA_DIR=/caminho/dos/dados pnpm start
```

O servidor da API também serve o build da web, então um único processo e uma única origem cuidam de cookie e
OAuth. Cadastre a URI de redirecionamento correspondente no Google Cloud.

## Estrutura da pasta

Na primeira vez, a biblioteca abre vazia. Clique em **Escolher cursos**, navegue pelo Drive e marque as pastas que
são cursos. Cada pasta marcada vira um curso:

```
Curso (pasta marcada)
├── Módulo (subpasta)
│   ├── 01 - Introdução.mp4      → aula
│   ├── 02 - Prática.mp4         → aula
│   └── slides.pdf               → anexo do módulo
├── Módulo (subpasta)
└── arquivos soltos              → módulo "Conteúdo do curso"
```

A ordem é a ordem natural dos nomes (`1 - Intro`, `10 - Fim`), então numere os arquivos se precisar controlar a
sequência. Só uma camada de subpastas é lida como módulo; arquivos soltos na pasta do curso aparecem em
"Conteúdo do curso".

## Login sem acesso ao Drive

Se a biblioteca abrir com erro de permissão, o consentimento voltou sem o escopo do Drive. No Google Cloud:

1. **Google Auth Platform → Data access** → adicione `https://www.googleapis.com/auth/drive.readonly`.
2. Revogue o acesso antigo em https://myaccount.google.com/permissions.
3. Saia no app e entre de novo, mantendo a permissão do Drive marcada na tela do Google.

O app avisa quando o login volta sem o escopo e não cria sessão nesse caso.

## Limites conhecidos

- `drive.readonly` é um escopo restrito: em *Testing* funciona só para os usuários de teste e o token expira em
  ~7 dias; publicar o app remove essas duas limitações, mas mantém o aviso de "não verificado".
- O seletor navega a partir de "Meu Drive" e não tem busca: para muitas pastas, navegue pela hierarquia. Pastas em
  drives compartilhados não aparecem no seletor.
- O dono do arquivo precisa permitir download; sem isso o vídeo não abre no player e o app oferece o link do Drive.
- MKV, AVI e alguns MOV não são reproduzidos pelo navegador; use MP4 (H.264/AAC) ou WebM.
- O histórico é um JSON único, escrito de forma atômica e com debounce. Serve para uso pessoal ou familiar, não
  para muitas escritas simultâneas. Faça backup de `apps/api/data/db.json`.

## Testes

```bash
pnpm test
```
