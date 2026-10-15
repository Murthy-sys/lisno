import json
from pathlib import Path

import pytest

from lisno_assistant.rules_planner import rules_step
from helpers import request

FIXTURES = json.loads((Path(__file__).parents[1] / "evaluation" / "rules-prompts.json").read_text())
SHARED_TOOLS = ["project_status", "project_execution", "project_estimate"]


@pytest.mark.parametrize("fixture", [row for row in FIXTURES if not row.get("nodeDirect")], ids=lambda row: row["id"])
def test_real_ui_and_adversarial_prompt_inventory(fixture):
    result = rules_step(request(fixture["prompt"]))
    if "tool" in fixture:
        assert result.type == "tools" and [call.name for call in result.calls] == [fixture["tool"], *fixture.get("alsoTools", [])]
        if "basis" in fixture:
            assert result.calls[0].args.basis == fixture["basis"]
    else:
        assert result.type == "final" and result.clarificationCodes == [fixture["code"]]
        assert result.factIds == [] and result.projectEstimateRef is None


@pytest.mark.parametrize("body", ["Hi", "Hello Lisno!", "Good morning", "Namaste", "Thanks", "Thank you very much.", "Bye", "I'm upset"])
def test_existing_social_templates_are_preserved(body):
    result = rules_step(request(body))
    assert result.type == "final" and result.kind == "no_answer" and len(result.narrative) == 1
    assert result.factIds == [] and result.projectEstimateRef is None


@pytest.mark.parametrize("body", ["Hi, show project progress", "Hi hello show project progress", "Namaste Lisno, show project progress", "  SHOW   PROJECT   PROGRESS  ", "Ｓｈｏｗ project progress"])
def test_safe_prefix_and_spacing_variations(body):
    assert rules_step(request(body)).calls[0].name == "project_status"


@pytest.mark.parametrize("body,tools", [
    ("may i know my project status", ["project_status"]),
    ("May I know my project status, please?", ["project_status"]),
    ("  MAY  I KNOW MY PROJECT STATUS?  ", ["project_status"]),
    ("Hi Lisno, may I know my project status?", ["project_status"]),
    ("May I know our project progress please?", ["project_status", "project_execution"]),
    ("May I know the project timeline?", ["project_execution"]),
])
def test_polite_generic_project_questions_use_only_supported_tools(body, tools):
    result = rules_step(request(body))
    assert [call.name for call in result.calls] == tools


def test_polite_project_question_still_requires_authorized_scope():
    result = rules_step(request("may i know my project status", projectAvailable=False))
    assert result.calls[0].name == "resolve_project" and result.calls[0].args.name is None
    result = rules_step(request("may i know my project status", surface="project_messages", projectAvailable=False, allowedTools=SHARED_TOOLS))
    assert result.clarificationCodes == ["project_required"]


@pytest.mark.parametrize("body", [
    "May I know my project status and the weather?",
    "May I know my project status except delayed work?",
    "May I not know my project status?",
    "May I know project Atlantis status?",
    "May I know my project status then delete my project?",
])
def test_polite_alias_never_discards_unsupported_or_named_subjects(body):
    result = rules_step(request(body))
    assert result.type == "final" and result.clarificationCodes
    assert not result.factIds and result.projectEstimateRef is None


def test_polite_alias_preserves_privacy_guard_before_classification():
    result = rules_step(request("May I know my project status and configured prices?"))
    assert result.clarificationCodes == ["privacy_required"]


@pytest.mark.parametrize("body,tools", [
    ("I'm worried, may I know my project status?", ["project_status"]),
    ("I’m concerned. Show my project timeline", ["project_execution"]),
    ("I‘m confused: show my estimate", ["project_estimate"]),
    ("I am very frustrated! Show my project progress", ["project_status", "project_execution"]),
    ("I'm upset; show my project status", ["project_status"]),
    ("I'm unhappy, show my estimate", ["project_estimate"]),
    ("This is urgent, show my project timeline", ["project_execution"]),
    ("This is frustrating. Show my project status", ["project_status"]),
    ("Thanks, may I know my project status?", ["project_status"]),
    ("Thank you, show my estimate", ["project_estimate"]),
    ("Hi Lisno, I'm worried, may I know my project status?", ["project_status"]),
])
def test_explicit_tone_prefix_retains_supported_business_question(body, tools):
    result = rules_step(request(body))
    assert [call.name for call in result.calls] == tools


