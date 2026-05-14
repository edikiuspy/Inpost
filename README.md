# InPost Smart Point Finder

InPost Smart Point Finder is a small web app for choosing a parcel point, not just finding the closest one. It uses the assignment endpoint, `https://api-global-points.easypack24.net/v1/points`, then adds ranking, explanations and map behavior around the raw data.

The concrete problem: a user wants to collect, send or return a parcel and needs a point that fits the job, is reachable, is open when needed and has enough context to avoid a bad choice. The app does not try to replace InPost Mobile or handle parcel operations. It only helps pick a point.

Live app:

```text
https://inpost-rekrutacyjne.vercel.app
```

## What is built

- FastAPI backend that wraps the InPost points API and returns normalized, scored points.
- React, Vite, Tailwind and Leaflet frontend with a map, filter panel and ranked result list.
- Docker setup for running backend and frontend together.
- SQLite cache for InPost API responses with a 30 minute TTL.
- Address lookup through InPost's public search endpoint, plus browser geolocation.
- Workflow filters for collecting, sending and returning parcels.
- Point type, radius, 24/7, payment and open-now filters.
- A 1.0 to 5.0 score with marker colors, labels and short reasons.
- Rich map popups with address, distance, opening status, locker size signals, payment notes, scheduled unavailability, image and directions link when the API provides those fields.
- Viewport-based map loading with padded prefetching and lightweight clustering.

## Tech stack

Backend:

- Python 3.12 in Docker.
- FastAPI for the HTTP API.
- Uvicorn as the ASGI server.
- Pydantic for request and response models.
- HTTPX for calls to InPost APIs.
- SQLite from the Python standard library for the response cache.
- Pytest for backend tests.

Frontend:

- Node.js 22 in Docker.
- pnpm 10 for package management.
- React 19 for the UI.
- Vite 8 for development and production builds.
- Tailwind CSS 3 for styling.
- Leaflet and React Leaflet for the map.
- Lucide React for icons.

Deployment and runtime:

- Docker Compose runs the backend and frontend together.
- The frontend image builds static assets with Node and serves them through Nginx.
- Nginx also proxies `/api` requests from the frontend container to the backend service.
- The backend cache is stored in a Docker volume at `/srv/backend/data`.
- Vercel deployment builds `frontend/dist` as static output and exposes FastAPI through `api/index.py`.
- The Vercel Python runtime is pinned to Python 3.14 with `.python-version`, `pyproject.toml` and `uv.lock`.
- On Vercel, SQLite cache writes go to `/tmp/inpost-cache.sqlite3` because the deployed function bundle is read-only.

## Why this instead of a plain finder

The official InPost finder at `https://inpost.pl/znajdz-paczkomat` is very good for locating a Paczkomat or PaczkoPunkt. It has search, "use my location", a map view and type filters for all points, Paczkomat and POP. It also includes user-facing instructions for sending and receiving parcels.

This project focuses on a narrower decision: "which point should I choose for this task?" Compared with the public finder, this app adds:

- ranked results instead of a mostly location-first list;
- visible reasons for each score, so the user can see why a point is better or worse;
- workflow-aware filtering for collect, send and return capabilities from the API `functions` field;
- open-now scoring and filtering based on parsed opening hours;
- payment-required and 24/7 filtering in the same decision flow;
- map viewport prefetching, local client-side point caching and clustering for dense areas;
- an explicit `possibly_incomplete` signal when a broad map area may have hit the API limit;
- backend tests around scoring, cache behavior, API errors and viewport search.

The tradeoff is that the official finder is broader and production-grade, while this app is a submission-sized prototype. The prototype is more transparent about ranking and API uncertainty, but it does not implement account features, parcel sending, pickup codes or full InPost product flows.

## API use and assumptions

The app fetches real data from:

```text
GET https://api-global-points.easypack24.net/v1/points
```

It requests only the fields it uses: identity, type, status, coordinates, address, functions, opening hours, payment support, location metadata, locker availability and unavailability periods.

The live global endpoint is large and paginated. A fresh probe during README update returned about 153k points; that number will change. The endpoint commonly returns `locker_availability.status = "NO_DATA"`, so the score ignores locker availability unless the API provides a meaningful value.

The InPost API does not expose a documented bounding-box search. For map movement, the backend converts the visible Leaflet bounds into a center point and radius, uses relative search, then filters the returned points back to the requested bounds.

Address search is a supporting feature, not the main assignment data source. The backend exposes:

```text
GET /api/geocode?q=<query>
```

That endpoint calls InPost's public search API used by the official finder:

```text
GET https://inpost.pl/api/inpost-search?q=<query>&fallback=osm
```

The response is reduced to up to 8 suggestions with `display_name`, `lat` and `lon`. On Vercel, that public InPost endpoint can reject serverless traffic with `403`, so the backend falls back to OpenStreetMap Nominatim for address suggestions in that case. The frontend uses the returned coordinates as the user's selected location, then the main points search ranks parcel points around that location. If address lookup fails completely, the app reports a controlled `502` instead of breaking the point search API.

## Scoring model

The scoring is deterministic and lives in `backend/app/services/scoring.py`.

