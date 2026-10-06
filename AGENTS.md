# AGENTS.md

## Project Overview
Single-file static HTML application ("Memória Escola") — a school memory/institutional records SaaS. The entire app (HTML, CSS, JS) lives in `index.html` (~4600 lines). No build step, no backend, no framework — pure vanilla JS with localStorage for persistence.

## Why It Failed to Start
The original commit (`9fc0cdf`) only added `index.html` with no server infrastructure — no Dockerfile, no `package.json`, no compose file. There was nothing to serve the file, so the preview couldn't load.

## Base44 Dev Environment
- **Compose**: `docker-compose.base44.yml` — uses `node:22-slim`, bind-mounts the repo, installs Vite on startup, serves `index.html` with live reload on port 3000.
- **No secrets required** — the app is fully client-side with localStorage.
- **No migrations/seeds** — data is browser-local.

## Verification
- `docker compose -f docker-compose.base44.yml up -d --build` starts the server.
- Healthcheck: `fetch('http://localhost:3000/')` via node.
- Preview shows the login page with demo user quick-access buttons.
- No console errors or failed network requests.
