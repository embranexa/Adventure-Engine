"""Dock layout: load, save, and reset the panel tree."""

from fastapi import APIRouter

from backend.schemas.workspace import LayoutPayload
from backend.services import workspace

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("")
async def get_workspace():
    return {"panels": workspace.PANELS_METADATA, "tree": workspace.get_tree()}


@router.put("/layout")
async def save_layout(payload: LayoutPayload):
    return {"status": "saved", "tree": workspace.save_tree(payload.tree)}


@router.post("/reset")
async def reset_layout():
    return {"panels": workspace.PANELS_METADATA, "tree": workspace.reset_tree()}
