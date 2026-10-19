"""Private search-provider settings and an explicit, bounded connection test."""
from __future__ import annotations

import os
from typing import Literal
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from apps.api.routers.model_providers import PrivateValidationRoute, require_local
from apps.api.services import agent_run_service
from apps.api.services import search_provider_service as service

router = APIRouter(prefix="/api/search-providers", tags=["search-providers"], route_class=PrivateValidationRoute)


class SearchProviderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["openrouter", "brave", "off"]
    model_profile_id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    brave_api_key: str = Field(default="", max_length=8192, repr=False)


@router.get("")
def read_search_providers() -> dict:
    try:
        return service.public_settings()
    except (OSError, ValueError):
        raise HTTPException(503, "Search settings could not be read.") from None


@router.put("")
def save_search_provider(request: SearchProviderRequest) -> dict:
    require_local()
    try:
        return service.save_settings(request.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    except OSError:
        raise HTTPException(503, "Search settings could not be saved.") from None


@router.post("/test")
async def test_search_provider(request: SearchProviderRequest) -> dict:
    require_local()
    try:
        settings = service.resolve_settings(request.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    if settings["provider"] == "off":
        return {"ok": True, "message": "Web search is disabled. No search request was sent.", "results": []}
    origin = agent_run_service.web_origin()
    parsed = urlsplit(origin)
    token = os.getenv("CONEXUS_PUBLICATION_WORKSPACE_TOKEN", "").strip()
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or not token:
        raise HTTPException(503, "The local Agent is unavailable. Start it before testing search.")
    try:
        async with httpx.AsyncClient(timeout=55, trust_env=False, follow_redirects=False) as client:
            response = await client.post(origin + "/api/alphalab/search/test", json=settings,
                                         headers={"Authorization": "Bearer " + token})
        if response.status_code != 200:
            return {"ok": False, "message": "The local search test failed. Check Agent availability."}
        payload = response.json().get("result", {})
        if payload.get("success") is not True:
            return {"ok": False, "message": "Search failed. Check the selected provider, key, model access and network settings."}
        results = []
        for row in payload.get("results", [])[:3]:
            url = urlsplit(row["url"])
            if url.scheme in {"http", "https"} and url.hostname and not url.username and not url.password:
                results.append({"title": row["title"], "url": row["url"]})
        if not results:
            return {"ok": False, "message": "Search returned no source links."}
        return {"ok": True, "message": "Search responded with source links.", "results": results}
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        return {"ok": False, "message": "Search test failed or timed out. Check the provider and network settings."}
