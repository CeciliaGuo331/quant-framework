from __future__ import annotations

import json
import os

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.routers import search_providers
from apps.api.services import model_provider_service as models
from apps.api.services import search_provider_service as service


def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ALPHALAB_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setenv("ALPHALAB_AGENT_MODE", "local")
    monkeypatch.setenv("ALPHALAB_WEB_SEARCH_PROVIDER", "openrouter")
    monkeypatch.setenv("CONEXUS_WEB_ORIGIN", "http://127.0.0.1:8387")
    monkeypatch.setenv("CONEXUS_PUBLICATION_WORKSPACE_TOKEN", "fixture-host-token")
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    monkeypatch.delenv("CONEXUS_MODEL_BASE_URL", raising=False)
    models.save_profile({"id": "search-account", "name": "Search account", "base_url": "https://openrouter.ai/api/v1", "model": "test-model", "api_key": "fixture-model-key"}, activate=True)
    app = FastAPI()
    app.include_router(search_providers.router)
    return TestClient(app)


def test_search_selection_persists_and_overrides_environment_without_returning_keys(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    assert api.get("/api/search-providers").json()["provider"] == "openrouter"
    response = api.put("/api/search-providers", json={"provider": "brave", "brave_api_key": "fixture-brave-key"})
    assert response.status_code == 200
    assert "fixture-brave-key" not in response.text
    assert response.json()["has_brave_api_key"] is True
    assert api.get("/api/search-providers").json()["provider"] == "brave"
    assert api.put("/api/search-providers", json={"provider": "off"}).status_code == 200
    assert api.put("/api/search-providers", json={"provider": "brave"}).status_code == 200
    assert service.read_settings()["brave_api_key"] == "fixture-brave-key"
    assert api.get("/api/search-providers").json()["scope"] == "workstation"
    if os.name != "nt":
        assert service.settings_path().stat().st_mode & 0o077 == 0


def test_search_can_use_an_inactive_saved_openrouter_account(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    models.save_profile({"id": "local-model", "name": "Local", "base_url": "http://127.0.0.1:12345/v1", "model": "local", "api_key": ""}, activate=True)
    assert api.put("/api/search-providers", json={"provider": "openrouter"}).status_code == 422
    response = api.put("/api/search-providers", json={"provider": "openrouter", "model_profile_id": "search-account"})
    assert response.status_code == 200
    assert models.active_profile()["id"] == "local-model"
    assert response.json()["model_profile_id"] == "search-account"
    assert "fixture-model-key" not in response.text


def test_invalid_search_settings_are_private_and_remote_mode_cannot_save(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    response = api.put("/api/search-providers", json={"provider": "brave", "brave_api_key": "sensitive-test-key" * 1000})
    assert response.status_code == 422
    assert "sensitive-test-key" not in response.text
    assert api.put("/api/search-providers", json={"provider": "brave"}).status_code == 422
    assert not service.settings_path().exists()
    monkeypatch.setenv("ALPHALAB_AGENT_MODE", "remote")
    assert api.put("/api/search-providers", json={"provider": "off"}).status_code == 409
    assert api.post("/api/search-providers/test", json={"provider": "off"}).status_code == 409


def test_disabled_search_test_sends_nothing_and_does_not_save(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    response = api.post("/api/search-providers/test", json={"provider": "off"})
    assert response.json()["ok"] is True
    assert not service.settings_path().exists()


def test_search_test_uses_authenticated_local_host_and_does_not_persist(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    original = httpx.AsyncClient

    def handler(request):
        assert str(request.url) == "http://127.0.0.1:8387/api/alphalab/search/test"
        assert request.headers["Authorization"] == "Bearer fixture-host-token"
        assert json.loads(request.content)["model_profile_id"] == "search-account"
        return httpx.Response(200, json={"result": {"success": True, "results": [
            {"url": "javascript:bad", "title": "Rejected"},
            {"url": "https://example.com/source", "title": "Source"},
        ]}})

    monkeypatch.setattr(search_providers.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = api.post("/api/search-providers/test", json={"provider": "openrouter", "model_profile_id": "search-account"})
    assert response.json() == {"ok": True, "message": "Search responded with source links.", "results": [{"title": "Source", "url": "https://example.com/source"}]}
    assert not service.settings_path().exists()


def test_search_test_does_not_forward_credentials_to_a_remote_host(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    monkeypatch.setenv("CONEXUS_WEB_ORIGIN", "https://remote.example")
    assert api.post("/api/search-providers/test", json={"provider": "brave", "brave_api_key": "fixture-brave-key"}).status_code == 503


def test_search_test_never_echoes_host_or_provider_error_bodies(monkeypatch, tmp_path):
    api = client(monkeypatch, tmp_path)
    original = httpx.AsyncClient
    monkeypatch.setattr(search_providers.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"result": {"success": False, "error": "fixture-model-key"}}),
    ), **kwargs))
    response = api.post("/api/search-providers/test", json={"provider": "openrouter"})
    assert response.json()["ok"] is False
    assert "fixture-model-key" not in response.text
