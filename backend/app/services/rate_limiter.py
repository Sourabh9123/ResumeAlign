from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.logging import logger
from app.models.user import User
from app.services.redis_client import get_redis_client


@dataclass(frozen=True)
class RateLimitPolicy:
    """Configuration for one fixed-window rate limit bucket."""

    name: str
    requests: int
    window_seconds: int


class RedisRateLimiter:
    """Redis-backed fixed-window rate limiter for API endpoints."""

    def __init__(self) -> None:
        """Create a limiter using the shared Redis connection."""
        self.redis = get_redis_client()

    async def check(
        self,
        policy: RateLimitPolicy,
        request: Request,
        user: Optional[User] = None,
    ) -> None:
        """Increment and enforce a rate-limit bucket.

        Args:
            policy: Limit name, request count, and window length.
            request: Current FastAPI request.
            user: Authenticated user when available.

        Raises:
            HTTPException: 429 when the caller exceeds the configured limit.
        """
        if not settings.RATE_LIMIT_ENABLED:
            return

        identity = str(user.id) if user and getattr(user, "id", None) else self._client_ip(request)
        key = f"rate:{policy.name}:{identity}"

        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, policy.window_seconds)
            ttl = await self.redis.ttl(key)
        except Exception as exc:
            logger.warning(f"Redis rate limit check failed open: {exc}")
            return

        if count > policy.requests:
            retry_after = ttl if ttl > 0 else policy.window_seconds
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    @staticmethod
    def _client_ip(request: Request) -> str:
        """Resolve a best-effort client IP for unauthenticated limits."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip()
        return request.client.host if request.client else "unknown"


rate_limiter = RedisRateLimiter()
