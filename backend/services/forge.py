"""The Forge: asks Claude for an adventure's 3D model.

It runs the Claude command line (`claude -p`) with no tools, no settings and no session, so
all it can do is reply with text. The reply must be a recipe that passes services/items.py;
one that doesn't goes back once with its error. The result is a proposal on its sheet
until it's accepted.

One model is made at a time. Nothing else needs this: without Claude, the request fails with
a reason and the adventure keeps its cover.
"""

import asyncio
import base64
import json
import logging
import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import Adventure, ItemSheet
from backend.db.queries import list_adventures
from backend.services import covers
from backend.services.forge_prompt import SYSTEM
from backend.services.hub import hub
from backend.services.items import InvalidItem, clean_model
from backend.services.triage import InvalidTransition, _get_adventure

log = logging.getLogger(__name__)

TEXT_LIMIT = 2_000
TIMEOUT_S = 420
ATTEMPTS = 2
IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
IMAGE_MAX = 4 * 1024 * 1024
MODEL = os.environ.get("FORGE_MODEL", "opus")

# what the model is of, by adventure type
KINDS = {
    "item": "Object",
    "event": "Event (model one emblem of it, or a small scene on a round base)",
    "performance": "Performance (model its instrument or prop, or a small stage image on a round base)",
    "battle": "Battle (model the contest as one image, or its trophy)",
}
_one_at_a_time = asyncio.Lock()
_tasks: dict[uuid.UUID, asyncio.Task] = {}


class ForgeError(Exception):
    """Claude couldn't be run, or didn't give a usable recipe. The message is shown."""


def claude_path() -> str | None:
    return os.environ.get("CLAUDE_BIN") or shutil.which("claude") or next(
        (str(p) for p in (Path.home() / ".local/bin/claude",) if p.exists()), None)


# --- requests ---

async def request(adventure_id: uuid.UUID, text: str) -> None:
    """Queue a model (or, if it has one or a proposal, changes to it) and start on it."""
    text = text.strip()
    if not text:
        raise InvalidItem("describe the object")
    if len(text) > TEXT_LIMIT:
        raise InvalidItem(f"the description is too long (max {TEXT_LIMIT} characters)")
    if claude_path() is None:
        raise InvalidTransition("Claude's command line isn't installed here")
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        sheet = await session.get(ItemSheet, adventure_id)
        if sheet is None:
            sheet = ItemSheet(adventure_id=adventure_id, purpose="", effects=[])
            session.add(sheet)
        if (sheet.forge or {}).get("status") == "forging" and adventure_id in _tasks:
            raise InvalidTransition("it's already being forged")
        sheet.forge = {"status": "forging", "text": text, "at": utcnow().isoformat(),
                       "proposal": (sheet.forge or {}).get("proposal")}
        await session.commit()
    await _broadcast()
    _start(adventure_id)


async def accept(adventure_id: uuid.UUID) -> None:
    """The proposal becomes the model, and is what shows."""
    async with SessionLocal() as session:
        sheet = await _sheet(session, adventure_id)
        proposal = (sheet.forge or {}).get("proposal")
        if not proposal:
            raise InvalidTransition("there's no proposal to accept")
        sheet.model, sheet.forge, sheet.updated_at = proposal, None, utcnow()
        sheet.face = "model"
        await session.commit()
    _stop(adventure_id)
    await _broadcast()


async def dismiss(adventure_id: uuid.UUID) -> None:
    """Drop the proposal, or stop the work; the item keeps the model it had."""
    async with SessionLocal() as session:
        sheet = await _sheet(session, adventure_id)
        sheet.forge = None
        await session.commit()
    _stop(adventure_id)
    await _broadcast()


async def resume() -> None:
    """At startup: pick up what a restart interrupted."""
    async with SessionLocal() as session:
        rows = (await session.scalars(select(ItemSheet))).all()
        waiting = [r.adventure_id for r in rows if (r.forge or {}).get("status") == "forging"]
    for adventure_id in waiting:
        _start(adventure_id)


async def stop_all() -> None:
    """At shutdown: stop the work (it resumes at the next start)."""
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


# --- the work ---

def _start(adventure_id: uuid.UUID) -> None:
    _stop(adventure_id)
    task = asyncio.create_task(_work(adventure_id))
    _tasks[adventure_id] = task
    task.add_done_callback(lambda t: _tasks.pop(adventure_id, None) if _tasks.get(adventure_id) is t else None)


def _stop(adventure_id: uuid.UUID) -> None:
    task = _tasks.pop(adventure_id, None)
    if task:
        task.cancel()


async def _work(adventure_id: uuid.UUID) -> None:
    async with _one_at_a_time:
        try:
            async with SessionLocal() as session:
                prompt, image = await _brief(session, adventure_id)
            if prompt is None:
                return  # dismissed, or gone, while it waited
            parts = await _forge(prompt, image)
            result: dict[str, Any] = {"status": "ready", "proposal": parts, "error": None}
        except ForgeError as e:
            result = {"status": "failed", "error": str(e)}
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - shown as a failure; the details are in the log
            log.exception("the forge failed for %s", adventure_id)
            result = {"status": "failed", "error": "The forge failed (see the server log)"}
        async with SessionLocal() as session:
            sheet = await session.get(ItemSheet, adventure_id)
            if sheet and (sheet.forge or {}).get("status") == "forging":
                sheet.forge = {**sheet.forge, **result}
                await session.commit()
        await _broadcast()


