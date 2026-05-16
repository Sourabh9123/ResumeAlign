from functools import lru_cache

import redis.asyncio as redis

from app.core.config import settings


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    """Return a shared async Redis client configured from application settings."""
    return redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
