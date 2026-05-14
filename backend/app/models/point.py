from typing import Any

from pydantic import BaseModel, Field


class Location(BaseModel):
    latitude: float
    longitude: float


class Address(BaseModel):
    line1: str | None = None
    line2: str | None = None


class AddressDetails(BaseModel):
    city: str | None = None
    province: str | None = None
    post_code: str | None = None
    street: str | None = None
    building_number: str | None = None
    flat_number: str | None = None


class LockerAvailability(BaseModel):
    status: str | None = None
    details: dict[str, str] | None = None


class UnavailabilityPeriod(BaseModel):
    starts_at: str | None = None
    ends_at: str | None = None
    reason: str | None = None

    model_config = {"extra": "allow"}


class Point(BaseModel):
    name: str
    status: str | None = None
    type: list[str] = Field(default_factory=list)
    location: Location
    address: Address = Field(default_factory=Address)
    address_details: AddressDetails = Field(default_factory=AddressDetails)
    functions: list[str] = Field(default_factory=list)
    distance: int | float | None = None
    opening_hours: str | None = None
    location_247: bool | None = None
    payment_available: bool | None = None
    easy_access_zone: bool | None = None
    locker_availability: LockerAvailability | None = None
    recommended_low_interest_box_machines_list: list[str] | None = None
    image_url: str | None = None
    location_description: str | None = None
    location_type: str | None = None
    location_category: str | None = None
    phone_number: str | None = None
    payment_point_descr: str | None = None
    physical_type_description: str | None = None
    unavailability_periods: list[dict[str, Any]] = Field(default_factory=list)
    operating_hours_extended: dict[str, Any] | None = None


class ScoredPoint(BaseModel):
    name: str
    status: str | None
    type: list[str]
    location: Location
    address: Address
    address_details: AddressDetails
    functions: list[str]
    distance: int | float | None
    opening_hours: str | None
    location_247: bool | None
    payment_available: bool | None
    easy_access_zone: bool | None
    locker_availability: LockerAvailability | None
    recommended_low_interest_box_machines_list: list[str] | None
    image_url: str | None
    location_description: str | None
    location_type: str | None
    location_category: str | None
    phone_number: str | None
    payment_point_descr: str | None
    physical_type_description: str | None
    unavailability_periods: list[dict[str, Any]]
    operating_hours_extended: dict[str, Any] | None
    open_now: bool | None = None
    open_status: str | None = None
    closes_in_minutes: int | None = None
    opens_in_minutes: int | None = None
    score: float
    score_label: str
    score_reasons: list[str]
    marker_color: str


class SearchResponse(BaseModel):
    count: int
    items: list[ScoredPoint]
    possibly_incomplete: bool = False
