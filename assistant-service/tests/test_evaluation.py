import importlib.util
import json
from pathlib import Path
import sys
import asyncio
import httpx

from lisno_assistant.contracts import StepRequest, StepResponse, Usage
from lisno_assistant.planner import direct_step

EVALUATION = Path(__file__).parents[1] / "evaluation"


def test_actual_direct_fixtures_do_not_drift():
    for fixture in json.loads((EVALUATION / "direct-fixtures.json").read_text()):
        request = StepRequest.model_validate(fixture["request"])
        actual = StepResponse(protocolVersion=1, requestId=request.requestId, step=request.step, route="deterministic", usage=Usage(inputTokens=0, outputTokens=0), result=direct_step(request))
        assert actual.model_dump() == fixture["response"], fixture["name"]


def test_corpus_has_both_surfaces_and_asymmetric_contexts():
    spec = importlib.util.spec_from_file_location("assistant_eval_corpus", EVALUATION / "corpus.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    cases = module.cases()
    assert len(cases) >= 100 and len({case.id for case in cases}) == len(cases)
    assert {case.surface for case in cases} == {"private", "project_messages"}
    assert {case.project for case in cases} == {"a", "b"}
    assert any(case.history for case in cases) and any(case.missing for case in cases)
    assert any(case.expected_codes == ("quote_required",) for case in cases)


def test_evaluation_requires_exact_evidence_and_preserves_unknown_usage(monkeypatch):
    monkeypatch.syspath_prepend(str(EVALUATION))
    spec = importlib.util.spec_from_file_location("assistant_eval_run", EVALUATION / "run.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    async def run(extra_tool=False, wrong_fact=False):
        def handler(http_request):
            payload = json.loads(http_request.content)
            if payload["step"] == 0:
                result = {"type": "tools", "calls": [{"id": "status", "name": "project_status", "args": {}}] + ([{"id": "execution", "name": "project_execution", "args": {}}] if extra_tool else [])}
                usage = None
            else:
                result = {"type": "final", "kind": "status", "factIds": ["fact_b_project_status" if wrong_fact else "fact_a_project_status"], "projectEstimateRef": None, "narrative": [], "clarificationCodes": []}
                usage = {"inputTokens": 10, "outputTokens": 5}
            return httpx.Response(200, json={"protocolVersion": 1, "requestId": payload["requestId"], "step": payload["step"], "route": "model", "usage": usage, "result": result})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://test") as client:
            return await module.run_case(client, module.Case("synthetic", "private", "Show project status", ("project_status",)), 1)

    correct = asyncio.run(run())
    assert correct["ok"]
    assert correct["usage"] == {"knownInputTokens": 10, "knownOutputTokens": 5, "unknownUsageSteps": 1, "modelCalls": 2}
    assert not asyncio.run(run(extra_tool=True))["ok"]
    wrong = asyncio.run(run(wrong_fact=True))
    assert not wrong["ok"] and wrong["critical"]
