import json
import logging
from pathlib import Path
import subprocess
import sys

import pytest

from lisno_assistant.rules_settings import RulesSettings
from helpers import TOKEN


def test_rules_settings_require_only_a_token(monkeypatch):
    monkeypatch.setenv("ASSISTANT_SERVICE_TOKEN", TOKEN)
    for key in ("ASSISTANT_MODEL_URL", "ASSISTANT_MODEL_NAME", "ASSISTANT_MODEL_DIGEST", "OLLAMA_NO_CLOUD", "ASSISTANT_RULES_PORT", "ASSISTANT_REQUEST_TIMEOUT_MS"):
        monkeypatch.delenv(key, raising=False)
    assert RulesSettings.from_env() == RulesSettings(service_token=TOKEN)
    assert TOKEN not in repr(RulesSettings.from_env())


@pytest.mark.parametrize("token", ["", "short", "x" * 513, "x" * 31 + " ", "x" * 31 + "\n", "x" * 31 + "é"])
def test_reject_invalid_tokens_without_echoing(token):
    with pytest.raises(ValueError) as error:
        RulesSettings(service_token=token)
    assert "server-only assistant token" in str(error.value)
    if len(token) > 10:
        assert token not in str(error.value)


@pytest.mark.parametrize("overrides", [{"port": 0}, {"port": 80}, {"port": 65536}, {"port": True}, {"port": "8080"}, {"request_timeout_ms": 99}, {"request_timeout_ms": 19001}, {"request_timeout_ms": True}])
def test_reject_unsafe_bounds(overrides):
    with pytest.raises(ValueError):
        RulesSettings(service_token=TOKEN, **overrides)


def test_port_and_timeout_environment(monkeypatch):
    monkeypatch.setenv("ASSISTANT_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("ASSISTANT_RULES_PORT", "18081")
    monkeypatch.setenv("ASSISTANT_REQUEST_TIMEOUT_MS", "500")
    assert RulesSettings.from_env() == RulesSettings(service_token=TOKEN, port=18081, request_timeout_ms=500)
    monkeypatch.setenv("ASSISTANT_RULES_PORT", "not-a-port-private-sentinel")
    with pytest.raises(ValueError, match="Invalid rules-service bounds") as error:
        RulesSettings.from_env()
    assert "sentinel" not in str(error.value)


def test_entrypoint_is_loopback_single_worker_with_no_access_logs(monkeypatch):
    from lisno_assistant import rules_main
    monkeypatch.setenv("ASSISTANT_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("ASSISTANT_RULES_PORT", "18082")
    called = {}
    monkeypatch.setattr(rules_main.uvicorn, "run", lambda app, **kwargs: called.update(kwargs))
    logger = logging.getLogger("lisno_assistant.rules")
    previous = logger.handlers[:], logger.propagate, logger.level
    try:
        rules_main.main()
    finally:
        logger.handlers, logger.propagate, logger.level = previous
    assert called["host"] == "127.0.0.1" and called["port"] == 18082
    assert called["workers"] == 1 and called["access_log"] is False
    assert called["proxy_headers"] is False and called["server_header"] is False


def test_entrypoint_configuration_failure_does_not_dump_environment(monkeypatch):
    from lisno_assistant.rules_main import main
    monkeypatch.setenv("ASSISTANT_SERVICE_TOKEN", "private-sentinel")
    with pytest.raises(SystemExit) as error:
        main()
    assert str(error.value) == "Invalid rules-service configuration"


def test_clean_process_import_cannot_load_models_or_network_clients():
    # A fresh interpreter proves imports are not accidentally hidden by the
    # existing model tests' module cache. The blocker also forbids networking.
    source = Path(__file__).parents[1] / "src"
    program = """
import importlib.abc, json, socket, sys
sys.path.insert(0, sys.argv[1])
blocked = ('lisno_assistant.app', 'lisno_assistant.config', 'lisno_assistant.runtime',
           'httpx', 'httpcore', 'requests', 'ollama', 'torch', 'transformers',
           'opentelemetry.sdk', 'opentelemetry.exporter')
class Blocker(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if any(fullname == name or fullname.startswith(name + '.') for name in blocked):
            raise AssertionError('Forbidden runtime import')
def deny(*args, **kwargs):
    raise AssertionError('Network access is forbidden')
socket.create_connection = socket.getaddrinfo = deny
socket.socket.connect = deny
sys.meta_path.insert(0, Blocker())
import lisno_assistant.rules_main
from lisno_assistant.rules_app import create_app
from lisno_assistant.rules_settings import RulesSettings
create_app(RulesSettings(service_token='synthetic-rules-token-for-tests-only-0001'))
print(json.dumps({'loaded': True}))
"""
    result = subprocess.run([sys.executable, "-c", program, str(source)], capture_output=True, text=True, check=True, timeout=10)
    assert json.loads(result.stdout) == {"loaded": True}
