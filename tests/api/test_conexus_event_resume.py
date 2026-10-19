import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.routers import conexus


@pytest.mark.parametrize(('cursor', 'expected'), [
    ('12', '12'), ('', None), ('not-a-sequence', None), ('9' * 30, None),
])
def test_events_resume_cursor_preserves_scoped_auth(monkeypatch, cursor, expected):
    monkeypatch.setenv('ALPHALAB_AGENT_MODE', 'local')
    monkeypatch.setenv('CONEXUS_WEB_ORIGIN', 'http://local-host.test')
    monkeypatch.setattr(conexus.agent_run_service, 'run_headers',
                        lambda _run: {'authorization': 'Bearer scoped-run-fixture'})
    observed = []

    class EventStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'id: 13\ndata: {"type":"run.completed"}\n\n'

    def upstream(request):
        observed.append((request.headers.get('last-event-id'), request.headers.get('authorization')))
        return httpx.Response(200, stream=EventStream(), headers={'content-type': 'text/event-stream'})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(conexus.httpx, 'AsyncClient',
                        lambda **kwargs: client_type(transport=httpx.MockTransport(upstream), **kwargs))
    app = FastAPI()
    app.include_router(conexus.router)
    with TestClient(app) as client:
        response = client.get('/api/conexus/runs/run-1/events',
                              headers={'Last-Event-ID': cursor, 'Authorization': 'Basic workstation-fixture'})
    assert response.status_code == 200
    assert observed == [(expected, 'Bearer scoped-run-fixture')]
    assert response.headers['cache-control'] == 'no-cache, no-transform'
