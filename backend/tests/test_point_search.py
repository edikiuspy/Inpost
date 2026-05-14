from datetime import UTC, datetime, timedelta

from app.models.search import SearchFilters
from app.repositories.cache import CacheRepository, build_cache_key
from app.services.point_search import PointSearchService


class CountingClient:
    def __init__(self):
        self.calls = 0

    def search_points(self, filters):
        self.calls += 1
        return {"items": []}


def test_cache_hit_does_not_call_inpost_client(tmp_path):
    filters = SearchFilters(city="Warszawa", limit=25)
    cache = CacheRepository(tmp_path / "cache.sqlite3")
    cache_key = build_cache_key(filters.cache_identity())
    cache.set(
        cache_key,
        filters.cache_identity(),
        {
            "items": [
                {
                    "name": "WAW01M",
                    "status": "Operating",
                    "type": ["parcel_locker"],
                    "location": {"latitude": 52.2297, "longitude": 21.0122},
                    "address": {"line1": "Marszalkowska 1", "line2": "00-001 Warszawa"},
                    "address_details": {"city": "Warszawa", "province": "mazowieckie"},
                    "functions": ["parcel_collect"],
                }
            ]
        },
        datetime.now(UTC) + timedelta(minutes=30),
    )
    client = CountingClient()
    service = PointSearchService(client=client, cache=cache)

    points, possibly_incomplete = service.search(filters)

    assert client.calls == 0
    assert [point.name for point in points] == ["WAW01M"]
    assert possibly_incomplete is False
