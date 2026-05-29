from __future__ import annotations

import os
from typing import Any

import httpx

from backend.services.site_analyzer import compute_opportunity_score

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"

CATEGORY_MAP: dict[str, list[tuple[str, str]]] = {
    "barber": [("amenity", "barber"), ("shop", "hairdresser")],
    "hairdresser": [("shop", "hairdresser")],
    "gym": [("leisure", "fitness_centre")],
    "clinic": [("amenity", "clinic")],
    "restaurant": [("amenity", "restaurant")],
    "dentist": [("amenity", "dentist")],
    "store": [("shop", "general")],
    "car_repair": [("shop", "car_repair")],
    "real_estate": [("office", "estate_agent")],
    "pharmacy": [("amenity", "pharmacy")],
    "bakery": [("shop", "bakery")],
    "supermarket": [("shop", "supermarket")],
    "cafe": [("amenity", "cafe")],
    "hotel": [("tourism", "hotel")],
    "school": [("amenity", "school")],
}

SCORE_ORDER = {"Alta": 0, "Média": 1, "Baixa": 2}


class OverpassServiceError(Exception):
    """Friendly error surfaced to API layer."""


def _safe_timeout() -> int:
    raw = os.getenv("OVERPASS_TIMEOUT_SECONDS", "25")
    try:
        timeout = int(raw)
    except ValueError:
        timeout = 25
    return max(5, min(timeout, 120))


def _request_headers() -> dict[str, str]:
    user_agent = os.getenv(
        "OVERPASS_USER_AGENT",
        "LocalRush/0.1 (localhost; contact:local@localhost)",
    )
    referer = os.getenv("OVERPASS_REFERER", "http://localhost")
    return {
        "Accept": "application/json",
        "User-Agent": user_agent,
        "Referer": referer,
    }


def _build_overpass_query(
    category_pairs: list[tuple[str, str]],
    lat: float,
    lng: float,
    radius: int,
    limit: int,
    timeout_seconds: int,
) -> str:
    query_lines = [f"[out:json][timeout:{timeout_seconds}];", "("]

    for key, value in category_pairs:
        query_lines.append(
            f'  node["{key}"="{value}"](around:{radius},{lat:.6f},{lng:.6f});'
        )
        query_lines.append(
            f'  way["{key}"="{value}"](around:{radius},{lat:.6f},{lng:.6f});'
        )

    query_lines.append(");")
    query_lines.append(f"out center tags {limit};")
    return "\n".join(query_lines)


def _first_non_empty(tags: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = tags.get(key)
        if value is None:
            continue
        cleaned = str(value).strip()
        if cleaned:
            return cleaned
    return ""


def _build_address(tags: dict[str, Any]) -> str:
    full_address = _first_non_empty(tags, ["addr:full"])
    if full_address:
        return full_address

    street = _first_non_empty(tags, ["addr:street"])
    number = _first_non_empty(tags, ["addr:housenumber"])
    suburb = _first_non_empty(tags, ["addr:suburb"])
    city = _first_non_empty(tags, ["addr:city", "addr:town", "addr:village"])
    state = _first_non_empty(tags, ["addr:state"])
    country = _first_non_empty(tags, ["addr:country"])

    line_one = " ".join(part for part in [street, number] if part).strip()
    line_two = ", ".join(part for part in [suburb, city] if part).strip()
    line_three = ", ".join(part for part in [state, country] if part).strip()
    address_parts = [part for part in [line_one, line_two, line_three] if part]

    if not address_parts:
        return "Endereço não informado"

    return " - ".join(address_parts)


def _normalize_website(raw_website: str) -> str:
    if not raw_website:
        return ""
    if raw_website.startswith(("http://", "https://")):
        return raw_website
    return f"https://{raw_website}"


def _extract_coordinates(element: dict[str, Any]) -> tuple[float | None, float | None]:
    if element.get("type") == "node":
        lat = element.get("lat")
        lng = element.get("lon")
    else:
        center = element.get("center") or {}
        lat = center.get("lat")
        lng = center.get("lon")

    if lat is None or lng is None:
        return None, None

    return float(lat), float(lng)


def _opportunity_result(
    element: dict[str, Any],
    category: str,
    only_with_site: bool,
) -> dict[str, Any] | None:
    tags = element.get("tags") or {}
    lat, lng = _extract_coordinates(element)
    if lat is None or lng is None:
        return None

    website = _normalize_website(
        _first_non_empty(tags, ["website", "contact:website", "url"])
    )
    phone = _first_non_empty(tags, ["phone", "contact:phone"])
    email = _first_non_empty(tags, ["email", "contact:email"])
    whatsapp = _first_non_empty(tags, ["whatsapp", "contact:whatsapp"])

    opportunity_score = compute_opportunity_score(
        has_website=bool(website),
        has_phone=bool(phone),
        has_email=bool(email),
    )

    if only_with_site and not website:
        return None

    return {
        "name": _first_non_empty(tags, ["name"]) or "Sem nome",
        "category": category,
        "address": _build_address(tags),
        "phone": phone,
        "whatsapp": whatsapp,
        "email": email,
        "website": website,
        "maps_link": (
            f"https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lng:.6f}&zoom=18"
        ),
        "lat": lat,
        "lng": lng,
        "opening_hours": _first_non_empty(tags, ["opening_hours"]),
        "opportunity_score": opportunity_score,
    }


def search_overpass(
    *,
    lat: float,
    lng: float,
    radius: int,
    category: str,
    limit: int,
    only_with_site: bool,
) -> list[dict[str, Any]]:
    category_pairs = CATEGORY_MAP.get(category)
    if not category_pairs:
        raise OverpassServiceError("Categoria inválida para busca no OpenStreetMap.")

    timeout_seconds = _safe_timeout()
    query = _build_overpass_query(
        category_pairs=category_pairs,
        lat=lat,
        lng=lng,
        radius=radius,
        limit=limit,
        timeout_seconds=timeout_seconds,
    )

    print(
        "[local-rush] Buscando Overpass:",
        f"category={category}",
        f"radius={radius}",
        f"limit={limit}",
        f"only_with_site={only_with_site}",
    )

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(
                OVERPASS_ENDPOINT,
                data={"data": query},
                headers=_request_headers(),
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise OverpassServiceError(
            "A busca demorou demais no OpenStreetMap. Tente reduzir o raio."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise OverpassServiceError(
            f"OpenStreetMap respondeu com erro HTTP {exc.response.status_code}."
        ) from exc
    except httpx.RequestError as exc:
        raise OverpassServiceError(
            "Não foi possível conectar ao serviço do OpenStreetMap no momento."
        ) from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise OverpassServiceError(
            "O serviço do OpenStreetMap retornou uma resposta inválida."
        ) from exc

    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise OverpassServiceError("Resposta inesperada do OpenStreetMap.")

    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for element in elements:
        osm_type = str(element.get("type", ""))
        osm_id = str(element.get("id", ""))
        if not osm_type or not osm_id:
            continue

        unique_id = f"{osm_type}:{osm_id}"
        if unique_id in seen_ids:
            continue
        seen_ids.add(unique_id)

        normalized = _opportunity_result(
            element=element,
            category=category,
            only_with_site=only_with_site,
        )
        if normalized is not None:
            results.append(normalized)

    results.sort(
        key=lambda item: (
            SCORE_ORDER.get(item["opportunity_score"], 99),
            item["name"].lower(),
        )
    )
    return results[:limit]
