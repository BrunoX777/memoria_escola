# AGENTS.md

## Project Overview

**Memória Escola** — a single-file HTML school memory management app (Portuguese, pt-BR).

The entire application lives in `index.html`: markup, CSS (inline `<style>`), and JavaScript (inline `<script>`) are all in one file. There is no build step, no package manager, no backend, and no database — data persists via `localStorage`.

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

Served by `nginx:alpine` on port 3000. The repo is bind-mounted read-only into the nginx document root, so edits to `index.html` appear on browser refresh (no rebuild needed — call `reload_preview` after edits to force the iframe to refresh).

## Notes

- The app references local images at `/img/*.png` (logos, SESI branding) but no `img/` directory exists in the repo — those images will be broken until added.
- External dependency: Google Fonts (`Inter`) loaded via CDN — requires internet access to render with the intended typography.
- Language: all UI text is in Brazilian Portuguese.
