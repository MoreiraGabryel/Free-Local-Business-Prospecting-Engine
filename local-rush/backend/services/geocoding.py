from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx

NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search"
RETRYABLE_HTTP_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


class GeocodingServiceError(Exception):
    """Friendly error surfaced to API layer."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _safe_timeout() -> int:
    raw = os.getenv("GEOCODING_TIMEOUT_SECONDS", "20")
    try:
        timeout = int(raw)
    except ValueError:
        timeout = 20
    return max(5, min(timeout, 60))


def _safe_retries() -> int:
    raw = os.getenv("GEOCODING_RETRIES", "2")
    try:
        retries = int(raw)
    except ValueError:
        retries = 2
    return max(1, min(retries, 4))


def _request_headers() -> dict[str, str]:
    user_agent = os.getenv(
        "GEOCODING_USER_AGENT",
        "LocalRush/0.1 (localhost; contact:local@localhost)",
    )
    referer = os.getenv("GEOCODING_REFERER", "http://localhost")
    return {
        "Accept": "application/json",
        "User-Agent": user_agent,
        "Referer": referer,
    }


def _only_digits(value: str) -> str:
    return "".join(char for char in value if char.isdigit())


def _is_cep_query(value: str) -> bool:
    digits = _only_digits(value)
    return bool(re.fullmatch(r"\d{8}", digits))


def _format_cep(digits: str) -> str:
    return f"{digits[:5]}-{digits[5:]}"


def _build_base_params() -> dict[str, Any]:
    return {
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
        "countrycodes": "br",
    }


def _query_variants(cleaned_query: str) -> list[dict[str, Any]]:
    base = _build_base_params()
    variants: list[dict[str, Any]] = []

    if _is_cep_query(cleaned_query):
        cep_digits = _only_digits(cleaned_query)
        formatted_cep = _format_cep(cep_digits)

        variants.append(
            {
                **base,
                "postalcode": formatted_cep,
                "country": "Brasil",
            }
        )
        variants.append(
            {
                **base,
                "q": f"{formatted_cep}, Brasil",
            }
        )
        variants.append(
            {
                **base,
                "q": cep_digits,
            }
        )
    else:
        variants.append({**base, "q": cleaned_query})

    return variants


def _request_once(
    *,
    params: dict[str, Any],
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    max_retries = _safe_retries()
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.get(
                    NOMINATIM_ENDPOINT,
                    params=params,
                    headers=_request_headers(),
                )
                response.raise_for_status()

            payload = response.json()
            if isinstance(payload, list):
                return payload

            raise GeocodingServiceError(
                "Servico de localizacao retornou um formato inesperado.",
                status_code=502,
            )
        except httpx.TimeoutException as exc:
            last_error = exc
            print(
                "[local-rush] Geocode timeout:",
                f"attempt={attempt}/{max_retries}",
                f"params={params}",
            )
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status_code = exc.response.status_code
            print(
                "[local-rush] Geocode HTTP error:",
                f"status={status_code}",
                f"attempt={attempt}/{max_retries}",
                f"params={params}",
            )

            if status_code not in RETRYABLE_HTTP_STATUS:
                raise GeocodingServiceError(
                    f"Servico de localizacao respondeu com erro HTTP {status_code}.",
                    status_code=502,
                ) from exc
        except httpx.RequestError as exc:
            last_error = exc
            print(
                "[local-rush] Geocode request error:",
                f"attempt={attempt}/{max_retries}",
                f"params={params}",
                f"error={exc}",
            )
        except ValueError as exc:
            raise GeocodingServiceError(
                "Servico de localizacao retornou uma resposta invalida.",
                status_code=502,
            ) from exc

        if attempt < max_retries:
            time.sleep(0.5 * attempt)

    if isinstance(last_error, httpx.TimeoutException):
        raise GeocodingServiceError(
            "A localizacao demorou para responder. Tente novamente.",
            status_code=502,
        ) from last_error

    if isinstance(last_error, httpx.RequestError):
        raise GeocodingServiceError(
            "Nao foi possivel conectar ao servico de localizacao agora.",
            status_code=502,
        ) from last_error

    if isinstance(last_error, httpx.HTTPStatusError):
        raise GeocodingServiceError(
            "Servico de localizacao indisponivel no momento. Tente novamente em instantes.",
            status_code=502,
        ) from last_error

    raise GeocodingServiceError(
        "Nao foi possivel resolver essa localizacao agora.",
        status_code=502,
    )


def resolve_location(query: str) -> dict[str, Any]:
    cleaned_query = query.strip()
    if not cleaned_query:
        raise GeocodingServiceError("Informe uma cidade, bairro ou CEP.", status_code=422)

    timeout_seconds = _safe_timeout()
    variants = _query_variants(cleaned_query)

    for params in variants:
        payload = _request_once(params=params, timeout_seconds=timeout_seconds)
        if not payload:
            continue

        first_result = payload[0]
        try:
            lat = float(first_result.get("lat"))
            lng = float(first_result.get("lon"))
        except (TypeError, ValueError) as exc:
            raise GeocodingServiceError(
                "Nao conseguimos converter essa localizacao em coordenadas.",
                status_code=502,
            ) from exc

        display_name = str(first_result.get("display_name") or cleaned_query).strip()

        return {
            "query": cleaned_query,
            "display_name": display_name,
            "lat": lat,
            "lng": lng,
        }

    raise GeocodingServiceError(
        "Nao encontramos essa localizacao. Tente cidade, bairro ou CEP valido.",
        status_code=404,
    )
