from __future__ import annotations

import hashlib
import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from backend.services.place_dedupe import dedupe_leads, normalize_text
from backend.services.place_providers import (
    FoursquareProvider,
    GeoapifyProvider,
    ManualProvider,
    OpenStreetMapProvider,
    PlaceProvider,
)
from backend.services.place_types import LeadRecord, PlaceSearchParams
from backend.services.supabase_cache import SupabaseSearchCache


class PlaceSearchService:
    def __init__(
        self,
        *,
        cache: SupabaseSearchCache | None = None,
        primary_provider: PlaceProvider | None = None,
        complementary_providers: list[PlaceProvider] | None = None,
    ) -> None:
        self.cache = cache or SupabaseSearchCache()
        self.primary_provider = primary_provider or OpenStreetMapProvider()
        self.complementary_providers = complementary_providers or [
            GeoapifyProvider(),
            FoursquareProvider(),
            ManualProvider(),
        ]

    def search(self, params: PlaceSearchParams) -> dict[str, object]:
        cache_key = build_cache_key(params)
        cached = self.cache.get_valid_cache(cache_key=cache_key, limit=params.limit)
        if cached is not None:
            print(
                "[local-rush] Cache hit:",
                f"cache_key={cache_key}",
                f"results={len(cached)}",
            )
            return {
                "cache_key": cache_key,
                "cache_hit": True,
                "providers": ["cache"],
                "results": cached[: params.limit],
                "result_count": len(cached),
            }

        provider_limit = max(params.limit, _strong_result_threshold())
        provider_params = replace(params, limit=provider_limit)

        print(
            "[local-rush] Cache miss, buscando provider principal:",
            f"cache_key={cache_key}",
            f"limit={provider_limit}",
        )
        primary_results = self.primary_provider.search_places(provider_params)
        all_results: list[LeadRecord] = list(primary_results)
        providers_used = [self.primary_provider.source]

        if self._should_use_complementary_provider(len(primary_results), params):
            for provider in self.complementary_providers:
                if provider.source == "manual":
                    continue
                try:
                    complementary_results = provider.search_places(provider_params)
                except Exception as exc:
                    print(
                        "[local-rush] Provider complementar falhou:",
                        provider.source,
                        exc,
                    )
                    continue

                if not complementary_results:
                    continue

                providers_used.append(provider.source)
                all_results.extend(complementary_results)

        deduped = dedupe_leads(all_results)
        expires_at = datetime.now(UTC) + timedelta(hours=_cache_ttl_hours())

        saved_cache = self.cache.save_cache(
            cache_key=cache_key,
            params=params,
            expires_at=expires_at,
            leads=deduped,
        )
        if saved_cache:
            cached_after_write = self.cache.get_valid_cache(
                cache_key=cache_key,
                limit=params.limit,
            )
            if cached_after_write is not None:
                deduped = cached_after_write

        return {
            "cache_key": cache_key,
            "cache_hit": False,
            "providers": providers_used,
            "results": deduped[: params.limit],
            "result_count": len(deduped),
        }

    def mark_lead_saved(self, lead_id: str, user_id: str | None = None) -> bool:
        return self.cache.mark_lead_saved(lead_id=lead_id, user_id=user_id)

    def cleanup_expired_cache(self) -> dict[str, object] | None:
        return self.cache.cleanup_expired_cache()

    def _should_use_complementary_provider(
        self,
        primary_count: int,
        params: PlaceSearchParams,
    ) -> bool:
        if primary_count < _auto_fallback_threshold():
            return True

        if primary_count >= _strong_result_threshold():
            return False

        return params.expanded_search or _complement_mid_results()


def build_cache_key(params: PlaceSearchParams) -> str:
    rounded_lat = f"{params.lat:.3f}"
    rounded_lng = f"{params.lng:.3f}"
    material = "|".join(
        [
            normalize_text(params.category),
            normalize_text(params.city),
            str(params.radius),
            rounded_lat,
            rounded_lng,
            "site" if params.only_with_site else "all",
        ]
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    return f"place_search:{digest}"


def _cache_ttl_hours() -> int:
    raw = os.getenv("SEARCH_CACHE_TTL_HOURS", "24")
    try:
        return max(1, min(int(raw), 24 * 30))
    except ValueError:
        return 24


def _auto_fallback_threshold() -> int:
    raw = os.getenv("PLACE_FALLBACK_AUTO_THRESHOLD", "10")
    try:
        return max(0, min(int(raw), 100))
    except ValueError:
        return 10


def _strong_result_threshold() -> int:
    raw = os.getenv("PLACE_FALLBACK_STRONG_THRESHOLD", "30")
    try:
        return max(1, min(int(raw), 100))
    except ValueError:
        return 30


def _complement_mid_results() -> bool:
    return os.getenv("PLACE_COMPLEMENT_MID_RESULTS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "sim",
    }

