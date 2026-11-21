"""App logic used by the routers.

    workspace.py  panel definitions + in-memory dock layout
    sync.py         harvest: runs crawlers and stores their events in the harvesters
    triage.py       feed/siphon/purge, review raw events, move adventures between phases
    transitions.py  the log of moves between signal chain nodes (the twin's packets)
    hub.py          WebSocket connections + typed broadcasts
"""
