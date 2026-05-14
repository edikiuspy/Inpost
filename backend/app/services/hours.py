import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

WARSAW_TZ = ZoneInfo("Europe/Warsaw")

DAY_CODES = {
    "PN": 0,
    "WT": 1,
    "ŚR": 2,
    "SR": 2,
    "CZ": 3,
    "PT": 4,
    "SB": 5,
    "ND": 6,
}

DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_PART_RE = re.compile(
    r"^([A-ZĄĆĘŁŃÓŚŹŻ]{2})(?:\s*-\s*([A-ZĄĆĘŁŃÓŚŹŻ]{2}))?\s+"
    r"(\d{1,2})[:.]?(\d{0,2})\s*-\s*(\d{1,2})[:.]?(\d{0,2})$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class OpenStatus:
    open_now: bool | None
    open_status: str | None
    closes_in_minutes: int | None
    opens_in_minutes: int | None


def parse_opening_hours(raw: str | None) -> list[tuple[int, time, time]] | None:
    if not raw:
        return None
    text = raw.strip().upper().replace("Ś", "S")
    if text in {"24/7", "24H", "CAŁODOBOWO", "CALODOBOWO"}:
        return [(day, time(0, 0), time(23, 59)) for day in range(7)]
    segments = re.split(r"[,;]", text)
    schedule: list[tuple[int, time, time]] = []
    for part in segments:
        cleaned = part.strip()
        if not cleaned:
            continue
        match = _PART_RE.match(cleaned)
        if not match:
            continue
        start_code = match.group(1)
        end_code = match.group(2) or start_code
        day_start = DAY_CODES.get(start_code)
        day_end = DAY_CODES.get(end_code)
        if day_start is None or day_end is None:
            continue
        try:
            open_t = time(int(match.group(3)), int(match.group(4) or 0))
            close_t = time(int(match.group(5)), int(match.group(6) or 0))
        except ValueError:
            continue
        if day_end >= day_start:
            days = list(range(day_start, day_end + 1))
        else:
            days = list(range(day_start, 7)) + list(range(0, day_end + 1))
        for day in days:
            schedule.append((day, open_t, close_t))
    return schedule or None


def compute_open_status(raw: str | None, now: datetime | None = None) -> OpenStatus:
    schedule = parse_opening_hours(raw)
    if schedule is None:
        return OpenStatus(open_now=None, open_status=None, closes_in_minutes=None, opens_in_minutes=None)
    current = now.astimezone(WARSAW_TZ) if now else datetime.now(WARSAW_TZ)
    today = current.weekday()
    today_minutes = current.hour * 60 + current.minute

    is_24_7 = all(
        any(day == entry[0] and entry[1] == time(0, 0) and entry[2] >= time(23, 59) for entry in schedule)
        for day in range(7)
    )
    if is_24_7:
        return OpenStatus(open_now=True, open_status="Open 24/7", closes_in_minutes=None, opens_in_minutes=None)

    today_entries = sorted([entry for entry in schedule if entry[0] == today], key=lambda entry: entry[1])
    for _, open_t, close_t in today_entries:
        open_m = open_t.hour * 60 + open_t.minute
        close_m = close_t.hour * 60 + close_t.minute
        if open_m <= today_minutes < close_m:
            closes_in = close_m - today_minutes
            label = f"Open · closes {close_t.strftime('%H:%M')}"
            if closes_in <= 30:
                label = f"Closing soon · {close_t.strftime('%H:%M')}"
            return OpenStatus(open_now=True, open_status=label, closes_in_minutes=closes_in, opens_in_minutes=None)
        if today_minutes < open_m:
            opens_in = open_m - today_minutes
            return OpenStatus(
                open_now=False,
                open_status=f"Closed · opens today {open_t.strftime('%H:%M')}",
                closes_in_minutes=None,
                opens_in_minutes=opens_in,
            )

    for offset in range(1, 8):
        next_day = (today + offset) % 7
        future_entries = sorted([entry for entry in schedule if entry[0] == next_day], key=lambda entry: entry[1])
        if not future_entries:
            continue
        _, open_t, _ = future_entries[0]
        opens_in = offset * 24 * 60 - today_minutes + open_t.hour * 60 + open_t.minute
        suffix = "tomorrow" if offset == 1 else DAY_NAMES_EN[next_day]
        return OpenStatus(
            open_now=False,
            open_status=f"Closed · opens {suffix} {open_t.strftime('%H:%M')}",
            closes_in_minutes=None,
            opens_in_minutes=opens_in,
        )
    return OpenStatus(open_now=False, open_status="Closed", closes_in_minutes=None, opens_in_minutes=None)
