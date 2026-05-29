from __future__ import annotations

import os
import re
import time
import unicodedata
from typing import Any

import httpx

from backend.services.site_analyzer import compute_opportunity_score

OVERPASS_PRIMARY_ENDPOINT = "https://overpass-api.de/api/interpreter"
DEFAULT_OVERPASS_ENDPOINTS = [
    OVERPASS_PRIMARY_ENDPOINT,
    "https://overpass.kumi.systems/api/interpreter",
]
GENERAL_CONTACT_CATEGORY = "business_contact"
GENERAL_CONTACT_KEYS = [
    "phone",
    "contact:phone",
    "mobile",
    "contact:mobile",
    "whatsapp",
    "contact:whatsapp",
    "website",
    "contact:website",
    "url",
    "email",
    "contact:email",
]

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "barber": [
        "barbearia",
        "barbeiro",
        "salao masculino",
        "cabelo masculino",
        "barber",
        "barbershop",
    ],
    "hairdresser": [
        "cabeleireiro",
        "cabeleireira",
        "salao",
        "hairdresser",
        "hair salon",
    ],
    "gym": [
        "academia",
        "fitness",
        "musculacao",
        "crossfit",
        "personal",
        "pilates",
        "treino",
    ],
    "clinic": [
        "clinica",
        "consultorio",
        "centro medico",
        "saude",
        "odontologia",
        "odontologico",
        "estetica",
        "fisioterapia",
        "psicologia",
    ],
    "restaurant": [
        "restaurante",
        "lanchonete",
        "pizzaria",
        "hamburgueria",
        "comida",
        "delivery",
        "bar",
        "lanche",
        "food",
    ],
    "dentist": [
        "dentista",
        "odontologia",
        "odontologico",
        "clinica odontologica",
    ],
    "store": [
        "loja",
        "mercearia",
        "mercadinho",
        "comercio",
        "utilidades",
        "armazem",
    ],
    "car_repair": [
        "oficina",
        "mecanica",
        "auto center",
        "autocenter",
        "funilaria",
        "borracharia",
    ],
    "real_estate": [
        "imobiliaria",
        "corretora",
        "imovel",
        "aluguel",
        "imoveis",
        "estate agent",
    ],
    "pharmacy": [
        "farmacia",
        "drogaria",
        "medicamentos",
        "drugstore",
        "farmaceutica",
    ],
    "bakery": [
        "padaria",
        "confeitaria",
        "panificadora",
        "bakery",
        "pao",
    ],
    "supermarket": [
        "mercado",
        "supermercado",
        "mercadinho",
        "mercearia",
        "hortifruti",
        "acougue",
    ],
    "cafe": [
        "cafe",
        "cafeteria",
        "coffee",
        "espresso",
        "doceria",
    ],
    "hotel": [
        "hotel",
        "hostel",
        "pousada",
        "inn",
        "resort",
    ],
    "school": [
        "escola",
        "colegio",
        "instituto",
        "educacao",
        "ensino",
    ],
    GENERAL_CONTACT_CATEGORY: [
        "empresa",
        "negocio",
        "comercio",
        "loja",
        "servico",
        "prestador",
        "micro",
    ],
}

SEARCHABLE_TAG_KEYS = [
    "name",
    "official_name",
    "short_name",
    "alt_name",
    "brand",
    "operator",
    "description",
    "amenity",
    "shop",
    "office",
    "craft",
    "tourism",
    "healthcare",
    "healthcare:speciality",
    "cuisine",
]

QUERY_KEYWORD_TAG_KEYS = [
    "name",
    "official_name",
    "brand",
    "description",
    "shop",
    "amenity",
    "office",
    "craft",
    "tourism",
    "healthcare",
    "healthcare:speciality",
    "cuisine",
]

