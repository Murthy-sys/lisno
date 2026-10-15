import asyncio
from contextlib import asynccontextmanager, suppress
import hmac
import json
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import Settings
from .contracts import StepRequest, StepResponse, Usage
from .planner import direct_step
from .runtime import ModelRuntime, ModelUnavailable, OllamaRuntime
from .telemetry import request_finished

MAX_BODY_BYTES = 32_768


class Slots:
    """One event loop, no waiting queue; Node owns durable admission."""
    def __init__(self, maximum: int):
        self.maximum, self.active = maximum, 0

    def enter(self) -> bool:
        if self.active >= self.maximum:
            return False
        self.active += 1
        return True

    def leave(self):
        self.active -= 1


def error(status: int, code: str):
    return JSONResponse({"error": {"code": code}}, status_code=status, headers={"Cache-Control": "no-store"})


def create_app(settings: Settings | None = None, runtime: ModelRuntime | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    runtime = runtime or OllamaRuntime(settings)
    slots = Slots(settings.max_concurrency)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        await runtime.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorized(request: Request):
        provided = request.headers.get("authorization", "")
        return hmac.compare_digest(provided.encode("utf-8"), ("Bearer " + settings.service_token).encode("utf-8"))

    @app.get("/health/live")
    async def live():
        return JSONResponse({"status": "live"}, headers={"Cache-Control": "no-store"})

    @app.get("/health/ready")
    async def ready(request: Request):
        if not authorized(request):
            return error(401, "unauthorized")
        return JSONResponse({"status": "ready"}, headers={"Cache-Control": "no-store"}) if await runtime.ready() else error(503, "unavailable")

    @app.post("/internal/v1/assistant/step")
    async def step(request: Request):
        started = time.monotonic()
        metadata = {"request_id": None, "route": "unclassified", "outcome": "cancelled", "input_tokens": None, "output_tokens": None}
        def emit():
            request_finished(**metadata, elapsed_ms=round((time.monotonic() - started) * 1000), active=slots.active, model_version=settings.model_digest[:23])
        def failure(status, code):
            metadata["outcome"] = code
            return error(status, code)
        if not authorized(request):
            result = failure(401, "unauthorized")
            emit()
            return result
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json" or request.headers.get("content-encoding", "identity") != "identity":
            result = failure(415, "unsupported_media_type")
            emit()
            return result
        if not slots.enter():
            result = failure(429, "busy")
            emit()
            return result
        task = None
        disconnect_task = None
        try:
            async with asyncio.timeout(settings.request_timeout_ms / 1000):
                body = bytearray()
                async for chunk in request.stream():
                    if len(body) + len(chunk) > MAX_BODY_BYTES:
                        return failure(413, "request_too_large")
                    body.extend(chunk)
                try:
                    parsed = StepRequest.model_validate_json(body)
                except (ValidationError, ValueError):
                    return failure(422, "invalid_request")
                metadata["request_id"] = parsed.requestId
                async with asyncio.timeout(parsed.remainingMs / 1000):
                    result = direct_step(parsed)
                    route, usage = "deterministic", Usage(inputTokens=0, outputTokens=0)
                    metadata["route"] = route
                    if result is None:
                        route = "model"
                        metadata["route"] = route
                        task = asyncio.create_task(runtime.generate(parsed))
                        async def disconnected():
                            while True:
                                event = await request.receive()
                                if event["type"] == "http.disconnect":
                                    return
                        disconnect_task = asyncio.create_task(disconnected())
                        done, _ = await asyncio.wait({task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED)
                        if disconnect_task in done:
                            return failure(499, "cancelled")
                        result, usage = await task
                    response = StepResponse(protocolVersion=1, requestId=parsed.requestId, step=parsed.step, route=route, usage=usage, result=result)
                    encoded = response.model_dump_json().encode("utf-8")
                    if len(encoded) > MAX_BODY_BYTES:
                        return failure(503, "unavailable")
                    metadata.update(outcome="ok", input_tokens=usage.inputTokens if usage else None, output_tokens=usage.outputTokens if usage else None)
                    return JSONResponse(json.loads(encoded), headers={"Cache-Control": "no-store"})
        except (TimeoutError, ModelUnavailable, ValidationError):
            return failure(503, "unavailable")
        finally:
            for pending in (task, disconnect_task):
                if pending is None or pending.done():
                    continue
                pending.cancel()
                with suppress(asyncio.CancelledError):
                    await pending
            slots.leave()
            emit()

    return app