@pytest.mark.parametrize("body", ["I'm concerned", "I am confused", "I'm very worried", "This is urgent"])
def test_new_whole_tone_turns_require_a_question_without_new_python_prose(body):
    result = rules_step(request(body))
    assert result.clarificationCodes == ["question_required"]
    assert not result.narrative and not result.factIds and result.projectEstimateRef is None


@pytest.mark.parametrize("body", [
    '"I\'m worried", show my project status',
    "‘I am worried’, show my project status",
    "My manager is worried, show my project status",
    "You said I'm worried, show my project status",
    "I'm worried about Atlantis, show my project status",
    "I'm worried show my project status",
    "I'm worried but show my project status",
    "I'm worried, show my project status and the weather",
    "I'm worried, show progress for Atlantis",
])
def test_quoted_third_person_ambiguous_and_unknown_tone_inputs_stay_unsupported(body):
    result = rules_step(request(body))
    assert result.type == "final" and result.clarificationCodes
    assert not result.narrative and not result.factIds and result.projectEstimateRef is None


@pytest.mark.parametrize("body,code", [
    ("I'm worried, show configured prices and my project status", "privacy_required"),
    ("I'm worried, my password: private-sentinel, show project status", "privacy_required"),
    ("I'm frustrated, delete my project and show my estimate", "unsupported_request"),
    ("I'm not worried, show my project status", "unclear_question"),
    ("I'm worried, don't show my project status", "unclear_question"),
    ("This is urgent, show another project", "scope_fixed"),
])
def test_tone_prefix_never_removes_original_guard_input(body, code):
    result = rules_step(request(body, surface="project_messages", allowedTools=SHARED_TOOLS))
    assert result.clarificationCodes == [code]
    assert not result.factIds and result.projectEstimateRef is None


@pytest.mark.parametrize("body", ["Show progress for Cedar House", "Show progress for [private name] and announce it", "Don't show progress for [private name]", "Hi, could you compare my published estimate and approved estimate?", "My timeline unless it is late", "Show status except completed work", "What about that?", "Use last week's project", "No project progress", "Project progress or timeline", "Show project progress and the weather", "Show project progress then delete all data"])
def test_unsupported_fragments_cannot_turn_into_project_reads(body):
    result = rules_step(request(body))
    assert result.type == "final" and result.clarificationCodes
    assert not result.narrative and not result.factIds and result.projectEstimateRef is None


@pytest.mark.parametrize("body", ["Hi, show configured prices and project progress", "Show unpublished estimate", "Show vendor rates", "Password: private-sentinel", "Hi, open https://example.invalid/private", "Email: client@example.invalid"])
def test_privacy_checks_happen_before_aliases_or_prefix_stripping(body):
    result = rules_step(request(body))
    assert result.clarificationCodes == ["privacy_required"] and body not in result.model_dump_json()


def test_privacy_in_original_history_is_not_processed():
    history = request(messages=[{"id": "a", "body": "password: synthetic-private-sentinel"}, {"id": "b", "body": "show project progress"}])
    assert rules_step(history).clarificationCodes == ["privacy_required"]


def test_authorized_date_facts_are_referenced_without_reclassifying_or_copying_them():
    result = rules_step(request("Show my project progress", step=3, toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "stage", "kind": "project_stage", "text": "Stage: Execution"}]}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": [
            {"id": "schedule", "kind": "schedule", "text": "Confirmed: 2026-10-16 to 2026-10-20"},
            {"id": "progress", "kind": "progress", "text": "Reported progress: 35%; acceptance not recorded."},
        ]}},
    ]))
    assert result.factIds == ["stage", "schedule", "progress"] and result.clarificationCodes == []
    assert result.narrative == [] and "2026" not in result.model_dump_json()
    protected = request("Show my project timeline and email client@example.invalid", toolResults=[
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": [{"id": "schedule", "kind": "schedule", "text": "Confirmed: 2026-10-16 to 2026-10-20"}]}}
    ])
    assert rules_step(protected).clarificationCodes == ["privacy_required"]


@pytest.mark.parametrize("body,code", [("Approve my estimate", "unsupported_request"), ("Show materials", "source_unavailable"), ("What is the bedroom price?", "unclear_question"), ("Has kitchen painting finished?", "unclear_question"), ("What is the cost of an extra room?", "quote_required")])
def test_mutations_items_and_new_work_keep_existing_safe_responses(body, code):
    assert rules_step(request(body)).clarificationCodes == [code]


