from __future__ import annotations

from dataclasses import dataclass
from typing import Any

LeadRecord = dict[str, Any]


@dataclass(frozen=True)
class PlaceSearchParams:
    category: str
    city: str
    radius: int
    lat: float
    lng: float
    limit: int
    only_with_site: bool = False
    expanded_search: bool = False

