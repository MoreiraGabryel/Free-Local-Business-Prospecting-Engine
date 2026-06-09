from __future__ import annotations

import math
import re
import unicodedata
from difflib import SequenceMatcher
from urllib.parse import urlparse

from backend.services.place_types import LeadRecord

SOURCE_PRIORITY = {
    "osm": 0,
    "geoapify": 1,
    "foursquare": 2,
    "manual": 3,
}

SCORE_VALUE = {
    "Alta": 30,
    "Média": 20,
    "Media": 20,
    "Baixa": 10,
}


def normalize_text(value: object) -> str:
    raw = str(value or "").strip()
    normalized = unicodedata.normalize("NFKD", raw)
    without_accents = "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    )
    lowered = without_accents.lower()
    collapsed = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", collapsed).strip()


def normalize_phone(value: object) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_website(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    try:
        parsed = urlparse(raw)
    except ValueError:
        return ""
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def distance_meters(first: LeadRecord, second: LeadRecord) -> float | None:
    try:
        lat1 = float(first["lat"])
        lng1 = float(first["lng"])
        lat2 = float(second["lat"])
        lng2 = float(second["lng"])
    except (KeyError, TypeError, ValueError):
        return None

    radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def name_similarity(first: object, second: object) -> float:
    first_name = normalize_text(first)
    second_name = normalize_text(second)
    if not first_name or not second_name:
        return 0.0
    return SequenceMatcher(None, first_name, second_name).ratio()


def is_duplicate(first: LeadRecord, second: LeadRecord) -> bool:
    first_phone = normalize_phone(first.get("phone"))
    second_phone = normalize_phone(second.get("phone"))
    if first_phone and second_phone and first_phone == second_phone:
        return True

    first_site = normalize_website(first.get("website"))
    second_site = normalize_website(second.get("website"))
    if first_site and second_site and first_site == second_site:
        return True

    if normalize_text(first.get("category")) != normalize_text(second.get("category")):
        return False

    distance = distance_meters(first, second)
    if distance is None or distance > 120:
        return False

    return name_similarity(first.get("name"), second.get("name")) >= 0.82


def lead_rank(lead: LeadRecord) -> tuple[int, int, int, str]:
    contact_score = sum(
        1
        for key in ("phone", "website", "instagram")
        if str(lead.get(key) or "").strip()
    )
    score = lead.get("opportunity_score") or lead.get("score") or ""
    if isinstance(score, int):
        score_value = score
    else:
        score_value = SCORE_VALUE.get(str(score), 0)
    source = str(lead.get("source") or "").lower()
    return (
        SOURCE_PRIORITY.get(source, 99),
        -contact_score,
        -score_value,
        normalize_text(lead.get("name")),
    )


def merge_leads(primary: LeadRecord, duplicate: LeadRecord) -> LeadRecord:
    merged = dict(primary)
    for key in (
        "phone",
        "website",
        "instagram",
        "address",
        "city",
        "district",
        "lat",
        "lng",
    ):
        if not merged.get(key) and duplicate.get(key):
            merged[key] = duplicate[key]

    sources = list(merged.get("sources") or [])
    duplicate_source = {
        "source": duplicate.get("source"),
        "external_id": duplicate.get("external_id"),
    }
    if duplicate_source["source"] and duplicate_source not in sources:
        sources.append(duplicate_source)
    if sources:
        merged["sources"] = sources

    return merged


def dedupe_leads(leads: list[LeadRecord]) -> list[LeadRecord]:
    ordered = sorted(leads, key=lead_rank)
    unique: list[LeadRecord] = []

    for lead in ordered:
        match_index = None
        for index, existing in enumerate(unique):
            if is_duplicate(existing, lead):
                match_index = index
                break

        if match_index is None:
            unique.append(dict(lead))
            continue

        unique[match_index] = merge_leads(unique[match_index], lead)

    return sorted(unique, key=lead_rank)