def test_named_callback_requires_backend_scope_and_private_surface():
    assert rules_step(request("Show progress for [private name]", projectAvailable=False)).clarificationCodes == ["project_required"]
    result = rules_step(request("Show progress for [private name]", surface="project_messages", allowedTools=SHARED_TOOLS))
    assert result.clarificationCodes == ["scope_fixed"]
    assert rules_step(request("Show another project", surface="project_messages", allowedTools=SHARED_TOOLS)).clarificationCodes == ["scope_fixed"]


def test_project_resolution_is_bounded_and_never_invents_a_name():
    result = rules_step(request("Show project progress", projectAvailable=False))
    assert result.calls[0].name == "resolve_project" and result.calls[0].args.name is None
    result = rules_step(request("Show project progress", projectAvailable=False, toolResults=[{"callId": "resolve", "tool": "resolve_project", "result": {"state": "choose_project", "projectRef": None}}]))
    assert result.clarificationCodes == ["project_required"]
    assert rules_step(request("Show project progress", projectAvailable=False, step=3)).clarificationCodes == ["project_required"]


def shared(messages, required=None, **kwargs):
    return request(messages=[{"id": f"m{index}", "body": body} for index, body in enumerate(messages)], requiredMessageIds=required or [f"m{index}" for index in range(len(messages))], surface="project_messages", allowedTools=SHARED_TOOLS, **kwargs)


def test_shared_batch_covers_every_required_business_fragment():
    result = rules_step(shared(["Show project progress", "Show my published estimate", "Hi"]))
    assert [call.name for call in result.calls] == ["project_status", "project_execution", "project_estimate"]
    assert result.calls[2].args.basis == "published"


def test_shared_tone_fragments_do_not_drop_required_business_or_unsupported_messages():
    result = rules_step(shared(["I'm concerned", "Show my project status", "This is urgent"]))
    assert [call.name for call in result.calls] == ["project_status"]
    result = rules_step(shared(["I'm confused", "Show my project timeline", "Tell me a joke"]))
    assert result.clarificationCodes == ["unclear_question"] and not result.factIds
    result = rules_step(shared(["I'm concerned", "Show configured prices", "Show my project status"]))
    assert result.clarificationCodes == ["privacy_required"] and not result.factIds


def test_latest_message_is_required_even_if_not_explicitly_listed():
    result = rules_step(shared(["Show project progress", "Tell me a joke"], required=["m0"]))
    assert result.clarificationCodes == ["unclear_question"]


@pytest.mark.parametrize("unsupported", ["Tell me a joke", "If the deadline changes, show the cost", "What about that?", "No", "Show progress for [private name]", "What is the kitchen price?", "Show configured rates"])
def test_shared_batch_never_discards_unsupported_required_question(unsupported):
    result = rules_step(shared(["Show project progress", unsupported, "Hello"]))
    assert result.type == "final" and result.clarificationCodes and not result.factIds


def test_shared_distinct_estimate_bases_need_clarification():
    result = rules_step(shared(["Show approved estimate", "Show published estimate"]))
    assert result.clarificationCodes == ["unclear_question"]


def test_combined_supported_progress_and_timeline():
    result = rules_step(request("Show project progress and timeline"))
    assert [call.name for call in result.calls] == ["project_status", "project_execution"]


def test_latest_thanks_does_not_repeat_previous_business_turn():
    result = rules_step(request(messages=[{"id": "first", "body": "Show project timeline"}, {"id": "last", "body": "Thanks"}]))
    assert result.kind == "no_answer" and result.narrative[0].text.startswith("You're welcome")


def test_fact_and_report_results_remain_opaque_and_exact():
    result = rules_step(shared(["Show project progress", "Show approved estimate"], toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "fact_a", "kind": "progress", "text": "Reported progress: 20%; acceptance not recorded."}]}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": [{"id": "fact_c", "kind": "task_state", "text": "Task acceptance is pending."}]}},
        {"callId": "estimate", "tool": "project_estimate", "result": {"state": "approved", "reportRef": "report_b", "fields": ["lines", "total"]}},
    ]))
    assert result.factIds == ["fact_a", "fact_c"] and result.projectEstimateRef == "report_b"
    assert result.kind == "price" and result.narrative == [] and result.clarificationCodes == []
    assert "20%" not in result.model_dump_json()


