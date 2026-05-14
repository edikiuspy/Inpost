import math

from pydantic import BaseModel, Field, field_validator, model_validator


class SearchFilters(BaseModel):
    city: str | None = None
    province: str | None = None
    post_code: str | None = None
    lat: float | None = None
    lon: float | None = None
    max_distance: int = Field(default=10_000, ge=100, le=50_000)
    limit: int = Field(default=50, ge=1, le=500)
    point_type: str | None = None
    functions: list[str] = Field(default_factory=list)
    only_247: bool = False
    payment_required: bool = False
    open_now: bool = False
    north: float | None = Field(default=None, ge=-90, le=90)
    south: float | None = Field(default=None, ge=-90, le=90)
    east: float | None = Field(default=None, ge=-180, le=180)
    west: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("city", "province", "post_code", "point_type", mode="before")
    @classmethod
    def blank_string_to_none(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("functions", mode="before")
    @classmethod
    def normalize_functions(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def has_location(self) -> bool:
        return self.lat is not None and self.lon is not None

    @property
    def has_bounds(self) -> bool:
        return None not in (self.north, self.south, self.east, self.west)

    @property
    def viewport_center(self) -> tuple[float, float] | None:
        if not self.has_bounds:
            return None
        return ((self.north + self.south) / 2, (self.east + self.west) / 2)

    @property
    def viewport_radius(self) -> int | None:
        if not self.has_bounds:
            return None
        center = self.viewport_center
        corners = [
            (self.north, self.east),
            (self.north, self.west),
            (self.south, self.east),
            (self.south, self.west),
        ]
        radius = max(haversine_meters(center[0], center[1], lat, lon) for lat, lon in corners)
        return max(100, min(50_000, math.ceil(radius)))

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.has_bounds and self.south > self.north:
            raise ValueError("south cannot be greater than north")
        return self

    def cache_identity(self) -> dict:
        in_bounds_mode = self.has_bounds
        return {
            "city": None if in_bounds_mode else self.city,
            "province": None if in_bounds_mode else self.province,
            "post_code": None if in_bounds_mode else self.post_code,
            "lat": self.lat,
            "lon": self.lon,
            "max_distance": self.max_distance if self.has_location else None,
            "limit": self.limit,
            "type": self.point_type,
            "functions": self.functions,
            "only_247": self.only_247,
            "payment_required": self.payment_required,
            "open_now": self.open_now,
            "north": self.north,
            "south": self.south,
            "east": self.east,
            "west": self.west,
        }


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * earth_radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))
