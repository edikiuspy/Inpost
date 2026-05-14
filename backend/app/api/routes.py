import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import settings
from app.models.point import ScoredPoint, SearchResponse
from app.models.search import SearchFilters
from app.services.scoring import score_point

router = APIRouter(prefix="/api/points", tags=["points"])

geocode_router = APIRouter(prefix="/api", tags=["geocode"])

INPOST_SEARCH_URL = "https://inpost.pl/api/inpost-search"
INPOST_SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://inpost.pl/znajdz-paczkomat",
    "X-Requested-With": "XMLHttpRequest",
}


@router.get("/search", response_model=SearchResponse)
def search_points(
    request: Request,
    city: str | None = None,
    province: str | None = None,
    post_code: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    max_distance: int = Query(default=10_000, ge=100, le=50_000),
    limit: int = Query(default=50, ge=1, le=500),
    type: str | None = Query(default=None),
    functions: list[str] | None = Query(default=None),
    only_247: bool = False,
    payment_required: bool = False,
    open_now: bool = False,
    north: float | None = Query(default=None, ge=-90, le=90),
    south: float | None = Query(default=None, ge=-90, le=90),
    east: float | None = Query(default=None, ge=-180, le=180),
    west: float | None = Query(default=None, ge=-180, le=180),
):
    selected_functions = _parse_functions(functions)
    filters = SearchFilters(
        city=city,
        province=province,
        post_code=post_code,
        lat=lat,
        lon=lon,
        max_distance=max_distance,
        limit=limit,
        point_type=type,
        functions=selected_functions,
        only_247=only_247,
        payment_required=payment_required,
        open_now=open_now,
        north=north,
        south=south,
        east=east,
        west=west,
    )

    try:
        search_result = request.app.state.point_service.search(filters)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not fetch InPost points right now.") from exc

    if isinstance(search_result, tuple):
        points, possibly_incomplete = search_result
    else:
        points = search_result
        possibly_incomplete = False

    scored = []
    for point in points:
        result = score_point(point, filters)
        if filters.open_now and result.open_status.open_now is False:
            continue
        scored.append(
            ScoredPoint(
                **point.model_dump(),
                score=result.score,
                score_label=result.label,
                score_reasons=result.reasons,
                marker_color=result.marker_color,
                open_now=result.open_status.open_now,
                open_status=result.open_status.open_status,
                closes_in_minutes=result.open_status.closes_in_minutes,
                opens_in_minutes=result.open_status.opens_in_minutes,
            )
        )

    scored.sort(key=lambda item: (-item.score, item.distance if item.distance is not None else 999_999))
    return SearchResponse(count=len(scored), items=scored, possibly_incomplete=possibly_incomplete)


@geocode_router.get("/geocode")
def geocode(q: str = Query(min_length=2, max_length=120)):
    query = q.strip()
    if not query:
        return []
    try:
        with httpx.Client(timeout=settings.request_timeout_seconds) as client:
            response = client.get(
                INPOST_SEARCH_URL,
                params={"q": query, "fallback": "osm"},
                headers=INPOST_SEARCH_HEADERS,
            )
            response.raise_for_status()
            raw = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Address lookup failed right now.") from exc

    suggestions = []
    if isinstance(raw, list):
        for item in raw[:8]:
            if not isinstance(item, dict):
                continue
            try:
                lat = float(item["lat"])
                lon = float(item["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            display = item.get("display_name")
            if not isinstance(display, str):
                continue
            suggestions.append({"display_name": display, "lat": lat, "lon": lon})
    return suggestions


def _parse_functions(functions: list[str] | None) -> list[str]:
    if not functions:
        return []
    parsed = []
    for value in functions:
        parsed.extend(item.strip() for item in value.split(",") if item.strip())
    return sorted(set(parsed))
