from dataclasses import dataclass

from app.models.point import Point
from app.models.search import SearchFilters
from app.services.hours import OpenStatus, compute_open_status


@dataclass(frozen=True)
class ScoreResult:
    score: float
    label: str
    reasons: list[str]
    marker_color: str
    open_status: OpenStatus


def score_point(point: Point, filters: SearchFilters) -> ScoreResult:
    open_status = compute_open_status(point.opening_hours)
    if point.status != "Operating":
        status = point.status or "unknown"
        reasons = [f"Point status is {status}, most likely unavailable."]
        if status == "Created":
            reasons.append("Created points are registered but not yet in service.")
        return ScoreResult(
            score=1.0,
            label="Unavailable",
            reasons=reasons,
            marker_color="gray",
            open_status=open_status,
        )

    score = 3.0
    reasons: list[str] = ["Point is operating."]

    if "parcel_locker" in point.type:
        score += 0.45
        reasons.append("Parcel locker type matches common pickup and send workflows.")
    elif filters.point_type:
        score -= 0.5
        reasons.append("Point type does not match the preferred locker type.")

    if filters.functions:
        available = set(point.functions)
        required = set(filters.functions)
        missing = sorted(required - available)
        if missing:
            score -= min(1.2, 0.45 * len(missing))
            reasons.append(f"Missing required services: {', '.join(missing)}.")
        else:
            score += 0.65
            reasons.append("Supports all selected services.")

    if point.location_247:
        score += 0.45
        reasons.append("Open 24/7.")
    elif filters.only_247:
        score -= 0.8
        reasons.append("Not available 24/7.")

    if point.payment_available:
        score += 0.25
        reasons.append("Payment support is available.")
    elif filters.payment_required:
        score -= 0.7
        reasons.append("Payment support is required but not available.")

    if point.easy_access_zone:
        score += 0.2
        reasons.append("Easy access zone.")

    if filters.has_location and point.distance is not None:
        distance = float(point.distance)
        if distance <= 300:
            score += 0.55
            reasons.append("Distance is very close to the selected location.")
        elif distance <= 1_000:
            score += 0.35
            reasons.append("Distance is close to the selected location.")
        elif distance <= 3_000:
            score += 0.1
            reasons.append("Distance is acceptable for the selected location.")
        else:
            score -= 0.45
            reasons.append("Distance is relatively far from the selected location.")

    availability = point.locker_availability
    if availability and availability.status and availability.status != "NO_DATA":
        if availability.status.upper() in {"AVAILABLE", "HIGH", "MEDIUM"}:
            score += 0.25
            reasons.append("Locker availability signal is positive.")
        elif availability.status.upper() in {"LOW", "FULL", "UNAVAILABLE"}:
            score -= 0.5
            reasons.append("Locker availability signal is limited.")

    if open_status.open_now is False:
        score -= 1.4
        if open_status.open_status:
            reasons.append(open_status.open_status + ".")
        else:
            reasons.append("Currently closed.")
    elif open_status.open_now is True:
        if open_status.closes_in_minutes is not None and open_status.closes_in_minutes <= 30:
            score -= 0.4
            reasons.append(f"Closing soon (~{open_status.closes_in_minutes} min).")
        else:
            score += 0.2
            if open_status.open_status and not point.location_247:
                reasons.append(open_status.open_status + ".")

    bounded = round(max(1.0, min(5.0, score)), 1)
    return ScoreResult(
        score=bounded,
        label=_score_label(bounded),
        reasons=reasons[:5],
        marker_color=_marker_color(bounded),
        open_status=open_status,
    )


def _score_label(score: float) -> str:
    if score >= 4.5:
        return "Excellent match"
    if score >= 3.5:
        return "Good match"
    if score >= 2.5:
        return "Usable"
    return "Weak match"


def _marker_color(score: float) -> str:
    if score >= 4.5:
        return "green"
    if score >= 3.5:
        return "yellow"
    if score >= 2.5:
        return "orange"
    return "red"
