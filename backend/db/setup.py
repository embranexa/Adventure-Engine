"""Database startup: create tables, add new columns, register sources, migrate old data,
backfill the transitions log (once)."""

import logging

from sqlalchemy import Connection, inspect, select, text, update
from sqlalchemy.schema import CreateColumn

from backend.db.base import DB_PATH, Base, SessionLocal, engine
from backend.db.models import AppState, EventSource

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

    await _migrate_saved_places()

    async with engine.begin() as conn:
        # the Refiner was renamed the Refinery: logged moves keep working under the new id
        for column in ("from_node", "to_node"):
            await conn.execute(text(f"UPDATE transitions SET {column} = 'refinery' WHERE {column} = 'refiner'"))

    from backend.services.transitions import backfill  # avoids an import cycle
    await backfill()


async def _migrate_saved_places() -> None:
    """Saved map places (app_state "places") became sites in the Codex: move any left over."""
    from backend.services.objects import migrate_saved_places  # avoids an import cycle

    async with SessionLocal() as session:
        row = await session.get(AppState, "places")
        if row is None:
            return
        places = [p for p in (row.value or {}).get("places", []) if p.get("lat") is not None]
        moved = await migrate_saved_places(places) if places else 0
        await session.delete(row)
        await session.commit()
    if moved:
        log.info("moved %d saved place(s) to sites", moved)
