"""Workstation-local search selection; credentials never enter public settings."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from apps.api.services import model_provider_service as models

_LOCK = threading.RLock()


def settings_path() -> Path:
    return models.settings_path().with_name("search-providers.json")


def read_settings() -> dict:
    path = settings_path()
    if path.exists():
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("version") != 1 or value.get("provider") not in {"openrouter", "brave", "off"}:
            raise ValueError("Unsupported search settings format.")
        return value
    return {
        "version": 1, "provider": os.getenv("ALPHALAB_WEB_SEARCH_PROVIDER", "brave").strip() or "brave",
        "model_profile_id": None, "brave_api_key": os.getenv("BRAVE_SEARCH_API_KEY", "").strip(),
    }


def resolve_settings(settings: dict) -> dict:
    previous = read_settings()
    result = {"version": 1, "provider": settings["provider"],
              "model_profile_id": settings.get("model_profile_id"),
              "brave_api_key": settings.get("brave_api_key", "").strip() or previous.get("brave_api_key", "")}
    if result["provider"] not in {"openrouter", "brave", "off"}:
        raise ValueError("Choose OpenRouter, Brave or Off for search.")
    if result["provider"] == "openrouter":
        identifier = result["model_profile_id"]
        profile = (next((row for row in models.read_settings()["profiles"] if row["id"] == identifier), None)
                   if identifier else models.active_profile())
        if not profile or profile.get("base_url", "").rstrip("/") != "https://openrouter.ai/api/v1" or not profile.get("api_key"):
            raise ValueError("Choose a saved OpenRouter model profile with an API key.")
    elif result["provider"] == "brave" and not result["brave_api_key"]:
        raise ValueError("Enter a Brave Search API key.")
    return result


def public_settings() -> dict:
    settings = read_settings()
    try:
        resolve_settings(settings)
        configured = True
    except ValueError:
        configured = False
    return {
        "mode": os.getenv("ALPHALAB_AGENT_MODE", "remote"), "scope": "workstation",
        "provider": settings["provider"], "model_profile_id": settings.get("model_profile_id"),
        "has_brave_api_key": bool(settings.get("brave_api_key")), "configured": configured,
        "source": "saved" if settings_path().exists() else "environment",
    }


def save_settings(settings: dict) -> dict:
    with _LOCK:
        value = resolve_settings(settings)
        path = settings_path()
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_suffix(".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream)
        os.replace(temporary, path)
        if os.name != "nt":
            path.chmod(0o600)
    return public_settings()
