from datetime import UTC, datetime, timedelta

from app.repositories.cache import CacheRepository, build_cache_key


def test_cache_key_is_stable_for_reordered_list_parameters():
    first = build_cache_key({"city": "Warszawa", "functions": ["parcel_send", "parcel_collect"]})
    second = build_cache_key({"functions": ["parcel_collect", "parcel_send"], "city": "Warszawa"})

    assert first == second


def test_cache_returns_payload_before_expiration(tmp_path):
    cache = CacheRepository(tmp_path / "cache.sqlite3")
    expires_at = datetime.now(UTC) + timedelta(minutes=30)

    cache.set("abc", {"city": "Warszawa"}, {"items": [1]}, expires_at)

    assert cache.get("abc") == {"items": [1]}


def test_cache_misses_after_expiration(tmp_path):
    cache = CacheRepository(tmp_path / "cache.sqlite3")
    expires_at = datetime.now(UTC) - timedelta(seconds=1)

    cache.set("abc", {"city": "Warszawa"}, {"items": [1]}, expires_at)

    assert cache.get("abc") is None
