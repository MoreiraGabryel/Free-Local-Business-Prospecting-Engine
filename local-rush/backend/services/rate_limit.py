from __future__ import annotations

import os
import time
from collections import defaultdict, deque


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def is_allowed(self, key: str) -> bool:
        limit = _safe_limit()
        if limit <= 0:
            return True

        now = time.monotonic()
        window_start = now - 60
        hits = self._hits[key]

        while hits and hits[0] < window_start:
            hits.popleft()

        if len(hits) >= limit:
            return False

        hits.append(now)
        return True


def _safe_limit() -> int:
    raw = os.getenv("SEARCH_RATE_LIMIT_PER_MINUTE", "30")
    try:
        return max(0, min(int(raw), 300))
    except ValueError:
        return 30

