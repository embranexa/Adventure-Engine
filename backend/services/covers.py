"""Cover images from other sites, served from the app's own origin.

The Nexus draws cover images into its 3D cards. WebGL refuses images from other origins
unless they send CORS headers (most don't), so the page asks for `/api/cover?url=...`
and this module fetches the image once, keeps it in data/covers/, and serves it from
there afterwards.

Guards: http(s) only; the host must resolve to public addresses (no loopback, private,
link-local or reserved ranges, so a cover URL can't reach the local network); image
content types only; at most MAX_BYTES; redirects followed by hand so every hop is
checked.
"""

import asyncio
import hashlib
import ipaddress
import json
import socket
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from backend.db.base import DATA_DIR

CACHE_DIR = DATA_DIR / "covers"
MAX_BYTES = 8 * 1024 * 1024
MAX_REDIRECTS = 4
TIMEOUT_S = 12.0
USER_AGENT = "Mozilla/5.0 (compatible; AdventureEngine/1.0)"


class CoverError(Exception):
    """The image can't be served (bad URL, blocked host, not an image, too big, ...)."""


def _cache_paths(url: str) -> tuple[Path, Path]:
    key = hashlib.sha256(url.encode()).hexdigest()
    return CACHE_DIR / key, CACHE_DIR / f"{key}.json"


async def _check_host(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise CoverError("only http(s) URLs")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parts.hostname, parts.port or None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise CoverError(f"unknown host {parts.hostname}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise CoverError("host is not public")


async def fetch(url: str) -> tuple[bytes, str]:
    """The image's bytes and content type, from the cache or the web."""
    body_path, meta_path = _cache_paths(url)
    if body_path.exists() and meta_path.exists():
        return body_path.read_bytes(), json.loads(meta_path.read_text())["type"]

    current = url
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            await _check_host(current)
            async with client.stream("GET", current) as res:
                if res.is_redirect and res.headers.get("location"):
                    current = urljoin(current, res.headers["location"])
                    continue
                if res.status_code != 200:
                    raise CoverError(f"upstream answered {res.status_code}")
                ctype = res.headers.get("content-type", "").split(";")[0].strip().lower()
                if not ctype.startswith("image/"):
                    raise CoverError("not an image")
                chunks, size = [], 0
                async for chunk in res.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise CoverError("image too large")
                    chunks.append(chunk)
                body = b"".join(chunks)
                break
        else:
            raise CoverError("too many redirects")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    body_path.write_bytes(body)
    meta_path.write_text(json.dumps({"url": url, "type": ctype}))
    return body, ctype
