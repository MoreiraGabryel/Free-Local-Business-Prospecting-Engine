from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from backend.services.geocoding import GeocodingServiceError, resolve_location
from backend.services.overpass import CATEGORY_MAP, OverpassServiceError, search_overpass

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="Local Rush API", version="0.3.1")

allowed_origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


class SearchPayload(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius: int = Field(default=1500, ge=1, le=5000)
    category: str
    limit: int = Field(default=10, ge=1, le=20)
    only_with_site: bool = Field(default=False)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in CATEGORY_MAP:
            raise ValueError("Categoria invalida para este MVP.")
        return cleaned


class GeocodePayload(BaseModel):
    query: str = Field(..., min_length=3, max_length=120)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Informe uma cidade, bairro ou CEP.")
        return cleaned


@app.get("/")
def read_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
def health_check() -> dict:
    timeout = int(os.getenv("OVERPASS_TIMEOUT_SECONDS", "25"))
    geocode_timeout = int(os.getenv("GEOCODING_TIMEOUT_SECONDS", "20"))
    return {
        "status": "ok",
        "service": "local-rush",
        "overpass_timeout_seconds": timeout,
        "geocoding_timeout_seconds": geocode_timeout,
    }


@app.post("/api/geocode")
def geocode_location(payload: GeocodePayload) -> dict:
    print("[local-rush] /api/geocode solicitado")

    try:
        result = resolve_location(payload.query)
    except GeocodingServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        print("[local-rush] erro interno em /api/geocode")
        raise HTTPException(
            status_code=500,
            detail="Erro interno ao resolver localizacao.",
        ) from exc

    return {
        "query": result["query"],
        "display_name": result["display_name"],
        "lat": result["lat"],
        "lng": result["lng"],
        "attribution": "Dados © OpenStreetMap contributors, licença ODbL",
    }


@app.post("/api/search")
def search_businesses(payload: SearchPayload) -> dict:
    print(
        "[local-rush] /api/search",
        f"category={payload.category}",
        f"radius={payload.radius}",
        f"limit={payload.limit}",
        f"only_with_site={payload.only_with_site}",
    )

    try:
        results = search_overpass(
            lat=payload.lat,
            lng=payload.lng,
            radius=payload.radius,
            category=payload.category,
            limit=payload.limit,
            only_with_site=payload.only_with_site,
        )
    except OverpassServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        print("[local-rush] erro interno em /api/search")
        raise HTTPException(
            status_code=500,
            detail="Erro interno ao processar a busca.",
        ) from exc

    return {
        "total": len(results),
        "results": results,
        "attribution": "Dados © OpenStreetMap contributors, licença ODbL",
    }