If `point.status != "Operating"`, the point does not use the additive formula. It immediately gets:

```text
score = 1.0
label = "Unavailable"
marker_color = "gray"
```

For operating points, the formula starts from:

```text
raw_score = 3.0
```

Then the app applies these adjustments:

| Condition | Adjustment |
| --- | ---: |
| `parcel_locker` is present in `point.type` | `+0.45` |
| preferred point type was selected, but the point is not a parcel locker | `-0.50` |
| selected workflow functions are all supported | `+0.65` |
| selected workflow functions are missing | `-min(1.20, 0.45 * missing_function_count)` |
| point is 24/7 | `+0.45` |
| user requires 24/7, but point is not 24/7 | `-0.80` |
| payment is available | `+0.25` |
| user requires payment, but payment is not available | `-0.70` |
| easy access zone is true | `+0.20` |
| distance is `<= 300 m` from selected location | `+0.55` |
| distance is `<= 1 km` from selected location | `+0.35` |
| distance is `<= 3 km` from selected location | `+0.10` |
| distance is `> 3 km` from selected location | `-0.45` |
| locker availability status is `AVAILABLE`, `HIGH` or `MEDIUM` | `+0.25` |
| locker availability status is `LOW`, `FULL` or `UNAVAILABLE` | `-0.50` |
| parsed opening hours say the point is closed now | `-1.40` |
| parsed opening hours say the point closes in 30 minutes or less | `-0.40` |
| parsed opening hours say the point is open and not closing soon | `+0.20` |

The final score is clamped to the `1.0` to `5.0` range and rounded to one decimal place:

```text
score = round(max(1.0, min(5.0, raw_score)), 1)
```

Labels and marker colors are assigned from the final score:

| Final score | Label | Marker color |
| ---: | --- | --- |
| `>= 4.5` | `Excellent match` | green |
| `>= 3.5` and `< 4.5` | `Good match` | yellow |
| `>= 2.5` and `< 3.5` | `Usable` | orange |
| `< 2.5` | `Weak match` | red |

Distance adjustments only run when the user has selected coordinates. Locker availability is ignored when the API returns `NO_DATA`, because that value does not say whether a locker is actually available.

## Map loading and cache design

The frontend sends `north`, `south`, `east` and `west` when the map viewport changes. It asks for a padded area around the visible map, keeps those points in memory and renders only points currently in view. Small pans can reuse cached frontend data without immediately calling the backend again.

The backend splits large map bounds into tiles:

- small bounds: 1 API request;
- medium city bounds: 2x2 requests;
- wide bounds: 3x3 requests, capped at 9 requests.

Each tile uses `limit=500`, results are deduplicated by point name and cached separately in SQLite. Cache keys are SHA-256 hashes of normalized request parameters, so equivalent requests with reordered list values reuse the same entry. Cached responses expire after 30 minutes.

If a tile returns exactly the requested limit, the response is marked as `possibly_incomplete`. The UI can then tell the user to zoom in rather than pretending the map has complete coverage.

## Run with Docker

```bash
docker compose up -d --build
```

The services run at:

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:8000
Docs:     http://127.0.0.1:8000/docs
```

Useful checks:

```bash
docker compose ps
curl 'http://127.0.0.1:8000/api/points/search?city=Warszawa&type=parcel_locker&functions=parcel_collect&limit=3' | jq
curl 'http://127.0.0.1:5173/api/points/search?city=Warszawa&type=parcel_locker&functions=parcel_collect&limit=1' | jq
```

Stop the stack with:

```bash
docker compose down
```

## Local development

Requirements:

- Python 3.12+.
- Node.js 22+.
- pnpm 10+.

Backend:

```bash

python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

Frontend:

```bash
pnpm install
pnpm frontend:dev
```

The Vite dev server runs at `http://127.0.0.1:5173` and proxies `/api` requests to the FastAPI backend.

## Tests and checks

```bash
.venv/bin/python -m pytest backend/tests
pnpm frontend:build
docker compose up -d --build
```

The backend tests cover:

- stable cache keys and cache expiry;
- cache hits avoiding InPost client calls;
- scoring edge cases;
- controlled API error responses;
- viewport search, deduplication and incomplete-result detection.

## Limitations

- The app estimates map coverage through relative search because the API does not document bounding-box queries.
- Opening-hours parsing handles common Polish schedules and 24/7 values, but unusual free-text hours may stay unknown.
- Road-route distance is not calculated; the backend uses haversine distance.
- The app does not implement parcel sending, pickup authentication, account login or shipment management.
- Coverage gap analysis, that I wanted to implement, was left out because it would need population or demand data, not only point locations.

## AI assistance

I used Codex and Claude Opus 4.7 during development, mostly to speed up the less interesting parts of the project and to help with frontend implementation. My main focus was the backend: API integration, caching, search behavior, scoring and the data-handling edge cases around incomplete InPost responses.

The frontend was built with heavy AI assistance, then adjusted to fit the backend API and the assignment goal. The final app is still intentionally small enough for me to explain end to end: the backend fetches and caches InPost data, normalizes points, scores them deterministically, and the frontend presents those results on a map with filters.
