import asyncio
import os
from pathlib import Path
from sqlalchemy import text
import redis.asyncio as aioredis

from database import engine, init_db
from config import settings

async def reset_database():
    print("🧹 [1/4] Truncating database tables...")
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE TABLE activity_logs, risk_clauses, analysis_reports, "
            "document_chunks, documents, users, risk_rules_config CASCADE;"
        ))
    print("✅ All application tables truncated.")

    print("🌱 [2/4] Initializing database and re-seeding default admin and 19 risk rules...")
    await init_db()
    print("✅ Default admin user and 19 risk rules re-seeded successfully.")

    print("⚡ [3/4] Flushing Redis cache...")
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.flushdb()
        await r.aclose()
        print("✅ Redis cache flushed.")
    except Exception as e:
        print(f"⚠️ Redis flush warning: {e}")

    print("📁 [4/4] Cleaning uploads folder...")
    upload_dir = Path("uploads")
    if upload_dir.exists():
        for f in upload_dir.glob("*.enc"):
            try:
                f.unlink()
            except Exception as e:
                print(f"⚠️ Could not delete {f}: {e}")
    print("✅ Uploads folder cleaned.")

    print("\n✨ Database and cache successfully reset to fresh clean state!")

if __name__ == "__main__":
    asyncio.run(reset_database())