CATEGORY_MAP: dict[str, list[tuple[str, str | None]]] = {
    "barber": [("amenity", "barber"), ("shop", "hairdresser"), ("shop", "barber")],
    "hairdresser": [("shop", "hairdresser"), ("shop", "barber")],
    "gym": [("leisure", "fitness_centre"), ("sport", "fitness")],
    "clinic": [("amenity", "clinic"), ("healthcare", "clinic"), ("amenity", "doctors")],
    "restaurant": [
        ("amenity", "restaurant"),
        ("amenity", "fast_food"),
        ("amenity", "food_court"),
    ],
    "dentist": [("amenity", "dentist"), ("healthcare", "dentist")],
    "store": [("shop", "general"), ("shop", None)],
    "car_repair": [("shop", "car_repair"), ("craft", "car_repair")],
    "real_estate": [("office", "estate_agent"), ("shop", "estate_agent")],
    "pharmacy": [("amenity", "pharmacy"), ("shop", "chemist")],
    "bakery": [("shop", "bakery")],
    "supermarket": [("shop", "supermarket"), ("shop", "convenience")],
    "cafe": [("amenity", "cafe")],
    "hotel": [("tourism", "hotel"), ("tourism", "hostel")],
    "school": [("amenity", "school"), ("amenity", "kindergarten")],
    GENERAL_CONTACT_CATEGORY: [],
}

SCORE_ORDER = {"Alta": 0, "Média": 1, "Baixa": 2}
RETRYABLE_HTTP_STATUS = {406, 408, 409, 425, 429, 500, 502, 503, 504}


