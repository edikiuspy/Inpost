from fastapi.testclient import TestClient

from app.main import create_app
from app.models.point import Point


class FakePointService:
    def search(self, filters):
        point = Point.model_validate(
            {
                "name": "WAW01M",
                "status": "Operating",
                "type": ["parcel_locker"],
                "location": {"latitude": 52.2297, "longitude": 21.0122},
                "address": {"line1": "Marszalkowska 1", "line2": "00-001 Warszawa"},
                "address_details": {
                    "city": "Warszawa",
                    "province": "mazowieckie",
                    "post_code": "00-001",
                },
                "functions": ["parcel_collect", "parcel_send"],
                "distance": 123,
                "opening_hours": "24/7",
                "location_247": True,
                "payment_available": True,
                "easy_access_zone": True,
                "locker_availability": {"status": "NO_DATA", "details": {}},
                "recommended_low_interest_box_machines_list": [],
            }
        )
        return [point]


class FailingPointService:
    def search(self, filters):
        raise RuntimeError("InPost API request failed")


def test_search_endpoint_returns_normalized_points():
    app = create_app(point_service=FakePointService())
    client = TestClient(app)

    response = client.get("/api/points/search?city=Warszawa&functions=parcel_collect")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["items"][0]["name"] == "WAW01M"
    assert body["items"][0]["score"] >= 1
    assert body["items"][0]["marker_color"] in {"green", "yellow", "orange", "red", "gray"}


def test_search_endpoint_returns_controlled_error_for_backend_failure():
    app = create_app(point_service=FailingPointService())
    client = TestClient(app)

    response = client.get("/api/points/search?city=Warszawa")

    assert response.status_code == 502
    assert response.json()["detail"] == "Could not fetch InPost points right now."
