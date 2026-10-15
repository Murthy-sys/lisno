"""Strict metadata-only diagnostics. No prompts, headers or upstream errors."""
import json
import logging

logger = logging.getLogger("lisno_assistant.metrics")


def request_finished(*, request_id, route, elapsed_ms, active, outcome, input_tokens, output_tokens, model_version):
    logger.info(json.dumps({"event": "assistant_step_finished", "requestId": request_id, "route": route, "elapsedMs": elapsed_ms, "activeRequests": active, "queuedRequests": 0, "outcome": outcome, "inputTokens": input_tokens, "outputTokens": output_tokens, "modelVersion": model_version}, separators=(",", ":")))
