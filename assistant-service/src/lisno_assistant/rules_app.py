"""Private HTTP protocol for deterministic rules; no inference or data clients."""
import asyncio
import hmac
import json
import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .contracts import StepRequest, StepResponse, Usage
from .rules_planner import rules_step
from .rules_settings import RulesSettings

MAX_BODY_BYTES = 32_768
_metrics = logging.getLogger("lisno_assistant.rules")


def _error(status: int, code: str):
    return JSONResponse({"error": {"code": code}}, status_code=status, headers={"Cache-Control": "no-store"})


def create_app(settings: RulesSettings | None = None) -> FastAPI:
    settings = settings or RulesSettings.from_env()
    active = False
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception:
            # Never allow framework exception dumps to contain prompts/headers.
            response = _error(503, "unavailable")
        response.headers["Cache-Control"] = "no-store"
        return response

    def authorized(request: Request) -> bool:
        return hmac.compare_digest(
            request.headers.get("authorization", "").encode("utf-8"),
            ("Bearer " + settings.service_token).encode("utf-8"),
        )

    @app.get("/health/live")
    async def live():
        return JSONResponse({"status": "live"})

    @app.get("/health/ready")
    async def ready(request: Request):
        return JSONResponse({"status": "ready", "mode": "rules", "protocolVersion": 1}) if authorized(request) else _error(401, "unauthorized")

    @app.post("/internal/v1/assistant/step")
    async def step(request: Request):
        nonlocal active
        if not authorized(request):
            return _error(401, "unauthorized")
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json" or request.headers.get("content-encoding", "identity").lower() != "identity":
            return _error(415, "unsupported_media_type")
        length = request.headers.get("content-length")
        if length is not None and (not length.isascii() or not length.isdecimal() or len(length) > 10):
            return _error(422, "invalid_request")
        if length is not None and int(length) > MAX_BODY_BYTES:
            return _error(413, "request_too_large")
        if active:
            return _error(429, "busy")
        active = True
        started = time.monotonic()
        outcome = "cancelled"

        def failure(status: int, code: str):
            nonlocal outcome
            outcome = code
            return _error(status, code)

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
                deadline = min(started + settings.request_timeout_ms / 1000, time.monotonic() + parsed.remainingMs / 1000)
                result = rules_step(parsed)
                if time.monotonic() >= deadline:
                    return failure(503, "unavailable")
                response = StepResponse(
                    protocolVersion=1, requestId=parsed.requestId, step=parsed.step,
                    route="deterministic", usage=Usage(inputTokens=0, outputTokens=0), result=result,
                )
                encoded = response.model_dump_json().encode("utf-8")
                if len(encoded) > MAX_BODY_BYTES:
                    return failure(503, "unavailable")
                outcome = "ok"
                return JSONResponse(json.loads(encoded))
        except Exception:
            return failure(503, "unavailable")
        finally:
            active = False
            _metrics.info(json.dumps({
                "event": "rules_step", "outcome": outcome, "route": "deterministic",
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "activeRequests": 0, "inputTokens": 0, "outputTokens": 0,
            }, separators=(",", ":")))

    return app
