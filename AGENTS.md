# AGENTS.md

## Project Overview
"Memória Escola" is a single-file static HTML application (Portuguese) — a school memory/institutional record system. All CSS, JS, and assets are embedded in `index.html` (~1.3MB). No backend, no build step, no external API calls (only Google Fonts CDN).

## Running the App
- `docker compose -f docker-compose.base44.yml up -d` starts an nginx container serving `index.html` on port 3000.
- No dependencies to install, no migrations, no secrets required.
- Edits to `index.html` are reflected immediately (nginx serves the file directly from the bind mount).

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` should return `200`.
- The page title is "Memória Escola · sistema completo em um arquivo".

## Tech Notes
- The app uses `localStorage` for theme persistence (light/dark mode).
- Language: Portuguese (pt-BR).
- No package.json, no framework — vanilla HTML/CSS/JS.
