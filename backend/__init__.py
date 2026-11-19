"""Adventure Engine backend.

    app.py      FastAPI app: startup/shutdown, routers, static frontend
    routers/    HTTP + WebSocket endpoints, one module per area (mounted at /api)
    services/   app logic the routers call (layout state, crawler sync, broadcasts)
    db/         SQLAlchemy engine, tables, queries, startup
    schemas/    Pydantic validation for requests and crawler output
    crawlers/   one module per event source
"""
