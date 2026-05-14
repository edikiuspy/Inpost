import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def build_cache_key(params: dict[str, Any]) -> str:
    normalized = _normalize(params)
    encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _normalize(value[key]) for key in sorted(value) if value[key] not in (None, "", [])}
    if isinstance(value, list):
        return sorted(_normalize(item) for item in value if item not in (None, ""))
    return value


class CacheRepository:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def get(self, cache_key: str) -> dict[str, Any] | None:
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT response_body, expires_at FROM api_cache WHERE cache_key = ?",
                (cache_key,),
            ).fetchone()
        if row is None:
            return None

        response_body, expires_at_raw = row
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at <= datetime.now(UTC):
            return None
        return json.loads(response_body)

    def set(
        self,
        cache_key: str,
        request_params: dict[str, Any],
        response_body: dict[str, Any],
        expires_at: datetime,
    ) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO api_cache
                    (cache_key, request_params, response_body, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    cache_key,
                    json.dumps(request_params, ensure_ascii=False, sort_keys=True),
                    json.dumps(response_body, ensure_ascii=False),
                    datetime.now(UTC).isoformat(),
                    expires_at.isoformat(),
                ),
            )

    def _initialize(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS api_cache (
                    cache_key TEXT PRIMARY KEY,
                    request_params TEXT NOT NULL,
                    response_body TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )
