"""Database startup: create tables, add new columns, register crawler sources."""

import logging

from sqlalchemy import Connection, inspect, select, text, update
from sqlalchemy.schema import CreateColumn

from backend.db.base import DB_PATH, Base, SessionLocal, engine
from backend.db.models import EventSource

log = logging.getLogger(__name__)


def _add_missing_columns(conn: Connection) -> None:
    """Add columns defined in the models but missing from existing tables.

    create_all() only creates missing *tables*, so a column added to a model later
    (e.g. events.review) would never reach an existing database. New columns must be
    nullable or have a server_default, since existing rows need a value.
    """
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all made it with every column
        have = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue
            if not column.nullable and column.server_default is None:
                raise RuntimeError(
                    f"can't add {table.name}.{column.name} to existing rows: "
                    "make it nullable or give it a server_default"
                )
            ddl = CreateColumn(column).compile(dialect=conn.dialect)
            conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
            log.info("added column %s.%s", table.name, column.name)


async def init_db(sources: dict[str, str]) -> None:
    """Create tables, add new columns, register crawler sources, clear stale 'syncing'.

    `sources` maps source name -> URL. A sync interrupted by a server restart
    would otherwise show 'syncing' forever.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)

    async with SessionLocal() as session:
        existing = set((await session.scalars(select(EventSource.name))).all())
        session.add_all(EventSource(name=n, url=u) for n, u in sources.items() if n not in existing)
        await session.execute(
            update(EventSource).where(EventSource.status == "syncing").values(status="idle")
        )
        await session.commit()
