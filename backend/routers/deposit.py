"""The Deposit: links to be read into events (services/deposit.py)."""

import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.services import deposit

router = APIRouter(prefix="/deposit", tags=["deposit"])


class LinksPayload(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)


@router.get("")
async def get_links():
    """The links waiting to be read, and those held."""
    return await deposit.waiting_and_held()


@router.post("")
async def add_links(payload: LinksPayload):
    return await deposit.add(payload.text)


@router.delete("/{link_id}")
async def remove_link(link_id: uuid.UUID):
    await deposit.remove(link_id)
    return {"removed": str(link_id)}
