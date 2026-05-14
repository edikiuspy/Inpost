from app.models.point import Point
from app.models.search import SearchFilters
from app.services.scoring import score_point


def make_point(**overrides):
    base = {
        "name": "WAW01M",
        "status": "Operating",
        "type": ["parcel_locker"],
        "location": {"latitude": 52.2297, "longitude": 21.0122},
        "address": {"line1": "Marszalkowska 1", "line2": "00-001 Warszawa"},
        "address_details": {"city": "Warszawa", "province": "mazowieckie", "post_code": "00-001"},
        "functions": ["parcel", "parcel_collect", "parcel_send"],
        "distance": None,
        "opening_hours": "24/7",
        "location_247": True,
        "payment_available": True,
        "easy_access_zone": True,
        "locker_availability": {
            "status": "NO_DATA",
            "details": {"A": "NO_DATA", "B": "NO_DATA", "C": "NO_DATA"},
        },
        "recommended_low_interest_box_machines_list": ["WAW02M"],
    }
    base.update(overrides)
    return Point.model_validate(base)


def test_distance_is_ignored_when_user_location_is_missing():
    close_point = make_point(name="CLOSE", distance=100)
    far_point = make_point(name="FAR", distance=5_000)
    filters = SearchFilters()

    close_score = score_point(close_point, filters)
    far_score = score_point(far_point, filters)

    assert close_score.score == far_score.score
    assert all("Distance" not in reason for reason in far_score.reasons)


def test_distance_improves_score_when_user_location_is_present():
    close_point = make_point(name="CLOSE", distance=100)
    far_point = make_point(name="FAR", distance=5_000)
    filters = SearchFilters(lat=52.2297, lon=21.0122)

    assert score_point(close_point, filters).score > score_point(far_point, filters).score


def test_no_data_locker_availability_does_not_change_score():
    no_data = make_point(locker_availability={"status": "NO_DATA", "details": {}})
    missing = make_point(locker_availability=None)
    filters = SearchFilters()

    assert score_point(no_data, filters).score == score_point(missing, filters).score


def test_required_functions_affect_score_and_reasons():
    point = make_point(functions=["parcel_collect"])
    filters = SearchFilters(functions=["parcel_collect", "parcel_send"])

    result = score_point(point, filters)

    assert result.score < 5
    assert any("Missing required services" in reason for reason in result.reasons)


def test_non_operating_point_gets_low_score_and_gray_marker():
    point = make_point(status="Disabled")

    result = score_point(point, SearchFilters())

    assert result.score <= 2
    assert result.marker_color == "gray"
