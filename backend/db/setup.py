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


def _unlink_spells(conn: Connection) -> None:
    """Spells could be linked for a while (2026-11-23); now they can't."""
    spells = "(SELECT id FROM entities WHERE type = 'spell')"
    conn.execute(text(f"DELETE FROM adventure_entities WHERE entity_id IN {spells}"))
    conn.execute(text(f"DELETE FROM entity_links WHERE from_id IN {spells} OR to_id IN {spells}"))


def _fix_attributes(conn: Connection) -> None:
    """2026-11-24: attributes became a fixed list (they were Codex entities for a day), and two
    archetypes went (their players have none now)."""
    conn.execute(text("DELETE FROM entities WHERE type = 'attribute'"))
    conn.execute(text("""UPDATE entities SET details = json_remove(details, '$.archetype')
        WHERE type = 'player' AND json_extract(details, '$.archetype') IN ('summoner', 'patron')"""))


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
        await conn.run_sync(_unlink_spells)
        await conn.run_sync(_fix_attributes)

    async with SessionLocal() as session:
        existing = set((await session.scalars(select(EventSource.name))).all())
        session.add_all(EventSource(name=n, url=u) for n, u in sources.items() if n not in existing)
        await session.execute(
            update(EventSource).where(EventSource.status == "syncing").values(status="idle")
        )
        await session.commit()

    await _migrate_saved_places()
    await _seed_spells()
    await _rename_archetypes()
    await _rename_old_archetypes()
    await _form_deities()
    await _rename_state("idols", "paragons")
    await _rename_state("anvil", "targets")

    async with engine.begin() as conn:
        # renamed machines: logged moves keep working under their new ids
        for old, new in NODE_RENAMES.items():
            for column in ("from_node", "to_node"):
                await conn.execute(text(f"UPDATE transitions SET {column} = :new WHERE {column} = :old"), {"old": old, "new": new})

    from backend.services.transitions import backfill  # avoids an import cycle
    await backfill()


# machine ids in the transitions log
NODE_RENAMES = {"refiner": "athanor", "refinery": "athanor", "alembic": "anvil", "forge": "lode"}
ARCHETYPE_RENAMES = {"performer": "bard", "resonator": "cleric", "cleric": "druid", "rogue": "ranger", "warlock": "templar"}


async def _rename_archetypes() -> None:
    """Once (2026-11-24). All at a time: the old cleric is the druid, and the resonator the new cleric."""
    async with SessionLocal() as session:
        if await session.get(AppState, "archetypes_renamed"):
            return
        for player in (await session.scalars(select(Entity).where(Entity.type == "player"))).all():
            new = ARCHETYPE_RENAMES.get((player.details or {}).get("archetype"))
            if new:
                player.details = {**player.details, "archetype": new}
        row = await session.get(AppState, "idols")
        if row:
            row.value = {"idols": {ARCHETYPE_RENAMES.get(k, k): v for k, v in (row.value or {}).get("idols", {}).items()}}
        session.add(AppState(key="archetypes_renamed", value=True))
        await session.commit()


RENAMED_ARCHETYPES = {"juggernaut": "paladin", "terraformer": "mariner"}


async def _rename_old_archetypes() -> None:
    """2026-11-24: juggernaut became paladin, terraformer mariner."""
    async with SessionLocal() as session:
        for player in (await session.scalars(select(Entity).where(Entity.type == "player"))).all():
            new = RENAMED_ARCHETYPES.get((player.details or {}).get("archetype"))
            if new:
                player.details = {**player.details, "archetype": new}
        row = await session.get(AppState, "paragons")
        notes = ((row.value if row else None) or {}).get("paragons", {})
        if notes.keys() & RENAMED_ARCHETYPES.keys():
            row.value = {"paragons": {RENAMED_ARCHETYPES.get(k, k): v for k, v in notes.items()}}
        await session.commit()


async def _form_deities() -> None:
    """Once (2026-11-24): each deity its own form; NexaGraph became Career."""
    forms = {"embra nexa": "music", "movement": "dance", "family": "family", "nexagraph": "career", "career": "career", "lexa": "games"}
    async with SessionLocal() as session:
        if await session.get(AppState, "deities_formed"):
            return
        for deity in (await session.scalars(select(Entity).where(Entity.type == "deity"))).all():
            form = forms.get(deity.name.strip().lower())
            if form:
                deity.details = {**(deity.details or {}), "form": form}
            if deity.name.strip().lower() == "nexagraph":
                deity.name = "Career"
        session.add(AppState(key="deities_formed", value=True))
        await session.commit()


async def _rename_state(old: str, new: str) -> None:
    """2026-11-24: the Cohort's idols became paragons; the Crucible's anvil, targets (the Anvil is a machine now)."""
    async with SessionLocal() as session:
        row = await session.get(AppState, old)
        if row is None:
            return
        if await session.get(AppState, new) is None:
            value = row.value or {}
            session.add(AppState(key=new, value={new: value[old]} if old in value else value))
        await session.delete(row)
        await session.commit()


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
