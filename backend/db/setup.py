"""Database startup: create tables and register crawler sources."""

from sqlalchemy import select, update

from backend.db.base import DATA_DIR, Base, SessionLocal, engine
from backend.db.models import EventSource


async def init_db(sources: dict[str, str]) -> None:
    """Create tables, register crawler sources, and clear stale 'syncing' states.

    `sources` maps source name -> URL. A sync interrupted by a server restart
    would otherwise show 'syncing' forever.
    """
    DATA_DIR.mkdir(exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        existing = set((await session.scalars(select(EventSource.name))).all())
        session.add_all(EventSource(name=n, url=u) for n, u in sources.items() if n not in existing)
        await session.execute(
            update(EventSource).where(EventSource.status == "syncing").values(status="idle")
        )
        await session.commit()
