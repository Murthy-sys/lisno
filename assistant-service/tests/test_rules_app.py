import asyncio
import json
import logging
import time

import httpx
import pytest

from lisno_assistant import rules_app
from lisno_assistant.rules_app import create_app
from lisno_assistant.rules_settings import RulesSettings
from helpers import TOKEN, request

PATH = "/internal/v1/assistant/step"
HEADERS = {"Authorization": "Bearer " + TOKEN}


def client(**settings):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app(RulesSettings(service_token=TOKEN, **settings))),
        base_url="http://test",
    )


def payload(body="Hello", **kwargs):
    return request(body, **kwargs).model_dump(exclude_none=True)


def test_health_is_model_free_and_readiness_requires_bearer():
    async def run():
        async with client() as api:
            live = await api.get("/health/live")
            assert live.status_code == 200 and live.json() == {"status": "live"}
            assert live.headers["cache-control"] == "no-store"
            denied = await api.get("/health/ready")
            assert denied.status_code == 401 and denied.json() == {"error": {"code": "unauthorized"}}
            ready = await api.get("/health/ready", headers=HEADERS)
            assert ready.status_code == 200 and ready.json() == {"status": "ready", "mode": "rules", "protocolVersion": 1}
            assert ready.headers["cache-control"] == "no-store"
            for path in ("/docs", "/openapi.json", "/unknown-private-sentinel"):
                missing = await api.get(path)
                assert missing.status_code == 404 and missing.headers["cache-control"] == "no-store"
                assert "sentinel" not in missing.text
    asyncio.run(run())


@pytest.mark.parametrize("authorization", [None, "Bearer wrong-synthetic-token", "Basic synthetic-token", "Bearer " + TOKEN + "x"])
def test_wrong_authentication_fails_without_request_processing(authorization, monkeypatch):
    def forbidden(_request):
        raise AssertionError("Unauthorized input reached the planner")
    monkeypatch.setattr(rules_app, "rules_step", forbidden)
    async def run():
        async with client() as api:
            headers = {} if authorization is None else {"Authorization": authorization}
            result = await api.post(PATH, headers=headers, json=payload())
            assert result.status_code == 401 and result.json() == {"error": {"code": "unauthorized"}}
            assert TOKEN not in result.text
    asyncio.run(run())


@pytest.mark.parametrize("body", ["Hello", "Show project progress", "Show project timeline", "Show my published estimate", "Tell me a joke", "Show configured prices"])
def test_every_response_is_protocol_one_deterministic_with_zero_usage(body):
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers=HEADERS, json=payload(body, requestId="opaque_request", step=1))
            assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
            decoded = result.json()
            assert decoded["protocolVersion"] == 1 and decoded["requestId"] == "opaque_request" and decoded["step"] == 1
            assert decoded["route"] == "deterministic" and decoded["usage"] == {"inputTokens": 0, "outputTokens": 0}
            if body == "Tell me a joke":
                assert decoded["result"]["clarificationCodes"] == ["unclear_question"]
    asyncio.run(run())


@pytest.mark.parametrize("change", [
    {"unexpected-private-sentinel": "secret-value"}, {"protocolVersion": True}, {"remainingMs": 0},
    {"step": 4}, {"projectAvailable": "yes"}, {"requiredMessageIds": ["missing"]},
    {"messages": [{"id": "message_a", "body": "Hi", "secret": "private-sentinel"}]},
    {"surface": "project_messages", "allowedTools": ["resolve_project"]},
])
def test_strict_invalid_contracts_do_not_echo(change):
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers=HEADERS, json={**payload(), **change})
            assert result.status_code == 422 and result.json() == {"error": {"code": "invalid_request"}}
            assert "sentinel" not in result.text and "secret" not in result.text
    asyncio.run(run())


