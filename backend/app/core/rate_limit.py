import asyncio
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from app.core.config import settings
from app.api.dependencies import get_current_user, get_optional_current_user


@dataclass(frozen=True)
class RateLimit:
    limit: int
    window_seconds: int


_memory_hits: OrderedDict[str, tuple[float, int]] = OrderedDict()
_memory_lock = asyncio.Lock()
_redis: Redis | None = Redis.from_url(settings.REDIS_URL, decode_responses=True) if settings.REDIS_URL else None
_MAX_MEMORY_KEYS = 10_000


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _check_memory(key: str, limit: RateLimit, now: float) -> tuple[int, float]:
    async with _memory_lock:
        window_start, count = _memory_hits.get(key, (now, 0))
        if now - window_start >= limit.window_seconds:
            window_start, count = now, 0
        count += 1
        _memory_hits[key] = (window_start, count)
        _memory_hits.move_to_end(key)
        while len(_memory_hits) > _MAX_MEMORY_KEYS:
            _memory_hits.popitem(last=False)
        return count, window_start + limit.window_seconds


async def _check_redis(key: str, limit: RateLimit, now: float) -> tuple[int, float]:
    assert _redis is not None
    redis_key = f"quiz-hero:rate-limit:{key}"
    count = await _redis.incr(redis_key)
    if count == 1:
        await _redis.expire(redis_key, limit.window_seconds)
    ttl = await _redis.ttl(redis_key)
    return count, now + max(ttl, 1)


def rate_limit(
    limit: int,
    window_seconds: int,
    *,
    authenticated: bool = False,
) -> Callable:
    configured_limit = RateLimit(limit, window_seconds)

    async def dependency(
        request: Request,
        current_user=Depends(get_current_user if authenticated else get_optional_current_user),
    ) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return

        identity = current_user.email.lower() if current_user else _client_key(request)
        key = f"{request.method}:{request.url.path}:{identity}"
        now = time.time()
        try:
            if _redis is not None:
                count, reset_at = await _check_redis(key, configured_limit, now)
            else:
                count, reset_at = await _check_memory(key, configured_limit, now)
        except Exception as exc:
            if settings.ENVIRONMENT.lower() == "production":
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limiting service is unavailable.",
                ) from exc
            count, reset_at = await _check_memory(key, configured_limit, now)

        if count > configured_limit.limit:
            retry_after = max(1, int(reset_at - now))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
