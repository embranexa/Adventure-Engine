"""What an adventure is worth, in ambrosia (pure; same sums in frontend/js/lib/bounty.js).

    total          effort (1-5) x resistance (0-3) x 10; fixed once locked
    action share   the payout lever's part of it (0-60 %), paid as actions are done
    the rest       paid when the adventure is enshrined
"""

import math
from typing import Any

EFFORT, RESISTANCE, RATIO = (1, 5), (0, 3), (0, 60)
DEFAULT = {"effort": 3, "resistance": 1, "ratio": 30}


def round_half_up(x: float) -> int:
    return math.floor(x + 0.5)


def total(b: dict[str, Any]) -> int:
    return b["effort"] * b["resistance"] * 10


def action_share(b: dict[str, Any]) -> int:
    return round_half_up(total(b) * b["ratio"] / 100)
