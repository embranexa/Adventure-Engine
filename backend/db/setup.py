"""Database startup: create tables, add new columns, register sources, migrate old data,
backfill the transitions log (once)."""

import json
import logging
import uuid

from sqlalchemy import Connection, inspect, select, text, update
from sqlalchemy.schema import CreateColumn

from backend.db.base import DB_PATH, Base, SessionLocal, engine
from backend.db.models import AppState, Entity, EventSource

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


def _migrate_names(conn: Connection) -> None:
    """Renames (2026-11-22): objects -> entities, pillar -> deity, song -> performance, and
    transitions.entity -> subject (what moved), so "entity" only means a Codex entity.

    Runs before create_all, which would otherwise make the new tables empty beside the old
    ones. Safe to run again: each step only touches what still has its old name.
    """
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    for old, new in (("objects", "entities"), ("adventure_objects", "adventure_entities")):
        if old not in tables:
            continue
        if new in tables:
            # an empty one is a leftover of a reload halfway through the rename
            if not conn.execute(text(f"SELECT count(*) FROM {old}")).scalar():
                conn.execute(text(f"DROP TABLE {old}"))
                continue
            if conn.execute(text(f"SELECT count(*) FROM {new}")).scalar():
                raise RuntimeError(f"both {old} and {new} hold rows: merge them by hand")
            conn.execute(text(f"DROP TABLE {new}"))
        conn.execute(text(f"ALTER TABLE {old} RENAME TO {new}"))
        log.info("renamed table %s to %s", old, new)
    for table, old, new in (("adventure_entities", "object_id", "entity_id"), ("transitions", "entity", "subject")):
        tables = set(inspect(conn).get_table_names())
        if table in tables and old in {c["name"] for c in inspect(conn).get_columns(table)}:
            conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}"))
    if "entities" in tables:
        conn.execute(text("UPDATE entities SET type = 'deity' WHERE type = 'pillar'"))
        conn.execute(text("UPDATE entities SET type = 'player' WHERE type = 'contact'"))  # 2026-11-23
    if "enshrinings" in tables:
        conn.execute(text("""UPDATE enshrinings SET discoveries = REPLACE(discoveries, '"type": "contact"', '"type": "player"')
                             WHERE discoveries LIKE '%"type": "contact"%'"""))
    if "adventures" in tables:
        conn.execute(text("UPDATE adventures SET type = 'performance' WHERE type = 'song'"))


def _give_statuses(conn: Connection) -> None:
    """Players linked before parties existed get a status: emergent if a sealed analysis
    discovered them there, else resonant."""
    rows = conn.execute(text("""SELECT l.adventure_id, l.entity_id, l.created_at, n.discoveries
        FROM adventure_entities l JOIN entities e ON e.id = l.entity_id
        LEFT JOIN enshrinings n ON n.adventure_id = l.adventure_id AND n.sealed_at IS NOT NULL
        WHERE e.type = 'player' AND l.status IS NULL""")).all()
    for adventure_id, entity_id, at, discoveries in rows:
        found = {str(d.get("entity_id") or "").replace("-", "") for d in json.loads(discoveries or "[]")}
        conn.execute(text("UPDATE adventure_entities SET status = :s, status_at = :at WHERE adventure_id = :a AND entity_id = :e"),
                     {"s": "emergent" if entity_id in found else "resonant", "at": at, "a": adventure_id, "e": entity_id})


async def init_db(sources: dict[str, str]) -> None:
    """Create tables, add new columns, register crawler sources, clear stale 'syncing'.

    `sources` maps source name -> URL. A sync interrupted by a server restart
    would otherwise show 'syncing' forever.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(_migrate_names)
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)
        await conn.run_sync(_give_statuses)

    async with SessionLocal() as session:
        existing = set((await session.scalars(select(EventSource.name))).all())
        session.add_all(EventSource(name=n, url=u) for n, u in sources.items() if n not in existing)
        await session.execute(
            update(EventSource).where(EventSource.status == "syncing").values(status="idle")
        )
        await session.commit()

    await _migrate_saved_places()
    await _seed_spells()

    async with engine.begin() as conn:
        # the Refiner was renamed the Refinery: logged moves keep working under the new id
        for column in ("from_node", "to_node"):
            await conn.execute(text(f"UPDATE transitions SET {column} = 'refinery' WHERE {column} = 'refiner'"))

    from backend.services.transitions import backfill  # avoids an import cycle
    await backfill()


SPELLS = ("Hook", "Propose", "Combine", "Transition", "Enter", "Exit", "Reflect", "Charge", "Discharge", "Deflect", "Evade")


async def _seed_spells() -> None:
    """Once: the first spells. Deleted ones stay deleted."""
    async with SessionLocal() as session:
        if await session.get(AppState, "spells_seeded"):
            return
        have = {n.lower() for n in (await session.scalars(select(Entity.name).where(Entity.type == "spell"))).all()}
        session.add_all(Entity(id=uuid.uuid4(), type="spell", name=n, details={}) for n in SPELLS if n.lower() not in have)
        session.add(AppState(key="spells_seeded", value=True))
        await session.commit()


async def _migrate_saved_places() -> None:
    """Saved map places (app_state "places") became sites in the Codex: move any left over."""
    from backend.services.entities import migrate_saved_places  # avoids an import cycle

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
