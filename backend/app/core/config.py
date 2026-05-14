import os
from pathlib import Path


class Settings:
    inpost_api_base_url = "https://api-global-points.easypack24.net/v1"
    request_timeout_seconds = 8.0
    cache_ttl_seconds = 30 * 60
    cache_db_path = (
        Path("/tmp/inpost-cache.sqlite3")
        if os.getenv("VERCEL")
        else Path(__file__).resolve().parents[2] / "data" / "cache.sqlite3"
    )


settings = Settings()
