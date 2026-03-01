"""Redis sliding window rate limiter.

Limits are configured via environment variables (see config.py):
  - RATE_LIMIT_ENABLED (default: false)
  - RATE_LIMIT_PER_HOUR (default: 30)
  - RATE_LIMIT_WINDOW_SECONDS (default: 3600)
  - MAX_CONCURRENT_PER_IP (default: 5)

Returns 429 Too Many Requests with Retry-After header on limit.
"""

import logging
import time

from fastapi import Request, HTTPException

import redis.asyncio as redis

from src.config import settings
from src.simulation.cache import get_redis

logger = logging.getLogger("antsim.rate_limiter")


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Take the first (client) IP from the chain
        return forwarded.split(",")[0].strip()
    client = request.client
    if client:
        return client.host
    return "unknown"


async def check_rate_limit(request: Request) -> None:
    """Check rate limits and raise HTTPException(429) if exceeded.

    Uses Redis sorted sets with timestamps as scores for a sliding window.
    Falls back to allowing requests if Redis is unavailable.
    Bypassed entirely when rate_limit_enabled is False (default).
    """
    if not settings.rate_limit_enabled:
        return

    r = await get_redis()
    if r is None:
        # No Redis = no rate limiting
        return

    client_ip = _get_client_ip(request)
    now = time.time()
    window_start = now - settings.rate_limit_window_seconds

    rate_key = f"rate:{client_ip}"
    concurrent_key = f"concurrent:{client_ip}"

    try:
        pipe = r.pipeline()

        # Remove expired entries from the sliding window
        pipe.zremrangebyscore(rate_key, 0, window_start)
        # Count requests in current window
        pipe.zcard(rate_key)
        # Check concurrent count
        pipe.get(concurrent_key)

        results = await pipe.execute()
        request_count: int = results[1]
        concurrent_raw = results[2]
        concurrent_count = int(concurrent_raw) if concurrent_raw else 0

        # Check hourly rate limit
        if request_count >= settings.rate_limit_per_hour:
            # Find the oldest entry to compute retry-after
            oldest = await r.zrange(rate_key, 0, 0, withscores=True)
            retry_after = settings.rate_limit_window_seconds
            if oldest:
                oldest_time = oldest[0][1]
                retry_after = max(1, int(oldest_time + settings.rate_limit_window_seconds - now))

            logger.warning(
                "Rate limit exceeded for %s: %d requests in window",
                client_ip, request_count,
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit of {settings.rate_limit_per_hour} simulations per hour exceeded",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        # Check concurrent limit
        if concurrent_count >= settings.max_concurrent_per_ip:
            logger.warning(
                "Concurrent limit exceeded for %s: %d active",
                client_ip, concurrent_count,
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "concurrent_limit_exceeded",
                    "message": f"Maximum {settings.max_concurrent_per_ip} concurrent simulations exceeded",
                    "retry_after": 5,
                },
                headers={"Retry-After": "5"},
            )

        # Record this request in the sliding window
        await r.zadd(rate_key, {f"{now}": now})
        await r.expire(rate_key, settings.rate_limit_window_seconds + 60)

        # Increment concurrent counter
        await r.incr(concurrent_key)
        await r.expire(concurrent_key, 120)  # Auto-expire in case of crash

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Rate limiter error: %s — allowing request", e)


async def release_concurrent(request: Request) -> None:
    """Decrement the concurrent simulation counter after completion."""
    r = await get_redis()
    if r is None:
        return

    client_ip = _get_client_ip(request)
    concurrent_key = f"concurrent:{client_ip}"

    try:
        val = await r.decr(concurrent_key)
        # Don't let it go negative
        if val < 0:
            await r.set(concurrent_key, 0, ex=120)
    except Exception as e:
        logger.warning("Failed to release concurrent counter: %s", e)
