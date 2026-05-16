import hashlib
import json
from typing import Any, Optional

from app.core.config import settings
from app.core.logging import logger
from app.services.redis_client import get_redis_client


class RedisCache:
    """Small JSON cache wrapper backed by Redis."""

    def __init__(self, namespace: str = "cache") -> None:
        """Create a namespaced Redis cache helper."""
        self.namespace = namespace
        self.redis = get_redis_client()

    @staticmethod
    def digest(value: str) -> str:
        """Return a stable SHA-256 digest for a cache input string."""
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def key(self, name: str) -> str:
        """Build a fully namespaced cache key."""
        return f"{self.namespace}:{name}"

    async def get_json(self, key: str) -> Optional[Any]:
        """Fetch and decode a JSON value from Redis.

        Returns None on cache miss, disabled cache, or Redis failures.
        """
        if not settings.CACHE_ENABLED:
            return None

        try:
            value = await self.redis.get(self.key(key))
            return json.loads(value) if value else None
        except Exception as exc:
            logger.warning(f"Redis cache read failed: {exc}")
            return None

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Store a JSON value in Redis with a TTL."""
        if not settings.CACHE_ENABLED:
            return

        try:
            await self.redis.setex(self.key(key), ttl_seconds, json.dumps(value))
        except Exception as exc:
            logger.warning(f"Redis cache write failed: {exc}")
