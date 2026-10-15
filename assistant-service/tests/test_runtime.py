import asyncio
import json

import httpx
import pytest

from lisno_assistant.config import Settings, validate_model_url
from lisno_assistant.runtime import ModelUnavailable, OllamaRuntime
from helpers import DIGEST, request, settings


@pytest.mark.parametrize("url", ["https://api.example.com:443", "https://8.8.8.8:443", "http://10.0.0.1:11434", "http://169.254.169.254:80", "http://127.0.0.1:11434/api", "http://user:pass@127.0.0.1:11434", "http://127.0.0.1:11434/?redirect=x"])
def test_external_or_untrusted_destinations_rejected(url):
    with pytest.raises(ValueError):
        validate_model_url(url)


@pytest.mark.parametrize("name", ["qwen:cloud", "https://model.invalid", "qwen", "org/model:latest"])
def test_unpinned_or_cloud_model_names_rejected(name):
    with pytest.raises(ValueError):
        settings(model_name=name)


def test_required_cloud_disable(monkeypatch):
    monkeypatch.delenv("OLLAMA_NO_CLOUD", raising=False)
    with pytest.raises(ValueError, match="OLLAMA_NO_CLOUD"):
        Settings.from_env()


@pytest.mark.parametrize("character", ["\x00", "\x7f", "\x1f", " ", "\n"])
def test_service_token_rejects_nonprintable_header_characters(character):
    with pytest.raises(ValueError):
        settings(service_token="a" * 40 + character)


def test_model_input_cannot_silently_exceed_context():
    calls = []
    def handler(req):
        calls.append(req.url.path)
        raise AssertionError("Oversized model inputs must fail before any model request")
    async def run():
        model = OllamaRuntime(settings(), transport=httpx.MockTransport(handler))
        large = request(messages=[{"id": f"m{i}", "body": "x" * 1900} for i in range(10)], requiredMessageIds=[f"m{i}" for i in range(10)])
        with pytest.raises(ModelUnavailable):
            await model.generate(large)
        await model.close()
    asyncio.run(run())
    assert calls == []


def test_single_model_call_schema_and_real_usage():
    paths = []
    def handler(req):
        paths.append(req.url.path)
        assert req.url.host == "127.0.0.1"
        if req.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "lisno-fixture:v1", "digest": DIGEST}]})
        payload = json.loads(req.content)
        assert payload["stream"] is False and payload["think"] is False
        assert payload["format"] and len(payload["messages"]) == 2
        assert "ASSISTANT_SERVICE_TOKEN" not in req.content.decode()
        return httpx.Response(200, json={"model": "lisno-fixture:v1", "done": True, "done_reason": "stop", "message": {"role": "assistant", "content": json.dumps({"type": "tools", "calls": [{"id": "s0", "name": "project_status", "args": {}}]})}, "prompt_eval_count": 120, "eval_count": 35})
    async def run():
        model = OllamaRuntime(settings(), transport=httpx.MockTransport(handler))
        result, usage = await model.generate(request("How are things going?"))
        assert result.calls[0].name == "project_status"
        assert usage.inputTokens == 120 and usage.outputTokens == 35
        await model.close()
    asyncio.run(run())
    assert paths == ["/api/tags", "/api/chat", "/api/tags"]


@pytest.mark.parametrize("failure", ["redirect", "digest", "missing", "remote", "oversized", "malformed", "bad_usage", "unknown_tool", "timeout"])
def test_unavailable_has_no_pull_retry_or_cloud_fallback(failure):
    paths = []
    def handler(req):
        paths.append(req.url.path)
        if failure == "redirect":
            return httpx.Response(302, headers={"location": "https://external.invalid/api"})
        if failure == "timeout":
            raise httpx.ReadTimeout("synthetic-private-sentinel")
        if req.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [] if failure == "missing" else [{"name": "lisno-fixture:v1", "digest": "wrong" if failure == "digest" else DIGEST, **({"remote_host": "external.invalid"} if failure == "remote" else {})}]})
        if failure == "oversized":
            return httpx.Response(200, content=b"x" * 70_000)
        if failure == "malformed":
            return httpx.Response(200, content=b"synthetic-private-sentinel")
        return httpx.Response(200, json={"model": "lisno-fixture:v1", "done": True, "message": {"role": "assistant", "content": json.dumps({"type": "tools", "calls": [{"id": "a", "name": "search_catalogue" if failure == "unknown_tool" else "project_status", "args": {}}]})}, "prompt_eval_count": -1 if failure == "bad_usage" else 5, "eval_count": 10})
    async def run():
        model = OllamaRuntime(settings(), transport=httpx.MockTransport(handler))
        with pytest.raises(ModelUnavailable) as caught:
            await model.generate(request("How are things going?"))
        assert "sentinel" not in str(caught.value)
        await model.close()
    asyncio.run(run())
    assert paths.count("/api/chat") <= 1 and all(path in ("/api/tags", "/api/chat") for path in paths)
