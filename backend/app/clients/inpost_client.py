from typing import Any

import httpx

from app.core.config import settings
from app.models.search import SearchFilters


POINT_FIELDS = ",".join(
    [
        "name",
        "type",
        "status",
        "location",
        "distance",
        "opening_hours",
        "address",
        "address_details",
        "functions",
        "payment_available",
        "recommended_low_interest_box_machines_list",
        "location_247",
        "image_url",
        "easy_access_zone",
        "locker_availability",
        "location_description",
        "location_type",
        "location_category",
        "phone_number",
        "payment_point_descr",
        "physical_type_description",
        "unavailability_periods",
        "operating_hours_extended",
    ]
)


class InPostClient:
    def __init__(self, base_url: str = settings.inpost_api_base_url):
        self.base_url = base_url.rstrip("/")

    def search_points(self, filters: SearchFilters) -> dict[str, Any]:
        params = self._build_params(filters)
        with httpx.Client(timeout=settings.request_timeout_seconds) as client:
            response = client.get(f"{self.base_url}/points", params=params)
            response.raise_for_status()
            return response.json()

    def _build_params(self, filters: SearchFilters) -> dict[str, Any]:
        params: dict[str, Any] = {
            "fields": POINT_FIELDS,
        }

        if not filters.has_bounds:
            if filters.city:
                params["city"] = filters.city
            if filters.province:
                params["province"] = filters.province
            if filters.post_code:
                params["post_code"] = filters.post_code
        if filters.point_type:
            params["type"] = filters.point_type
        if filters.functions:
            params["functions"] = ",".join(sorted(filters.functions))

        if filters.has_bounds:
            center = filters.viewport_center
            params["relative_point"] = f"{center[0]},{center[1]}"
            params["sort_by"] = "distance_to_relative_point"
            params["sort_order"] = "asc"
            params["max_distance"] = filters.viewport_radius
            params["limit"] = filters.limit
        elif filters.has_location:
            params["relative_point"] = f"{filters.lat},{filters.lon}"
            params["sort_by"] = "distance_to_relative_point"
            params["sort_order"] = "asc"
            params["max_distance"] = filters.max_distance
            params["limit"] = filters.limit
        else:
            params["per_page"] = filters.limit
            params["sort_by"] = "name"
            params["sort_order"] = "asc"

        return params
