"""Entities (the Codex): list, create, edit, delete; link them to adventures."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.queries import list_entities
from backend.routers.errors import triage_errors
from backend.schemas.entities import EntityCreate, EntityUpdate
from backend.services import entities

router = APIRouter(tags=["entities"])


@router.get("/entities")
async def get_entities(session: AsyncSession = Depends(get_session)):
    return await list_entities(session)


@router.post("/entities")
async def create_entity(payload: EntityCreate):
    """A new deity, site, player, organization, skill or spell. 422 if a field is invalid."""
    try:
        return await entities.create_entity(payload.model_dump(exclude_unset=True) | {"type": payload.type})
    except entities.InvalidEntity as e:
        raise HTTPException(422, str(e)) from e


@router.patch("/entities/{entity_id}")
async def update_entity(entity_id: uuid.UUID, payload: EntityUpdate):
    """Set (or, with null, clear) fields. Only the fields sent change."""
    with triage_errors():
        try:
            return await entities.update_entity(entity_id, payload.model_dump(exclude_unset=True))
        except entities.InvalidEntity as e:
            raise HTTPException(422, str(e)) from e


@router.delete("/entities/{entity_id}")
async def delete_entity(entity_id: uuid.UUID):
    """Delete the entity and its links (the adventures stay)."""
    with triage_errors():
        await entities.delete_entity(entity_id)
    return {"deleted": str(entity_id)}


async def _entity_link(from_id: uuid.UUID, to_id: uuid.UUID, role: str, on: bool):
    with triage_errors():
        try:
            await entities.set_entity_link(from_id, to_id, role, on)
        except entities.InvalidEntity as e:
            raise HTTPException(422, str(e)) from e
    return {"linked": on}


@router.put("/entities/{player_id}/affinities/{entity_id}")
async def add_affinity(player_id: uuid.UUID, entity_id: uuid.UUID):
    """Link a player to a deity, site, organization or skill."""
    return await _entity_link(player_id, entity_id, "affinity", True)


@router.delete("/entities/{player_id}/affinities/{entity_id}")
async def remove_affinity(player_id: uuid.UUID, entity_id: uuid.UUID):
    return await _entity_link(player_id, entity_id, "affinity", False)


@router.put("/entities/{site_id}/wardens/{entity_id}")
async def add_warden(site_id: uuid.UUID, entity_id: uuid.UUID):
    """Make a player or organization a warden of the site."""
    return await _entity_link(entity_id, site_id, "warden", True)


@router.delete("/entities/{site_id}/wardens/{entity_id}")
async def remove_warden(site_id: uuid.UUID, entity_id: uuid.UUID):
    return await _entity_link(entity_id, site_id, "warden", False)


@router.put("/adventures/{adventure_id}/entities/{entity_id}")
async def link_entity(adventure_id: uuid.UUID, entity_id: uuid.UUID):
    """Link an entity to an adventure (an event's site replaces its previous one)."""
    with triage_errors():
        await entities.link(adventure_id, entity_id)
    return {"linked": True}


@router.delete("/adventures/{adventure_id}/entities/{entity_id}")
async def unlink_entity(adventure_id: uuid.UUID, entity_id: uuid.UUID):
    with triage_errors():
        await entities.unlink(adventure_id, entity_id)
    return {"linked": False}
