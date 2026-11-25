"""Whether a raw event is a specimen or ore (pure).

Ore has everything needed to judge it: a title, a start, its own link, an exact location and a
cover. A specimen lacks some of it. The end time and description are optional.
"""

from backend.crawlers import CRAWLERS
from backend.db.models import Event


def missing(e: Event, source_name: str) -> list[str]:
    """What keeps an event from being ore, in words ([]: it's ore)."""
    source = CRAWLERS.get(source_name)
    checks = {
        "title": e.title,
        "start": e.start_time,
        # a row without a link of its own points at the source's page
        "link": e.url and not (source and e.url.rstrip("/") == source.URL.rstrip("/")),
        "exact location": e.lat is not None and e.lon is not None and not e.location_approximate,
        "cover": e.cover_url,
    }
    return [name for name, ok in checks.items() if not ok]
