"""Redis-based simulation result caching.

Caches simulation results keyed by a SHA-256 hash of the canonical
request JSON. Results are zlib-compressed to reduce memory usage.
TTL: 1 hour.
"""

import hashlib
import json
import logging
import zlib
from typing import Any

import redis.asyncio as redis

from src.config import settings

logger = logging.getLogger("antsim.cache")

_redis_pool: redis.Redis | None = None
CACHE_TTL_SECONDS = 3600  # 1 hour


async def get_redis() -> redis.Redis | None:
    """Get or create the Redis connection pool. Returns None if unavailable."""
    global _redis_pool
    if _redis_pool is not None:
        return _redis_pool
    try:
        _redis_pool = redis.from_url(
            settings.redis_url,
            decode_responses=False,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # Verify connection
        await _redis_pool.ping()
        logger.info("Redis connected at %s", settings.redis_url)
        return _redis_pool
    except Exception as e:
        logger.warning("Redis unavailable: %s — caching disabled", e)
        _redis_pool = None
        return None


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None
        logger.info("Redis connection closed")


def compute_cache_key(request_dict: dict[str, Any]) -> str:
    """Compute a deterministic cache key from the simulation request.

    Canonicalizes the JSON (sorted keys, no whitespace) and returns
    a SHA-256 hex digest prefixed with 'sim:'.
    """
    canonical = json.dumps(request_dict, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sim:{digest}"


async def get_cached_result(cache_key: str) -> dict[str, Any] | None:
    """Retrieve a cached simulation result. Returns None on miss or error."""
    r = await get_redis()
    if r is None:
        return None
    try:
        data = await r.get(cache_key)
        if data is None:
            return None
        decompressed = zlib.decompress(data)
        result = json.loads(decompressed)
        logger.debug("Cache HIT: %s", cache_key)
        return result
    except Exception as e:
        logger.warning("Cache read error for %s: %s", cache_key, e)
        return None


async def set_cached_result(cache_key: str, result_dict: dict[str, Any]) -> None:
    """Store a simulation result in cache with TTL."""
    r = await get_redis()
    if r is None:
        return
    try:
        serialized = json.dumps(result_dict, separators=(",", ":"))
        compressed = zlib.compress(serialized.encode("utf-8"), level=6)
        await r.setex(cache_key, CACHE_TTL_SECONDS, compressed)
        logger.debug(
            "Cache SET: %s (%d bytes compressed)", cache_key, len(compressed)
        )
    except Exception as e:
        logger.warning("Cache write error for %s: %s", cache_key, e)
