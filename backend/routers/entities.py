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
    """A new deity, site, contact, organization or skill. 422 if a field is invalid."""
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
