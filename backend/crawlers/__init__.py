"""Crawler registry.

Each crawler module defines:
    NAME                                   unique source name
    URL                                    human-facing page for the source
    async fetch_events(client) -> [dict]   dicts matching backend.schemas.EventIn

To add a source, write a module like luma.py and list it here.
"""

from types import ModuleType

from backend.crawlers import luma, nineteenhz

CRAWLERS: dict[str, ModuleType] = {m.NAME: m for m in (luma, nineteenhz)}
