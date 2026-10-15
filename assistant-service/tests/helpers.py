from lisno_assistant.config import Settings
from lisno_assistant.contracts import StepRequest

TOKEN = "synthetic-test-token-never-a-live-secret-0001"
DIGEST = "sha256:" + "a" * 64


def settings(**overrides):
    return Settings(**{"service_token": TOKEN, "model_url": "http://127.0.0.1:11434", "model_name": "lisno-fixture:v1", "model_digest": DIGEST, **overrides})


def request(body="Hello", **overrides):
    return StepRequest.model_validate({"protocolVersion": 1, "requestId": "test_request", "step": 0, "surface": "private", "remainingMs": 5000, "projectAvailable": True, "messages": [{"id": "message_a", "body": body}], "allowedTools": ["resolve_project", "client_profile", "project_status", "project_execution", "project_estimate"], "toolResults": [], **overrides})
