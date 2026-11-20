"""Turn service errors into HTTP responses."""

import contextlib

from fastapi import HTTPException

from backend.services.triage import InvalidTransition, NotFound


@contextlib.contextmanager
def triage_errors():
    """NotFound -> 404, InvalidTransition -> 409 (with the reason as detail)."""
    try:
        yield
    except NotFound as e:
        raise HTTPException(404, str(e)) from e
    except InvalidTransition as e:
        raise HTTPException(409, str(e)) from e
