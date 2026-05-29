from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from backend.services.overpass import CATEGORY_MAP, OverpassServiceError, search_overpass

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="Local Rush API", version="0.2.0")

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
            raise ValueError("Categoria inválida para este MVP.")
        return cleaned


@app.get("/")
def read_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
def health_check() -> dict:
    timeout = int(os.getenv("OVERPASS_TIMEOUT_SECONDS", "25"))
    return {
        "status": "ok",
        "service": "local-rush",
        "overpass_timeout_seconds": timeout,
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
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[local-rush] erro interno em /api/search: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Erro interno ao processar a busca.",
        ) from exc

    return {
        "total": len(results),
        "results": results,
        "attribution": "Dados © OpenStreetMap contributors, licença ODbL",
    }
