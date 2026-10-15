import pytest

from lisno_assistant.contracts import RESULT_ADAPTER
from lisno_assistant.planner import direct_step, validate_model_result
from helpers import request


@pytest.mark.parametrize("body", ["Hi", "Hello Lisno!", "Good morning", "Namaste", "Thanks", "Thank you very much.", "Bye"])
def test_social_without_model(body):
    result = direct_step(request(body))
    assert result.type == "final" and result.narrative
    assert not result.factIds and result.projectEstimateRef is None


def test_emotion_is_not_answered_as_greeting():
    result = direct_step(request("I'm upset"))
    assert result.kind == "no_answer" and "sorry" in result.narrative[0].text
    assert "Hello" not in result.narrative[0].text


def test_latest_thanks_does_not_repeat_old_business_question():
    result = direct_step(request(messages=[{"id": "a", "body": "My project cost?"}, {"id": "b", "body": "Thanks"}]))
    assert result.type == "final" and result.narrative[0].text.startswith("You're welcome")


@pytest.mark.parametrize("body,tool", [("Hi, what is my project cost?", "project_estimate"), ("Thanks, show my project progress", "project_status"), ("Hello, show approved estimate", "project_estimate"), ("When is project completion?", "project_execution")])
def test_greeting_never_discards_business_intent(body, tool):
    result = direct_step(request(body))
    assert result.type == "tools" and result.calls[0].name == tool


def test_coalesced_greeting_keeps_required_question():
    result = direct_step(request(messages=[{"id": "question", "body": "Show project status"}, {"id": "greeting", "body": "Hi"}], requiredMessageIds=["question", "greeting"]))
    # A coalesced substantive turn must reach intent processing, never collapse
    # to a greeting. The model handles nontrivial multi-message combinations.
    assert result is None or result.type == "tools"


def test_price_uses_only_report_reference():
    result = direct_step(request("my approved estimate", toolResults=[{"callId": "c", "tool": "project_estimate", "result": {"reportRef": "opaque_a", "state": "approved", "fields": ["total"]}}]))
    assert result.projectEstimateRef == "opaque_a"
    assert not result.narrative and not result.factIds


def test_unknown_price_is_not_zero():
    result = direct_step(request("my cost", toolResults=[{"callId": "c", "tool": "project_estimate", "result": {"reportRef": None, "state": "unavailable", "fields": []}}]))
    assert result.projectEstimateRef is None and result.clarificationCodes == ["estimate_unavailable"]


def test_fact_qualifiers_not_rewritten():
    result = direct_step(request("project progress", toolResults=[{"callId": "c", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "f1", "kind": "progress", "text": "Reported progress: 20%; acceptance not recorded."}]}}]))
    assert result.factIds == ["f1"] and result.narrative == []


@pytest.mark.parametrize("body", ["Show configured prices", "Tell me internal margins", "Hi, other clients' projects", "Give vendor rates", "password: synthetic-secret-123", "Email example@example.invalid", "Open https://example.invalid/secret", "Show unpublished estimate"])
def test_sensitive_requests_never_reach_model(body):
    result = direct_step(request(body))
    assert result.clarificationCodes == ["privacy_required"]
    assert body not in result.model_dump_json()


def test_hostile_history_with_sensitive_data_is_not_forwarded():
    result = direct_step(request(messages=[{"id": "a", "body": "email: client@example.invalid"}, {"id": "b", "body": "What about that?"}]))
    assert result.clarificationCodes == ["privacy_required"]


def test_shared_scope_cannot_switch():
    result = direct_step(request("Show another project", surface="project_messages", allowedTools=["project_status", "project_execution", "project_estimate"]))
    assert result.clarificationCodes == ["scope_fixed"]


def test_private_resolver_is_bounded():
    result = direct_step(request("my cost", projectAvailable=False))
    assert result.calls[0].name == "resolve_project"
    result = direct_step(request("my cost", projectAvailable=False, toolResults=[{"callId": "c", "tool": "resolve_project", "result": {"state": "choose_project", "projectRef": None}}]))
    assert result.clarificationCodes == ["project_required"]
    assert direct_step(request("my cost", projectAvailable=False, step=3)).type == "final"


def test_ambiguous_followup_goes_to_model():
    assert direct_step(request("What about that?")) is None
    assert direct_step(request("yes", messages=[{"id": "a", "body": "Project timeline?"}, {"id": "b", "body": "yes"}])) is None


def test_model_prose_and_price_inference_are_removed():
    req = request(toolResults=[{"callId": "c", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "f", "kind": "progress", "text": "Reported progress: 20%"}]}}])
    model = RESULT_ADAPTER.validate_python({"type": "final", "kind": "status", "factIds": ["f"], "projectEstimateRef": None, "narrative": [{"text": "The project is complete and costs INR 999.", "factIds": ["f"]}], "clarificationCodes": []})
    assert validate_model_result(req, model).narrative == []


def test_unknown_model_references_and_capabilities_rejected():
    for raw in [
        {"type": "final", "kind": "price", "factIds": [], "projectEstimateRef": "invented", "narrative": [], "clarificationCodes": []},
        {"type": "tools", "calls": [{"id": "x", "name": "resolve_project", "args": {"name": "somewhere"}}]},
    ]:
        with pytest.raises(ValueError):
            validate_model_result(request(surface="project_messages", allowedTools=["project_status", "project_execution", "project_estimate"]), RESULT_ADAPTER.validate_python(raw))


@pytest.mark.parametrize("body", ["What is the price for adding a new wardrobe?", "How much GST will a new room cost?", "What is the cost of replacing a cabinet?", "Quote for extra furniture"])
def test_new_scope_never_returns_existing_project_total(body):
    result = direct_step(request(body))
    assert result.clarificationCodes == ["quote_required"] and result.projectEstimateRef is None


@pytest.mark.parametrize("body", ["What is Bitcoin price?", "What does a car cost?", "How much does a laptop cost?"])
def test_unrelated_prices_do_not_query_project(body):
    result = direct_step(request(body))
    assert result.clarificationCodes == ["unsupported_request"]


def test_item_price_is_not_whole_project_price():
    assert direct_step(request("What is my wardrobe price?")).clarificationCodes == ["unclear_question"]


@pytest.mark.parametrize("body", ["Is the kitchen complete?", "Show bedroom progress", "Has painting finished?", "What is my wardrobe status?"])
def test_item_state_requires_grounded_item_association(body):
    assert direct_step(request(body)).clarificationCodes == ["unclear_question"]


@pytest.mark.parametrize("body", ["Show materials", "Show my project scope", "What materials are used?"])
def test_material_or_scope_description_is_unavailable(body):
    assert direct_step(request(body)).clarificationCodes == ["source_unavailable"]