@pytest.mark.parametrize("content,extra_headers,status,code", [
    (b"{invalid-private-sentinel", {"Content-Type": "application/json"}, 422, "invalid_request"),
    (b"{}", {"Content-Type": "text/plain"}, 415, "unsupported_media_type"),
    (b"{}", {"Content-Type": "application/json", "Content-Encoding": "gzip"}, 415, "unsupported_media_type"),
    (b"x" * 32769, {"Content-Type": "application/json"}, 413, "request_too_large"),
    (b"{}", {"Content-Type": "application/json", "Content-Length": "private-sentinel"}, 422, "invalid_request"),
])
def test_bounded_body_and_content_type(content, extra_headers, status, code):
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers={**HEADERS, **extra_headers}, content=content)
            assert result.status_code == status and result.json() == {"error": {"code": code}}
            assert "sentinel" not in result.text
    asyncio.run(run())


def test_streaming_body_limit_does_not_trust_absent_content_length():
    async def chunks():
        yield b"x" * 16384
        yield b"x" * 16385
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers={**HEADERS, "Content-Type": "application/json"}, content=chunks())
            assert result.status_code == 413 and result.json() == {"error": {"code": "request_too_large"}}
            assert (await api.post(PATH, headers=HEADERS, json=payload())).status_code == 200
    asyncio.run(run())


def test_one_active_request_rejects_busy_without_queueing():
    async def run():
        started, release = asyncio.Event(), asyncio.Event()
        async def chunks():
            started.set()
            await release.wait()
            yield json.dumps(payload()).encode()
        async with client() as api:
            first = asyncio.create_task(api.post(PATH, headers={**HEADERS, "Content-Type": "application/json"}, content=chunks()))
            await asyncio.wait_for(started.wait(), timeout=2)
            second = await api.post(PATH, headers=HEADERS, json=payload())
            assert second.status_code == 429 and second.json() == {"error": {"code": "busy"}}
            release.set()
            assert (await first).status_code == 200
            assert (await api.post(PATH, headers=HEADERS, json=payload())).status_code == 200
    asyncio.run(run())


def test_slow_body_deadline_releases_single_slot():
    async def chunks():
        await asyncio.sleep(0.2)
        yield json.dumps(payload()).encode()
    async def run():
        async with client(request_timeout_ms=100) as api:
            result = await api.post(PATH, headers={**HEADERS, "Content-Type": "application/json"}, content=chunks())
            assert result.status_code == 503 and result.json() == {"error": {"code": "unavailable"}}
            assert (await api.post(PATH, headers=HEADERS, json=payload())).status_code == 200
    asyncio.run(run())


def test_remaining_deadline_also_bounds_synchronous_planning(monkeypatch):
    original = rules_app.rules_step
    def delayed(value):
        time.sleep(0.01)
        return original(value)
    monkeypatch.setattr(rules_app, "rules_step", delayed)
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers=HEADERS, json=payload(remainingMs=1))
            assert result.status_code == 503 and result.json() == {"error": {"code": "unavailable"}}
    asyncio.run(run())


def test_caller_cancellation_releases_single_slot():
    async def run():
        started = asyncio.Event()
        async def chunks():
            started.set()
            await asyncio.sleep(5)
            yield json.dumps(payload()).encode()
        async with client() as api:
            pending = asyncio.create_task(api.post(PATH, headers={**HEADERS, "Content-Type": "application/json"}, content=chunks()))
            await asyncio.wait_for(started.wait(), timeout=2)
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
            assert (await api.post(PATH, headers=HEADERS, json=payload())).status_code == 200
    asyncio.run(run())


def test_exceptions_and_diagnostics_cannot_echo_sensitive_values(monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="lisno_assistant.rules")
    def broken(_request):
        raise RuntimeError("private-error-sentinel " + TOKEN)
    monkeypatch.setattr(rules_app, "rules_step", broken)
    async def run():
        async with client() as api:
            result = await api.post(PATH, headers=HEADERS, json=payload("private-prompt-sentinel", requestId="private_request_sentinel"))
            assert result.status_code == 503 and result.json() == {"error": {"code": "unavailable"}}
            assert "sentinel" not in result.text and TOKEN not in result.text
    asyncio.run(run())
    records = [json.loads(record.message) for record in caplog.records if record.name == "lisno_assistant.rules"]
    assert len(records) == 1 and records[0]["outcome"] == "unavailable" and records[0]["activeRequests"] == 0
    assert "sentinel" not in caplog.text and TOKEN not in caplog.text
