# AGENTS.md

## Project Overview

**Memória Escola** — a school memory / institutional-records app (pt-BR).

The whole application is one file: `index.html` (~1.3 MB). HTML, CSS (`<style>`) and
JavaScript (`<script>`) are all inline, and there is no build step, no package manager,
no backend and no external API.

Four script blocks, in order:
1. theme bootstrap (`localStorage.me_theme`)
2. `window.__ASSETS__` + `window.__SEED__` — images embedded as data URIs and the demo seed data
3. the local "server": a fake `fetch` that answers `/api/...` from `localStorage`
   (key `memoria_escola_db_v1`) and rewrites `/img/...` / `/assets/...` to embedded data URIs
4. the UI (`render()` runs at the end of the file)

## Why the original commit did not start

Commit `9fc0cdf` only added `index.html` — no server, no `package.json`, no compose file.
Nothing listened on port 3000, so the preview could never load. The app itself was fine.

## Running here

```bash
docker compose -f docker-compose.base44.yml up -d
```

`nginx:alpine` serves `index.html` on host port 3000, bind-mounted read-only. There is no
dev server to run, so after editing `index.html` the preview must be refreshed with
`reload_preview` (a plain browser reload is enough — nothing is compiled).

- No dependencies to install, no migrations, no seeds, no secrets.
- `img/` does not exist in the repo, but that is expected: `/img/*.png` paths in the markup
  are replaced with the embedded data URIs before the browser requests them.

## Verification

- `curl -s http://localhost:3000/ | grep -o 'Memória Escola'` → the page is being served.
- `docker compose -f docker-compose.base44.yml ps` → `web` is `healthy`.
- Load the page: the login screen appears with demo quick-access buttons, and the console
  has no errors (the app is fully client-side; data lives in `localStorage`).

## Notes

- Typography needs the Google Fonts CDN (`Inter`) to look as intended; without internet the
  browser falls back to system fonts. Everything else works offline.
- External network requests you see in the console are only the Google Fonts ones — the app
  never calls a real API.
- Language: all UI text is Brazilian Portuguese.
