from datetime import UTC, datetime, timedelta
from typing import Any

from app.clients.inpost_client import InPostClient
from app.core.config import settings
from app.models.point import Point
from app.models.search import SearchFilters, haversine_meters
from app.repositories.cache import CacheRepository, build_cache_key


class PointSearchService:
    def __init__(
        self,
        client: InPostClient | None = None,
        cache: CacheRepository | None = None,
        cache_ttl_seconds: int = settings.cache_ttl_seconds,
    ):
        self.client = client or InPostClient()
        self.cache = cache or CacheRepository(settings.cache_db_path)
        self.cache_ttl_seconds = cache_ttl_seconds

    def search(self, filters: SearchFilters) -> tuple[list[Point], bool]:
        if filters.has_bounds:
            return self._search_bounds(filters)

        payload = self._get_payload(filters)
        return self._points_from_payloads([payload], filters), _payload_hit_limit(payload, filters.limit)

    def _search_bounds(self, filters: SearchFilters) -> tuple[list[Point], bool]:
        payloads = []
        for tile in _split_bounds(filters):
            payloads.append(self._get_payload(tile))
        possibly_incomplete = any(_payload_hit_limit(payload, filters.limit) for payload in payloads)
        return self._points_from_payloads(payloads, filters), possibly_incomplete

    def _get_payload(self, filters: SearchFilters) -> dict[str, Any]:
        cache_identity = filters.cache_identity()
        cache_key = build_cache_key(cache_identity)
        cached = self.cache.get(cache_key)
        return cached if cached is not None else self._fetch_and_cache(cache_key, cache_identity, filters)

    def _points_from_payloads(self, payloads: list[dict[str, Any]], filters: SearchFilters) -> list[Point]:
        points = []
        seen_names = set()
        for payload in payloads:
            for item in payload.get("items", []):
                try:
                    point = Point.model_validate(item)
                except ValueError:
                    continue
                if point.name in seen_names:
                    continue
                self._normalize_distance(point, filters)
                if not self._matches_client_side_filters(point, filters):
                    continue
                seen_names.add(point.name)
                points.append(point)
        return points

    def _fetch_and_cache(
        self,
        cache_key: str,
        cache_identity: dict[str, Any],
        filters: SearchFilters,
    ) -> dict[str, Any]:
        payload = self.client.search_points(filters)
        expires_at = datetime.now(UTC) + timedelta(seconds=self.cache_ttl_seconds)
        self.cache.set(cache_key, cache_identity, payload, expires_at)
        return payload

    def _matches_client_side_filters(self, point: Point, filters: SearchFilters) -> bool:
        if filters.has_bounds and not _point_in_bounds(point, filters):
            return False
        if filters.has_location and point.distance is not None and point.distance > filters.max_distance:
            return False
        if filters.only_247 and not point.location_247:
            return False
        if filters.payment_required and not point.payment_available:
            return False
        return True

    def _normalize_distance(self, point: Point, filters: SearchFilters) -> None:
        if filters.has_location:
            point.distance = round(
                haversine_meters(
                    filters.lat,
                    filters.lon,
                    point.location.latitude,
                    point.location.longitude,
                )
            )
        elif filters.has_bounds:
            point.distance = None


def _point_in_bounds(point: Point, filters: SearchFilters) -> bool:
    latitude = point.location.latitude
    longitude = point.location.longitude
    return filters.south <= latitude <= filters.north and filters.west <= longitude <= filters.east


def _split_bounds(filters: SearchFilters) -> list[SearchFilters]:
    tile_count = _tile_count(filters)
    if tile_count == 1:
        return [filters]

    lat_step = (filters.north - filters.south) / tile_count
    lon_step = (filters.east - filters.west) / tile_count
    tiles = []
    for row in range(tile_count):
        for column in range(tile_count):
            south = filters.south + row * lat_step
            north = filters.south + (row + 1) * lat_step
            west = filters.west + column * lon_step
            east = filters.west + (column + 1) * lon_step
            tiles.append(
                filters.model_copy(
                    update={
                        "south": south,
                        "north": north,
                        "west": west,
                        "east": east,
                    }
                )
            )
    return tiles


def _tile_count(filters: SearchFilters) -> int:
    radius = filters.viewport_radius or 0
    if radius <= 4_000:
        return 1
    if radius <= 20_000:
        return 2
    return 3


def _payload_hit_limit(payload: dict[str, Any], limit: int) -> bool:
    return len(payload.get("items", [])) >= limit