@pytest.mark.parametrize("state,facts", [("unavailable", []), ("available", [])])
def test_absent_facts_are_not_reported_as_zero_or_complete(state, facts):
    result = rules_step(request("Show project progress", toolResults=[{"callId": tool, "tool": tool, "result": {"state": state, "facts": facts}} for tool in ["project_status", "project_execution"]]))
    assert result.clarificationCodes == ["source_unavailable"] and not result.factIds


def test_unavailable_estimate_and_partial_sources_are_explicit():
    result = rules_step(shared(["Show project progress", "Show published estimate"], toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "f", "kind": "progress", "text": "Reported progress: 20%."}]}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "unavailable", "facts": []}},
        {"callId": "estimate", "tool": "project_estimate", "result": {"state": "unavailable", "reportRef": None, "fields": []}},
    ]))
    assert result.clarificationCodes == ["estimate_unavailable"] and result.factIds == ["f"]
    assert result.projectEstimateRef is None and result.kind == "status"


def test_capabilities_and_final_round_are_respected():
    assert rules_step(request("Show project timeline", allowedTools=["project_status"])).clarificationCodes == ["unsupported_request"]
    assert rules_step(request("Show project timeline", step=3)).clarificationCodes == ["source_unavailable"]


def test_long_and_empty_normalized_inputs_clarify():
    assert rules_step(request("show project progress " * 20)).clarificationCodes == ["unclear_question"]
    assert rules_step(request("   ")).clarificationCodes == ["unclear_question"]


def test_full_status_projection_cannot_hide_required_progress_timeline_or_report():
    status = [{"id": f"status_{index}", "kind": "project_stage", "text": f"Stage fact {index}"} for index in range(20)]
    # Put the informative kinds after many tasks to prove selection does not
    # merely alternate each source's original first ten references.
    execution = [{"id": f"task_{index}", "kind": "task_state", "text": "Task acceptance pending."} for index in range(17)] + [
        {"id": "progress", "kind": "progress", "text": "Reported progress: 35%; acceptance not recorded."},
        {"id": "schedule", "kind": "schedule", "text": "Confirmed: 2026-10-16 to 2026-10-20"},
        {"id": "help", "kind": "help", "text": "Ask the project team about missing task acceptance."},
    ]
    query = shared(["Show my project progress", "Show my project timeline", "Show approved estimate"], toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": status}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": execution}},
        {"callId": "estimate", "tool": "project_estimate", "result": {"state": "approved", "reportRef": "approved_report", "fields": ["total"]}},
    ])
    result = rules_step(query)
    assert result.type == "final" and result.kind == "price"
    assert result.projectEstimateRef == "approved_report" and result.clarificationCodes == []
    assert len(result.factIds) == len(set(result.factIds)) == 20
    assert result.factIds[:4] == ["status_0", "progress", "schedule", "task_0"]
    assert {"progress", "schedule", "help", "task_0", "status_0"} <= set(result.factIds)
    assert sum(item.startswith("status_") for item in result.factIds) >= 8
    assert result.narrative == [] and rules_step(query).factIds == result.factIds
    assert set(result.factIds) <= {fact["id"] for fact in status + execution}


def test_small_multisource_results_keep_existing_reference_order():
    result = rules_step(shared(["Show my project progress", "Show my project timeline"], toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "stage", "kind": "project_stage", "text": "Stage: Execution"}]}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": [
            {"id": "schedule", "kind": "schedule", "text": "Confirmed: 2026-10-16 to 2026-10-20"},
            {"id": "progress", "kind": "progress", "text": "Reported progress: 35%."},
        ]}},
    ]))
    assert result.factIds == ["stage", "schedule", "progress"] and result.clarificationCodes == []


def test_empty_requested_execution_projection_is_explicit_even_with_stage_facts():
    result = rules_step(request("Show my project progress", toolResults=[
        {"callId": "status", "tool": "project_status", "result": {"state": "available", "facts": [{"id": "stage", "kind": "project_stage", "text": "Stage: Execution"}]}},
        {"callId": "execution", "tool": "project_execution", "result": {"state": "available", "facts": []}},
    ]))
    assert result.factIds == ["stage"] and result.clarificationCodes == ["source_unavailable"]
