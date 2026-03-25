# Schedule Viewer

Schedule Viewer is a mobile-first schedule lookup app for Cairo University engineering students. It combines a React/Vite frontend with a small Flask API that serves exact student-ID lookups from a prebuilt search index, then lets students view their schedule in calendar or grouped list form and export/share it cleanly.

## What it does

- Exact student-ID schedule lookup against a prebuilt semester index
- Responsive calendar and list views tuned for phone-first usage
- Export flows for PDF/image sharing
- Basic admin-only analytics and log inspection endpoints
- Local indexing script to rebuild the JSON search index from source class lists

## Stack

- Frontend: React 19, Vite, Tailwind CSS 4, Framer Motion
- Backend: Flask, Flask-CORS
- Data pipeline: Python, pandas, BeautifulSoup, requests
- Deployment-oriented utilities: static frontend + Python API, configurable by environment variables

## Project structure

```text
src/                 React UI, routes, components, and client utilities
public/              Static assets
app.py               Flask API for schedule lookup, analytics, and admin tools
local_indexer.py     Builds `search_index_sp26.json` from class-list sources
scripts/             Local maintenance and backend helper scripts
search_index_sp26.json  Prebuilt search index used by the API
```

## Local development

### 1. Install dependencies

```bash
npm install
python -m pip install -r requirements.txt
```

### 2. Run the backend

PowerShell:

```powershell
.\scripts\run_backend_local.ps1
```

That script sets a local `ADMIN_TOKEN` automatically for development. In production, `ADMIN_TOKEN` should be set explicitly.

### 3. Run the frontend

```bash
npm run dev
```

If you want the frontend to talk to a different API host, copy `.env.example` to `.env` and update `VITE_API_BASE_URL`.

## Environment notes

- `VITE_API_BASE_URL` points the frontend at the API
- `INDEX_FILE` selects the semester index file the backend serves
- `SEMESTER_LABEL` controls the semester label written into logs/analytics
- `SEARCH_LOG_FILE` and `ANALYTICS_LOG_FILE` control where JSONL logs are written
- `ADMIN_TOKEN` is required to enable admin-only endpoints in deployed environments

## Quality checks

```bash
npm run lint
npm run build
```

## Notes

- Log files, caches, build output, and local virtual environments are intentionally ignored by git.
- The current dataset is built around a single semester index (`search_index_sp26.json`), but the backend is environment-configurable enough to swap in a different index file.