async def _brief(session: AsyncSession, adventure_id: uuid.UUID) -> tuple[str | None, tuple[str, str] | None]:
    """The request as text, and the item's cover picture if it's cached or can be fetched."""
    sheet = await session.get(ItemSheet, adventure_id)
    adventure = await session.get(Adventure, adventure_id)
    if sheet is None or adventure is None or (sheet.forge or {}).get("status") != "forging":
        return None, None
    roadmap = adventure.roadmap or {}
    base = sheet.forge.get("proposal") or sheet.model
    lines = [f"{KINDS[adventure.type]}: {adventure.title or 'Untitled'}"]
    if sheet.purpose:
        lines.append(f"Purpose: {sheet.purpose}")
    if adventure.description:
        lines.append(f"Notes: {adventure.description[:2000]}")
    if roadmap.get("actions"):
        lines.append("Roadmap quests, called actions here (id: title): " + "; ".join(f"{a['id']}: {a['title']}" for a in roadmap["actions"]))
    if base:
        lines += ["", "The recipe so far:", json.dumps(base, separators=(",", ":")), "", f"Change this: {sheet.forge['text']}"]
    else:
        lines += ["", f"Description: {sheet.forge['text']}"]
    image = None
    if adventure.cover_url:
        try:
            body, ctype = await covers.fetch(adventure.cover_url)
            if ctype in IMAGE_TYPES and len(body) <= IMAGE_MAX:
                image = (ctype, base64.b64encode(body).decode())
                lines.insert(1, "The picture is its cover: a reference for the look, not necessarily what to model.")
        except covers.CoverError:
            pass
    return "\n".join(lines), image


async def _forge(prompt: str, image: tuple[str, str] | None) -> list[dict[str, Any]]:
    ask = prompt
    for attempt in range(ATTEMPTS):
        reply = await _claude(ask, image)
        try:
            parts = clean_model(_parse(reply))
            if not parts:
                raise InvalidItem("the recipe has no parts")
            return parts
        except InvalidItem as e:
            log.info("forge attempt %d: %s", attempt + 1, e)
            if attempt + 1 == ATTEMPTS:
                raise ForgeError(f"Claude’s recipe wasn’t valid ({e}). Try again, or describe it differently.") from e
            ask = f"{prompt}\n\nYour last reply was refused: {e}. It began:\n{reply[:6000]}\n\nReply with the corrected JSON array only."
    raise ForgeError("no recipe")  # not reached


def _parse(reply: str) -> Any:
    """The JSON array in a reply (with or without a code fence round it)."""
    text = reply.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < start:
        raise InvalidItem("the reply wasn't a JSON array")
    try:
        return json.loads(text[start:end + 1])
    except ValueError as e:
        raise InvalidItem(f"the reply wasn't valid JSON ({e})") from e


async def _claude(prompt: str, image: tuple[str, str] | None) -> str:
    """One question to Claude: text (and a picture) in, text out."""
    path = claude_path()
    if path is None:
        raise ForgeError("Claude’s command line isn’t installed here")
    content: list[dict[str, Any]] = []
    if image:
        content.append({"type": "image", "source": {"type": "base64", "media_type": image[0], "data": image[1]}})
    content.append({"type": "text", "text": prompt})
    message = json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n"
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDECODE", "CLAUDE_CODE_"))}
    with tempfile.TemporaryDirectory(prefix="forge-") as cwd:  # nothing of the project in reach
        process = await asyncio.create_subprocess_exec(
            path, "-p", "--model", MODEL, "--tools", "", "--safe-mode", "--strict-mcp-config", "--disable-slash-commands",
            "--no-session-persistence", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
            "--system-prompt", SYSTEM,
            cwd=cwd, env=env, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, err = await asyncio.wait_for(process.communicate(message.encode()), TIMEOUT_S)
        except asyncio.TimeoutError as e:
            raise ForgeError("Claude took too long") from e
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
    for line in reversed(out.decode(errors="replace").splitlines()):
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if record.get("type") == "result":
            if record.get("is_error") or record.get("subtype") != "success":
                raise ForgeError(f"Claude said: {str(record.get('result') or record.get('subtype'))[:300]}")
            return str(record.get("result") or "")
    log.warning("claude exited %s: %s", process.returncode, err.decode(errors="replace")[:1000])
    raise ForgeError("Claude’s command line gave no answer. Is it logged in? (Run claude in a terminal.)")


async def _sheet(session: AsyncSession, adventure_id: uuid.UUID) -> ItemSheet:
    await _get_adventure(session, adventure_id)
    sheet = await session.get(ItemSheet, adventure_id)
    if sheet is None or not sheet.forge:
        raise InvalidTransition("nothing is being forged")
    return sheet


async def _broadcast() -> None:
    async with SessionLocal() as session:
        await hub.broadcast("adventures", adventures=await list_adventures(session))
