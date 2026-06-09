from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any

import httpx

from backend.services.overpass import search_overpass
from backend.services.place_types import LeadRecord, PlaceSearchParams

GEOAPIFY_CATEGORY_MAP = {
    "barber": "commercial.hairdresser",
    "hairdresser": "commercial.hairdresser",
    "gym": "sport.fitness",
    "clinic": "healthcare.clinic_or_praxis",
    "restaurant": "catering.restaurant",
    "dentist": "healthcare.dentist",
    "store": "commercial",
    "car_repair": "service.vehicle.repair",
    "real_estate": "commercial.real_estate",
    "pharmacy": "healthcare.pharmacy",
    "bakery": "catering.restaurant,bakery",
    "supermarket": "commercial.supermarket",
    "cafe": "catering.cafe",
    "hotel": "accommodation.hotel",
    "school": "education.school",
    "business_contact": "commercial",
}

FOURSQUARE_QUERY_MAP = {
    "barber": "barbearia",
    "hairdresser": "salao de beleza",
    "gym": "academia",
    "clinic": "clinica",
    "restaurant": "restaurante",
    "dentist": "dentista",
    "store": "loja",
    "car_repair": "oficina mecanica",
    "real_estate": "imobiliaria",
    "pharmacy": "farmacia",
    "bakery": "padaria",
    "supermarket": "supermercado",
    "cafe": "cafeteria",
    "hotel": "hotel",
    "school": "escola",
    "business_contact": "empresa",
}

SCORE_MAP = {
    "Alta": 30,
    "Média": 20,
    "Media": 20,
    "Baixa": 10,
}


class PlaceProvider(ABC):
    source: str

    @abstractmethod
    def search_places(self, params: PlaceSearchParams) -> list[LeadRecord]:
        raise NotImplementedError


def clean_string(value: Any) -> str:
    return str(value or "").strip()


def normalize_website(value: Any) -> str:
    website = clean_string(value)
    if not website:
        return ""
    if website.startswith(("http://", "https://")):
        return website
    return f"https://{website}"


def score_to_int(value: Any) -> int:
    if isinstance(value, int):
        return value
    return SCORE_MAP.get(str(value or ""), 0)


def build_maps_link(lat: float | None, lng: float | None) -> str:
    if lat is None or lng is None:
        return ""
    return f"https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lng:.6f}&zoom=18"


def normalize_lead(
    raw: dict[str, Any],
    *,
    source: str,
    external_id: str,
    category: str,
    city: str,
) -> LeadRecord:
    lat = raw.get("lat")
    lng = raw.get("lng")
    safe_lat = float(lat) if isinstance(lat, (int, float)) else None
    safe_lng = float(lng) if isinstance(lng, (int, float)) else None
    stable_id = f"{source}:{external_id}" if external_id else ""

    return {
        "id": clean_string(raw.get("id")) or stable_id,
        "name": clean_string(raw.get("name")) or "Sem nome",
        "category": clean_string(raw.get("category")) or category,
        "address": clean_string(raw.get("address")) or "Endereco nao informado",
        "city": clean_string(raw.get("city")) or city,
        "district": clean_string(raw.get("district")),
        "lat": safe_lat,
        "lng": safe_lng,
        "phone": clean_string(raw.get("phone")),
        "website": normalize_website(raw.get("website")),
        "instagram": clean_string(raw.get("instagram")),
        "source": source,
        "external_id": external_id,
        "score": score_to_int(raw.get("score") or raw.get("opportunity_score")),
        "opportunity_score": clean_string(raw.get("opportunity_score")) or "Baixa",
        "maps_link": clean_string(raw.get("maps_link")) or build_maps_link(safe_lat, safe_lng),
        "raw_data": raw.get("raw_data") if isinstance(raw.get("raw_data"), dict) else raw,
    }


class OpenStreetMapProvider(PlaceProvider):
    source = "osm"

    def search_places(self, params: PlaceSearchParams) -> list[LeadRecord]:
        raw_results = search_overpass(
            lat=params.lat,
            lng=params.lng,
            radius=params.radius,
            category=params.category,
            limit=params.limit,
            only_with_site=params.only_with_site,
        )
        return [
            normalize_lead(
                item,
                source=self.source,
                external_id=clean_string(item.get("external_id")),
                category=params.category,
                city=params.city,
            )
            for item in raw_results
        ]


