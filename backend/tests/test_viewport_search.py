from app.clients.inpost_client import InPostClient
from app.models.search import SearchFilters
from app.services.point_search import PointSearchService


class BoundsClient:
    def search_points(self, filters):
        return {
            "items": [
                {
                    "name": "INSIDE",
                    "status": "Operating",
                    "type": ["parcel_locker"],
                    "location": {"latitude": 52.23, "longitude": 21.01},
                    "address": {},
                    "address_details": {},
                    "functions": ["parcel_collect"],
                },
                {
                    "name": "OUTSIDE",
                    "status": "Operating",
                    "type": ["parcel_locker"],
                    "location": {"latitude": 53.0, "longitude": 21.01},
                    "address": {},
                    "address_details": {},
                    "functions": ["parcel_collect"],
                },
            ]
        }


class TileRecordingClient:
    def __init__(self):
        self.filters = []

    def search_points(self, filters):
        self.filters.append(filters)
        center = filters.viewport_center
        return {
            "items": [
                {
                    "name": f"TILE-{len(self.filters)}",
                    "status": "Operating",
                    "type": ["parcel_locker"],
                    "location": {"latitude": center[0], "longitude": center[1]},
                    "address": {},
                    "address_details": {},
                    "functions": ["parcel_collect"],
                },
                {
                    "name": "DUPLICATE",
                    "status": "Operating",
                    "type": ["parcel_locker"],
                    "location": {"latitude": center[0], "longitude": center[1]},
                    "address": {},
                    "address_details": {},
                    "functions": ["parcel_collect"],
                },
            ]
        }


class NoCache:
    def get(self, cache_key):
        return None

    def set(self, cache_key, request_params, response_body, expires_at):
        return None


def test_client_uses_relative_search_for_viewport_bounds():
    filters = SearchFilters(north=52.25, south=52.2, east=21.05, west=20.95, limit=500)

    params = InPostClient()._build_params(filters)

    assert params["relative_point"] == "52.225,21.0"
    assert params["sort_by"] == "distance_to_relative_point"
    assert params["limit"] == 500
    assert 1000 < params["max_distance"] < 10_000


def test_service_filters_points_to_visible_bounds():
    filters = SearchFilters(north=52.25, south=52.2, east=21.05, west=20.95, limit=500)
    service = PointSearchService(client=BoundsClient(), cache=NoCache())

    points, _possibly_incomplete = service.search(filters)

    assert [point.name for point in points] == ["INSIDE"]


def test_viewport_search_does_not_expose_distance_without_user_location():
    filters = SearchFilters(north=52.25, south=52.2, east=21.05, west=20.95, limit=500)
    service = PointSearchService(client=BoundsClient(), cache=NoCache())

    points, _possibly_incomplete = service.search(filters)

    assert points[0].distance is None


def test_viewport_search_recomputes_distance_from_user_location():
    filters = SearchFilters(
        north=52.25,
        south=52.2,
        east=21.05,
        west=20.95,
        lat=52.23,
        lon=21.01,
        limit=500,
    )
    service = PointSearchService(client=BoundsClient(), cache=NoCache())

    points, _possibly_incomplete = service.search(filters)

    assert points[0].distance == 0


def test_medium_viewport_is_split_into_bounded_tile_requests():
    filters = SearchFilters(north=52.30, south=52.20, east=21.10, west=20.90, limit=500)
    client = TileRecordingClient()
    service = PointSearchService(client=client, cache=NoCache())

    points, possibly_incomplete = service.search(filters)

    assert len(client.filters) == 4
    assert len({point.name for point in points}) == len(points)
    assert "DUPLICATE" in {point.name for point in points}
    assert possibly_incomplete is False


def test_wide_viewport_uses_at_most_nine_tile_requests():
    filters = SearchFilters(north=52.50, south=52.00, east=21.50, west=20.50, limit=500)
    client = TileRecordingClient()
    service = PointSearchService(client=client, cache=NoCache())

    _points, _possibly_incomplete = service.search(filters)

    assert len(client.filters) == 9


def test_tile_that_hits_limit_marks_result_as_possibly_incomplete():
    filters = SearchFilters(north=52.30, south=52.20, east=21.10, west=20.90, limit=2)
    client = TileRecordingClient()
    service = PointSearchService(client=client, cache=NoCache())

    _points, possibly_incomplete = service.search(filters)

    assert possibly_incomplete is True
