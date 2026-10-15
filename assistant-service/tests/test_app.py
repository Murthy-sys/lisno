import asyncio
import json
import logging

import httpx

from lisno_assistant.app import create_app
from lisno_assistant.planner import final
from lisno_assistant.contracts import Usage
from helpers import TOKEN, request, settings

HEADERS = {"Authorization": "Bearer " + TOKEN}


class FakeRuntime:
    def __init__(self, delay=0):
        self.calls, self.delay, self.cancelled = 0, delay, False
        self.started = asyncio.Event()
    async def ready(self):
        return False
    async def generate(self, _request):
        self.calls += 1
        self.started.set()
        try:
            await asyncio.sleep(self.delay)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        return final(code="unclear_question"), Usage(inputTokens=10, outputTokens=5)
    async def close(self):
        pass


def test_auth_bounds_and_no_echo_errors():
    async def run():
        runtime = FakeRuntime()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings(), runtime)), base_url="http://test") as client:
            assert (await client.get("/health/live")).status_code == 200
            assert (await client.get("/health/ready", headers=HEADERS)).status_code == 503
            assert (await client.post("/internal/v1/assistant/step", json=request().model_dump(exclude_none=True))).status_code == 401
            malformed = await client.post("/internal/v1/assistant/step", headers=HEADERS, json={"private-sentinel": "secret"})
            assert malformed.status_code == 422 and "sentinel" not in malformed.text and "secret" not in malformed.text
            oversized = await client.post("/internal/v1/assistant/step", headers={**HEADERS, "Content-Type": "application/json"}, content=b"x" * 32769)
            assert oversized.status_code == 413
            result = await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request().model_dump(exclude_none=True))
            assert result.status_code == 200 and result.json()["route"] == "deterministic"
            assert result.headers["cache-control"] == "no-store" and runtime.calls == 0
    asyncio.run(run())


def test_timeout_cancels_model_and_releases_slot():
    async def run():
        runtime = FakeRuntime(delay=1)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings(max_concurrency=1), runtime)), base_url="http://test") as client:
            result = await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request("What about that?", remainingMs=20).model_dump(exclude_none=True))
            assert result.status_code == 503 and runtime.cancelled
            assert (await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request().model_dump(exclude_none=True))).status_code == 200
    asyncio.run(run())


def test_saturation_does_not_queue_or_invoke_more_models():
    async def run():
        runtime = FakeRuntime(delay=0.1)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings(max_concurrency=1), runtime)), base_url="http://test") as client:
            first = asyncio.create_task(client.post("/internal/v1/assistant/step", headers=HEADERS, json=request("What about that?").model_dump(exclude_none=True)))
            await runtime.started.wait()
            second = await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request("What about that?").model_dump(exclude_none=True))
            assert second.status_code == 429
            assert (await first).status_code == 200 and runtime.calls == 1
    asyncio.run(run())


def test_caller_cancellation_releases_slot():
    async def run():
        runtime = FakeRuntime(delay=1)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings(max_concurrency=1), runtime)), base_url="http://test") as client:
            task = asyncio.create_task(client.post("/internal/v1/assistant/step", headers=HEADERS, json=request("What about that?").model_dump(exclude_none=True)))
            await runtime.started.wait()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            assert runtime.cancelled
            assert (await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request().model_dump(exclude_none=True))).status_code == 200
    asyncio.run(run())


def test_metadata_only_diagnostics(caplog):
    caplog.set_level(logging.INFO, logger="lisno_assistant.metrics")
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings(), FakeRuntime())), base_url="http://test") as client:
            result = await client.post("/internal/v1/assistant/step", headers=HEADERS, json=request("password: unique-private-sentinel").model_dump(exclude_none=True))
            assert result.status_code == 200
    asyncio.run(run())
    entries = [json.loads(record.message) for record in caplog.records if record.name == "lisno_assistant.metrics"]
    assert len(entries) == 1
    assert entries[0]["requestId"] == "test_request"
    assert entries[0]["route"] == "deterministic" and entries[0]["outcome"] == "ok"
    assert entries[0]["activeRequests"] == 0 and entries[0]["inputTokens"] == 0
    assert "unique-private-sentinel" not in caplog.text and TOKEN not in caplog.text
