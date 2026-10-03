import logging
from contextlib import asynccontextmanager
from typing import Optional
import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger("legalbot.redis")

_pool: Optional[aioredis.ConnectionPool] = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Return singleton Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20
        )
    return _pool


@asynccontextmanager
async def get_redis():
    """
    Async context manager yielding a managed Redis client from the shared connection pool.
    Guarantees proper closing without connection leaks.
    """
    client = aioredis.Redis(connection_pool=get_redis_pool())
    try:
        yield client
    finally:
        await client.aclose()


async def close_redis_pool():
    """Disconnect and clean up global Redis pool during shutdown."""
    global _pool
    if _pool is not None:
        await _pool.disconnect()
        _pool = None
        logger.info("Redis connection pool disconnected.")
