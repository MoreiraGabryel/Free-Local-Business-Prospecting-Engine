from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx

from backend.services.place_types import LeadRecord, PlaceSearchParams

SCORE_LABELS = {
    30: "Alta",
    20: "Média",
    10: "Baixa",
}


class SupabaseSearchCache:
    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        self.timeout = _safe_timeout()

    def is_enabled(self) -> bool:
        return bool(self.url and self.service_key)

    def get_valid_cache(
        self,
        *,
        cache_key: str,
        limit: int,
    ) -> list[LeadRecord] | None:
        if not self.is_enabled():
            return None

        now = datetime.now(UTC).isoformat()
        try:
            cache_rows = self._request(
                "GET",
                "/rest/v1/search_cache",
                params={
                    "cache_key": f"eq.{cache_key}",
                    "expires_at": f"gt.{now}",
                    "select": "id,cache_key,result_count,expires_at",
                    "limit": "1",
                },
            )
            if not cache_rows:
                return None

            cache_id = cache_rows[0]["id"]
            lead_rows = self._request(
                "GET",
                "/rest/v1/leads",
                params={
                    "cache_id": f"eq.{cache_id}",
                    "select": (
                        "id,name,category,address,city,district,lat,lng,phone,"
                        "website,instagram,score,saved,source,external_id,raw_data"
                    ),
                    "order": "score.desc,name.asc",
                    "limit": str(max(1, min(limit, 100))),
                },
            )
        except Exception as exc:
            print("[local-rush] Supabase cache read failed:", exc)
            return None

        return [self._lead_from_row(row) for row in lead_rows]

    def save_cache(
        self,
        *,
        cache_key: str,
        params: PlaceSearchParams,
        expires_at: datetime,
        leads: list[LeadRecord],
    ) -> bool:
        if not self.is_enabled():
            return False

        payload = {
            "p_cache_key": cache_key,
            "p_category": params.category,
            "p_city": params.city or "",
            "p_radius": params.radius,
            "p_lat": params.lat,
            "p_lng": params.lng,
            "p_expires_at": expires_at.isoformat(),
            "p_leads": [self._lead_to_payload(lead, params) for lead in leads],
        }
        try:
            self._request("POST", "/rest/v1/rpc/replace_search_cache", json=payload)
            return True
        except Exception as exc:
            print("[local-rush] Supabase cache write failed:", exc)
            return False

    def mark_lead_saved(self, *, lead_id: str, user_id: str | None = None) -> bool:
        if not self.is_enabled() or not _is_uuid(lead_id):
            return False

        payload = {
            "p_lead_id": lead_id,
            "p_user_id": user_id if user_id and _is_uuid(user_id) else None,
        }
        try:
            result = self._request("POST", "/rest/v1/rpc/mark_lead_saved", json=payload)
        except Exception as exc:
            print("[local-rush] Supabase mark saved failed:", exc)
            return False

        if isinstance(result, dict):
            return bool(result.get("saved"))
        if isinstance(result, list) and result:
            return bool(result[0].get("saved"))
        return False

    def cleanup_expired_cache(self) -> dict[str, Any] | None:
        if not self.is_enabled():
            return None
        try:
            result = self._request("POST", "/rest/v1/rpc/cleanup_expired_cache", json={})
        except Exception as exc:
            print("[local-rush] Supabase cleanup failed:", exc)
            return None
        return result if isinstance(result, dict) else None

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.request(
                method,
                f"{self.url}{path}",
                params=params,
                json=json,
                headers=headers,
            )
            response.raise_for_status()
            if not response.content:
                return None
            return response.json()

    def _lead_from_row(self, row: dict[str, Any]) -> LeadRecord:
        score = _safe_int(row.get("score"))
        return {
            "id": str(row.get("id") or ""),
            "name": str(row.get("name") or "Sem nome"),
            "category": str(row.get("category") or ""),
            "address": str(row.get("address") or "Endereco nao informado"),
            "city": str(row.get("city") or ""),
            "district": str(row.get("district") or ""),
            "lat": row.get("lat"),
            "lng": row.get("lng"),
            "phone": str(row.get("phone") or ""),
            "website": str(row.get("website") or ""),
            "instagram": str(row.get("instagram") or ""),
            "source": str(row.get("source") or ""),
            "external_id": str(row.get("external_id") or ""),
            "score": score,
            "opportunity_score": SCORE_LABELS.get(score, "Baixa"),
            "saved": bool(row.get("saved")),
            "raw_data": row.get("raw_data") or {},
        }

    def _lead_to_payload(
        self,
        lead: LeadRecord,
        params: PlaceSearchParams,
    ) -> dict[str, Any]:
        return {
            "name": lead.get("name") or "Sem nome",
            "category": lead.get("category") or params.category,
            "address": lead.get("address"),
            "city": lead.get("city") or params.city,
            "district": lead.get("district"),
            "lat": lead.get("lat"),
            "lng": lead.get("lng"),
            "phone": lead.get("phone"),
            "website": lead.get("website"),
            "instagram": lead.get("instagram"),
            "source": lead.get("source"),
            "external_id": lead.get("external_id"),
            "score": _safe_int(lead.get("score")),
            "raw_data": lead.get("raw_data") or {},
        }


def _safe_timeout() -> int:
    raw = os.getenv("SUPABASE_TIMEOUT_SECONDS", "10")
    try:
        timeout = int(raw)
    except ValueError:
        timeout = 10
    return max(3, min(timeout, 30))


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (TypeError, ValueError):
        return False