class OverpassServiceError(Exception):
    """Friendly error surfaced to API layer."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _safe_timeout() -> int:
    raw = os.getenv("OVERPASS_TIMEOUT_SECONDS", "25")
    try:
        timeout = int(raw)
    except ValueError:
        timeout = 25
    return max(5, min(timeout, 120))


def _safe_retries() -> int:
    raw = os.getenv("OVERPASS_RETRIES", "2")
    try:
        retries = int(raw)
    except ValueError:
        retries = 2
    return max(1, min(retries, 4))


def _endpoint_candidates() -> list[str]:
    raw = os.getenv("OVERPASS_ENDPOINTS", "").strip()
    if raw:
        candidates = [item.strip() for item in raw.split(",") if item.strip()]
    else:
        candidates = list(DEFAULT_OVERPASS_ENDPOINTS)

    # Keep primary endpoint first and remove duplicates.
    deduped: list[str] = []
    for endpoint in [OVERPASS_PRIMARY_ENDPOINT, *candidates]:
        if endpoint and endpoint not in deduped:
            deduped.append(endpoint)
    return deduped


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


def _normalize_match_text(raw_value: str) -> str:
    normalized = unicodedata.normalize("NFKD", raw_value)
    stripped = "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    )
    lowered = stripped.lower()
    collapsed = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", collapsed).strip()


_NORMALIZED_KEYWORD_CACHE: dict[str, list[str]] = {}


def _normalized_keywords_for_category(category: str) -> list[str]:
    cached = _NORMALIZED_KEYWORD_CACHE.get(category)
    if cached is not None:
        return cached

    keywords = CATEGORY_KEYWORDS.get(category, [])
    normalized_keywords: list[str] = []
    for keyword in keywords:
        normalized = _normalize_match_text(keyword)
        if normalized:
            normalized_keywords.append(normalized)
    _NORMALIZED_KEYWORD_CACHE[category] = normalized_keywords
    return normalized_keywords


def _build_searchable_text(tags: dict[str, Any]) -> str:
    raw_parts: list[str] = []

    for key in SEARCHABLE_TAG_KEYS:
        value = tags.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            raw_parts.append(text)

    # Include remaining short textual tags for better coverage on poorly tagged places.
    for key, value in tags.items():
        if key in SEARCHABLE_TAG_KEYS or value is None:
            continue
        text = str(value).strip()
        if text and len(text) <= 80:
            raw_parts.append(text)

    return _normalize_match_text(" ".join(raw_parts))


def _matches_by_keyword(category: str, tags: dict[str, Any]) -> bool:
    normalized_text = _build_searchable_text(tags)
    if not normalized_text:
        return False

    padded_text = f" {normalized_text} "
    for keyword in _normalized_keywords_for_category(category):
        if " " in keyword:
            if keyword in normalized_text:
                return True
            continue

        # Avoid false positives for very short words such as "bar".
        if len(keyword) <= 3:
            if f" {keyword} " in padded_text:
                return True
            continue

        if f" {keyword} " in padded_text or keyword in normalized_text:
            return True

    return False


def _matches_by_category_tags(category: str, tags: dict[str, Any]) -> bool:
    pairs = CATEGORY_MAP.get(category, [])
    for key, value in pairs:
        current = str(tags.get(key, "")).strip().lower()
        if not current:
            continue

        if value is None:
            return True
        if current == value.lower():
            return True

    return False


def _keyword_regex_for_category(category: str) -> str:
    keywords = _normalized_keywords_for_category(category)
    if not keywords:
        return ""
    escaped = [re.escape(keyword) for keyword in keywords if keyword]
    return "|".join(escaped)


def _matches_requested_category(category: str, tags: dict[str, Any]) -> bool:
    if category == GENERAL_CONTACT_CATEGORY:
        return True

    if _matches_by_keyword(category, tags):
        return True

    return _matches_by_category_tags(category, tags)


def _build_tag_filter(key: str, value: str | None) -> str:
    if value is None:
        return f'["{key}"]'
    return f'["{key}"="{value}"]'


def _build_overpass_query(
    category_pairs: list[tuple[str, str | None]],
    lat: float,
    lng: float,
    radius: int,
    limit: int,
    timeout_seconds: int,
    keyword_regex: str,
) -> str:
    query_lines = [f"[out:json][timeout:{timeout_seconds}];", "("]

    for key, value in category_pairs:
        tag_filter = _build_tag_filter(key, value)
        query_lines.append(
            f"  node{tag_filter}(around:{radius},{lat:.6f},{lng:.6f});"
        )
        query_lines.append(
            f"  way{tag_filter}(around:{radius},{lat:.6f},{lng:.6f});"
        )
        query_lines.append(
            f"  relation{tag_filter}(around:{radius},{lat:.6f},{lng:.6f});"
        )

    if keyword_regex:
        for key in QUERY_KEYWORD_TAG_KEYS:
            query_lines.append(
                f'  node["{key}"~"{keyword_regex}",i](around:{radius},{lat:.6f},{lng:.6f});'
            )
            query_lines.append(
                f'  way["{key}"~"{keyword_regex}",i](around:{radius},{lat:.6f},{lng:.6f});'
            )
            query_lines.append(
                f'  relation["{key}"~"{keyword_regex}",i](around:{radius},{lat:.6f},{lng:.6f});'
            )

    query_lines.append(");")
    query_lines.append(f"out center tags {limit};")
    return "\n".join(query_lines)


def _build_general_contact_query(
    *,
    lat: float,
    lng: float,
    radius: int,
    limit: int,
    timeout_seconds: int,
) -> str:
    query_lines = [f"[out:json][timeout:{timeout_seconds}];", "("]

    for contact_key in GENERAL_CONTACT_KEYS:
        query_lines.append(
            f'  node["{contact_key}"](around:{radius},{lat:.6f},{lng:.6f});'
        )
        query_lines.append(
            f'  way["{contact_key}"](around:{radius},{lat:.6f},{lng:.6f});'
        )
        query_lines.append(
            f'  relation["{contact_key}"](around:{radius},{lat:.6f},{lng:.6f});'
        )

    query_lines.append(");")
    query_lines.append(f"out center tags {limit};")
    return "\n".join(query_lines)


def _is_excluded_general_contact(tags: dict[str, Any]) -> bool:
    amenity = str(tags.get("amenity", "")).strip().lower()
    healthcare = str(tags.get("healthcare", "")).strip().lower()

    if amenity in {"school", "college", "university", "kindergarten"}:
        return True

    # User request: exclude hospitals from this broad contact-based search.
    if amenity == "hospital" or healthcare == "hospital":
        return True

    return False


def _request_overpass(
    query: str,
    timeout_seconds: int,
) -> httpx.Response:
    max_retries = _safe_retries()
    endpoints = _endpoint_candidates()
    last_error: Exception | None = None

    for endpoint_index, endpoint in enumerate(endpoints, start=1):
        for attempt in range(1, max_retries + 1):
            try:
                with httpx.Client(timeout=timeout_seconds) as client:
                    response = client.post(
                        endpoint,
                        data={"data": query},
                        headers=_request_headers(),
                    )
                    response.raise_for_status()
                    return response
            except httpx.TimeoutException as exc:
                last_error = exc
                print(
                    "[local-rush] Overpass timeout:",
                    f"endpoint={endpoint}",
                    f"attempt={attempt}/{max_retries}",
                )
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code
                print(
                    "[local-rush] Overpass HTTP error:",
                    f"status={status_code}",
                    f"endpoint={endpoint}",
                    f"attempt={attempt}/{max_retries}",
                )

                if status_code not in RETRYABLE_HTTP_STATUS:
                    raise OverpassServiceError(
                        f"OpenStreetMap respondeu com erro HTTP {status_code}.",
                        status_code=502,
                    ) from exc
            except httpx.RequestError as exc:
                last_error = exc
                print(
                    "[local-rush] Overpass request error:",
                    f"endpoint={endpoint}",
                    f"attempt={attempt}/{max_retries}",
                    f"error={exc}",
                )

            if attempt < max_retries:
                # Short backoff before retrying same endpoint.
                time.sleep(0.7 * attempt)

        print(
            "[local-rush] Falha no endpoint Overpass, tentando proximo:",
            f"{endpoint_index}/{len(endpoints)}",
            endpoint,
        )

    if isinstance(last_error, httpx.TimeoutException):
        raise OverpassServiceError(
            "A busca demorou demais no OpenStreetMap. Tente reduzir o raio.",
            status_code=502,
        ) from last_error

    if isinstance(last_error, httpx.RequestError):
        raise OverpassServiceError(
            "Nao foi possivel conectar ao servico do OpenStreetMap no momento.",
            status_code=502,
        ) from last_error

    if isinstance(last_error, httpx.HTTPStatusError):
        raise OverpassServiceError(
            "OpenStreetMap indisponivel no momento. Tente novamente em alguns segundos.",
            status_code=502,
        ) from last_error

    raise OverpassServiceError(
        "Nao foi possivel concluir a consulta ao OpenStreetMap.",
        status_code=502,
    )


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
        return "Endereco nao informado"

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

    if category == GENERAL_CONTACT_CATEGORY and _is_excluded_general_contact(tags):
        return None
    if not _matches_requested_category(category, tags):
        return None

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
    if category not in CATEGORY_MAP:
        raise OverpassServiceError(
            "Categoria invalida para busca no OpenStreetMap.",
            status_code=422,
        )
    category_pairs = CATEGORY_MAP[category]

    timeout_seconds = _safe_timeout()
    if category == GENERAL_CONTACT_CATEGORY:
        query = _build_general_contact_query(
            lat=lat,
            lng=lng,
            radius=radius,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )
    else:
        keyword_regex = _keyword_regex_for_category(category)
        query = _build_overpass_query(
            category_pairs=category_pairs,
            lat=lat,
            lng=lng,
            radius=radius,
            limit=limit,
            timeout_seconds=timeout_seconds,
            keyword_regex=keyword_regex,
        )

    print(
        "[local-rush] Buscando Overpass:",
        f"category={category}",
        f"radius={radius}",
        f"limit={limit}",
        f"only_with_site={only_with_site}",
    )

    response = _request_overpass(query=query, timeout_seconds=timeout_seconds)

    try:
        payload = response.json()
    except ValueError as exc:
        raise OverpassServiceError(
            "O servico do OpenStreetMap retornou uma resposta invalida.",
            status_code=502,
        ) from exc

    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise OverpassServiceError("Resposta inesperada do OpenStreetMap.", status_code=502)

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
