import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from lisno_assistant.contracts import StepRequest, StepResponse
from helpers import request

FIXTURES = json.loads((Path(__file__).parents[2] / "contracts/assistant-step-fixtures.json").read_text())


@pytest.mark.parametrize("fixture", FIXTURES["requests"], ids=lambda item: item["name"])
def test_shared_requests(fixture):
    if fixture["valid"]:
        StepRequest.model_validate(fixture["value"])
    else:
        with pytest.raises(ValidationError):
            StepRequest.model_validate(fixture["value"])


@pytest.mark.parametrize("fixture", FIXTURES["responses"], ids=lambda item: item["name"])
def test_shared_responses(fixture):
    if fixture["valid"]:
        StepResponse.model_validate(fixture["value"])
    else:
        with pytest.raises(ValidationError):
            StepResponse.model_validate(fixture["value"])


@pytest.mark.parametrize("overrides", [{"protocolVersion": True}, {"step": "1"}, {"step": True}, {"remainingMs": 90001}, {"requiredMessageIds": None}, {"allowedTools": ["project_status", "project_status"]}, {"messages": [{"id": "m", "body": "hello", "hasAttachments": None}]}])
def test_no_coercion_or_optional_null(overrides):
    with pytest.raises(ValidationError):
        request(**overrides)


def test_integral_json_numbers_and_utf16_lengths_match_node():
    assert request(step=1.0).step == 1
    with pytest.raises(ValidationError):
        request(messages=[{"id": "a", "body": "\U0001f642" * 1001}])