class GeoapifyProvider(PlaceProvider):
    source = "geoapify"

    def __init__(self) -> None:
        self.api_key = os.getenv("GEOAPIFY_API_KEY", "").strip()
        self.endpoint = os.getenv(
            "GEOAPIFY_PLACES_ENDPOINT",
            "https://api.geoapify.com/v2/places",
        ).strip()

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def search_places(self, params: PlaceSearchParams) -> list[LeadRecord]:
        if not self.is_enabled():
            return []

        categories = GEOAPIFY_CATEGORY_MAP.get(params.category, "commercial")
        limit = max(1, min(params.limit, 50))
        request_params = {
            "categories": categories,
            "filter": f"circle:{params.lng:.6f},{params.lat:.6f},{params.radius}",
            "bias": f"proximity:{params.lng:.6f},{params.lat:.6f}",
            "limit": limit,
            "lang": "pt",
            "apiKey": self.api_key,
        }

        with httpx.Client(timeout=_provider_timeout()) as client:
            response = client.get(self.endpoint, params=request_params)
            response.raise_for_status()
            payload = response.json()

        features = payload.get("features") if isinstance(payload, dict) else []
        if not isinstance(features, list):
            return []

        leads: list[LeadRecord] = []
        for feature in features:
            if not isinstance(feature, dict):
                continue
            properties = feature.get("properties") or {}
            geometry = feature.get("geometry") or {}
            coordinates = geometry.get("coordinates") or []
            lng = coordinates[0] if len(coordinates) >= 2 else None
            lat = coordinates[1] if len(coordinates) >= 2 else None
            datasource = properties.get("datasource") or {}
            raw_source = datasource.get("raw") or {}
            contact = properties.get("contact") or {}

            external_id = clean_string(
                properties.get("place_id")
                or raw_source.get("osm_id")
                or properties.get("name")
            )
            leads.append(
                normalize_lead(
                    {
                        "name": properties.get("name"),
                        "category": params.category,
                        "address": properties.get("formatted"),
                        "city": properties.get("city"),
                        "district": properties.get("district") or properties.get("suburb"),
                        "lat": lat,
                        "lng": lng,
                        "phone": contact.get("phone") or properties.get("phone"),
                        "website": contact.get("website") or properties.get("website"),
                        "raw_data": feature,
                    },
                    source=self.source,
                    external_id=external_id,
                    category=params.category,
                    city=params.city,
                )
            )

        return leads


class FoursquareProvider(PlaceProvider):
    source = "foursquare"

    def __init__(self) -> None:
        self.api_key = os.getenv("FOURSQUARE_API_KEY", "").strip()
        self.endpoint = os.getenv(
            "FOURSQUARE_PLACES_ENDPOINT",
            "https://api.foursquare.com/v3/places/search",
        ).strip()

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def search_places(self, params: PlaceSearchParams) -> list[LeadRecord]:
        if not self.is_enabled():
            return []

        request_params = {
            "ll": f"{params.lat:.6f},{params.lng:.6f}",
            "radius": params.radius,
            "query": FOURSQUARE_QUERY_MAP.get(params.category, params.category),
            "limit": max(1, min(params.limit, 50)),
        }
        headers = {
            "Accept": "application/json",
            "Authorization": self.api_key,
        }

        with httpx.Client(timeout=_provider_timeout()) as client:
            response = client.get(self.endpoint, params=request_params, headers=headers)
            response.raise_for_status()
            payload = response.json()

        raw_results = payload.get("results") if isinstance(payload, dict) else []
        if not isinstance(raw_results, list):
            return []

        leads: list[LeadRecord] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            location = item.get("location") or {}
            geocodes = item.get("geocodes") or {}
            main_geo = geocodes.get("main") or {}
            external_id = clean_string(item.get("fsq_id") or item.get("id"))
            leads.append(
                normalize_lead(
                    {
                        "name": item.get("name"),
                        "category": params.category,
                        "address": location.get("formatted_address")
                        or ", ".join(
                            part
                            for part in [
                                location.get("address"),
                                location.get("locality"),
                                location.get("region"),
                            ]
                            if part
                        ),
                        "city": location.get("locality"),
                        "district": location.get("neighborhood"),
                        "lat": main_geo.get("latitude"),
                        "lng": main_geo.get("longitude"),
                        "phone": item.get("tel"),
                        "website": item.get("website"),
                        "raw_data": item,
                    },
                    source=self.source,
                    external_id=external_id,
                    category=params.category,
                    city=params.city,
                )
            )

        return leads


class ManualProvider(PlaceProvider):
    source = "manual"

    def search_places(self, params: PlaceSearchParams) -> list[LeadRecord]:
        return []


def _provider_timeout() -> int:
    raw = os.getenv("COMPLEMENT_PROVIDER_TIMEOUT_SECONDS", "12")
    try:
        timeout = int(raw)
    except ValueError:
        timeout = 12
    return max(3, min(timeout, 30))

