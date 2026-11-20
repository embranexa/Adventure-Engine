"""Virtual objects (the Codex): list, create, edit, delete; link them to adventures."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.queries import list_objects
from backend.routers.errors import triage_errors
from backend.schemas.objects import ObjectCreate, ObjectUpdate
from backend.services import objects

router = APIRouter(tags=["objects"])


@router.get("/objects")
async def get_objects(session: AsyncSession = Depends(get_session)):
    return await list_objects(session)


@router.post("/objects")
async def create_object(payload: ObjectCreate):
    """A new pillar, site or contact. 422 if a field is invalid."""
    try:
        return await objects.create_object(payload.model_dump(exclude_unset=True) | {"type": payload.type})
    except objects.InvalidObject as e:
        raise HTTPException(422, str(e)) from e


@router.patch("/objects/{object_id}")
async def update_object(object_id: uuid.UUID, payload: ObjectUpdate):
    """Set (or, with null, clear) fields. Only the fields sent change."""
    with triage_errors():
        try:
            return await objects.update_object(object_id, payload.model_dump(exclude_unset=True))
        except objects.InvalidObject as e:
            raise HTTPException(422, str(e)) from e


@router.delete("/objects/{object_id}")
async def delete_object(object_id: uuid.UUID):
    """Delete the object and its links (the adventures stay)."""
    with triage_errors():
        await objects.delete_object(object_id)
    return {"deleted": str(object_id)}


@router.put("/adventures/{adventure_id}/objects/{object_id}")
async def link_object(adventure_id: uuid.UUID, object_id: uuid.UUID):
    """Link an object to an adventure (an event's site replaces its previous one)."""
    with triage_errors():
        await objects.link(adventure_id, object_id)
    return {"linked": True}


@router.delete("/adventures/{adventure_id}/objects/{object_id}")
async def unlink_object(adventure_id: uuid.UUID, object_id: uuid.UUID):
    with triage_errors():
        await objects.unlink(adventure_id, object_id)
    return {"linked": False}
