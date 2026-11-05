# AGENTS.md

## What this app is
"Memória Escola" is a **single-file static HTML application** (Portuguese, pt-BR) — a school
institutional-memory system. Everything (CSS, JS, fonts fallback, images) lives in the one
`index.html` (~1.3 MB). There is **no build step, no package.json, no backend and no database**.

- All images are embedded as base64 `data:` URIs in `window.__ASSETS__`; a small shim rewrites
  `/img/...` and `/assets/...` paths to those URIs, so nothing is ever fetched (no 404s).
- The "server" is simulated in the browser: the block starting `/* ===== servidor local ... */`
  replaces `window.fetch` and answers `/api/...` from `localStorage`
  (`memoria_escola_db_v1`). Data written in the app stays in that browser only.
- The only external request is the Google Fonts stylesheet.

## Running the app
```bash
docker compose -f docker-compose.base44.yml up -d
```
Serves the repository on http://localhost:3000 with `.base44/serve.py` (a thin wrapper over
Python's `SimpleHTTPRequestHandler`) from the `python:3.12-slim` image, source bind-mounted
read-only at `/srv/app`.

**Why a wrapper:** clients (the preview proxy, health probes) frequently close the connection
while the ~1.3 MB `index.html` is still streaming, which the stock handler reports as a full
`ConnectionResetError` traceback in the service log. The wrapper swallows those expected aborts
and the healthcheck uses `HEAD`, so the log stays signal-only.

**Why not nginx:** the sandbox checkout root is mode `0700`, and nginx drops its workers to the
`nginx` user, which cannot traverse it — every request returns `403 Forbidden` regardless of how
the file is mounted. `python` runs as root and serves the bind mount fine. Keep that in mind
before switching the image.

There is nothing to install, migrate or seed. Editing `index.html` is immediately live (a browser
reload is enough); the container does not need a restart.

## Verifying it works
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`, ~1.3 MB.
- The page title is "Memória Escola · sistema completo em um arquivo"; the first screen is the login
  screen with demo accounts.
- Demo password for every seeded account (`joao@escola.br`, `paula@escola.br`, `ana@escola.br`,
  `carla@escola.br`, `roberto@escola.br`, `marina@escola.br`): **demo123**. The "Acesso rápido para
  demonstração" buttons log in with one click.
- Routes are hash-based (`#/home`, `#/timeline`, `#/projetos`, `#/turmas`, `#/disciplinas`,
  `#/eventos`, `#/alunos`, `#/historias`, `#/marketing`, `#/retrospectiva`, `#/admin`,
  `#/aprovacoes`, `#/privacidade`, `#/publico`, `#/familia`). There is no server-side routing, so
  no SPA fallback rule is needed.
