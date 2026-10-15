"""Independent-host synthetic evaluation. No cloud judge, DB or real clients."""
import argparse
import asyncio
import json
import math
import os
import platform
import statistics
import time
from pathlib import Path

import httpx

from corpus import Case, cases
from lisno_assistant.config import validate_model_url
from lisno_assistant.contracts import StepResponse


def tool_result(call, case: Case):
    name = call.name
    if name == "resolve_project":
        body = {"state": "resolved", "projectRef": "project_" + case.project}
    elif name == "project_estimate":
        body = {"state": "unavailable" if case.missing else "approved", "reportRef": None if case.missing else "report_" + case.project, "fields": [] if case.missing else ["lines", "subtotal", "gst", "total"]}
    else:
        label = "Recorded progress: 20%; acceptance not recorded." if case.project == "a" else "Recorded progress: 65%; acceptance not recorded."
        body = {"state": "unavailable" if case.missing else "available", "facts": [] if case.missing else [{"id": "fact_" + case.project + "_" + name, "kind": "progress" if name == "project_status" else "schedule" if name == "project_execution" else "help", "text": label if name == "project_status" else "No confirmed completion date is recorded."}]}
    return {"callId": call.id, "tool": name, "result": body}


async def run_case(client: httpx.AsyncClient, case: Case, serial: int):
    messages = [{"id": f"m{i}", "body": body} for i, body in enumerate((*case.history, case.prompt))]
    payload = {"protocolVersion": 1, "requestId": f"eval_{serial}", "step": 0, "surface": case.surface, "remainingMs": 90000, "projectAvailable": True, "messages": messages, "requiredMessageIds": [messages[-1]["id"]], "allowedTools": ["project_status", "project_execution", "project_estimate"] + (["resolve_project", "client_profile"] if case.surface == "private" else []), "toolResults": []}
    started, seen, routes, final, failure, critical = time.monotonic(), [], [], None, None, False
    usage = {"knownInputTokens": 0, "knownOutputTokens": 0, "unknownUsageSteps": 0, "modelCalls": 0}
    try:
        for step in range(4):
            payload["step"] = step
            payload["remainingMs"] = max(1, int(90000 - (time.monotonic() - started) * 1000))
            response = await client.post("/internal/v1/assistant/step", json=payload)
            if response.status_code != 200:
                failure = "service_unavailable"
                break
            if len(response.content) > 32768:
                raise ValueError()
            parsed = StepResponse.model_validate_json(response.content)
            if parsed.requestId != payload["requestId"] or parsed.step != step:
                raise ValueError()
            routes.append(parsed.route)
            usage["modelCalls"] += int(parsed.route == "model")
            if parsed.usage is None:
                usage["unknownUsageSteps"] += 1
            else:
                usage["knownInputTokens"] += parsed.usage.inputTokens
                usage["knownOutputTokens"] += parsed.usage.outputTokens
            if parsed.result.type == "final":
                final = parsed.result
                break
            for call in parsed.result.calls:
                if call.name not in payload["allowedTools"] or len(seen) >= 6:
                    raise ValueError()
                seen.append(call.name)
                payload["toolResults"].append(tool_result(call, case))
        if final is None:
            failure = failure or "no_final"
        else:
            known_facts = {fact["id"] for result in payload["toolResults"] for fact in result["result"].get("facts", [])}
            critical = bool(set(final.factIds) - known_facts) or bool(final.projectEstimateRef and final.projectEstimateRef != "report_" + case.project)
            # No raw amounts or inferred price prose in a project-price answer.
            critical |= bool(final.projectEstimateRef and final.narrative)
            if case.expected_codes:
                correct = bool(set(final.clarificationCodes) & set(case.expected_codes)) and not final.factIds and final.projectEstimateRef is None
            elif case.social:
                correct = bool(final.narrative) and not seen and not final.factIds and final.projectEstimateRef is None
            else:
                expected_facts = {"fact_" + case.project + "_" + tool for tool in case.expected_tools if tool != "project_estimate"}
                expected_report = "report_" + case.project if "project_estimate" in case.expected_tools else None
                correct = set(case.expected_tools) == set(seen) and set(final.factIds) == expected_facts and final.projectEstimateRef == expected_report and not final.clarificationCodes
            if not correct:
                failure = "expectation_mismatch"
            if case.id.startswith("privacy") and (seen or final.factIds or final.projectEstimateRef or final.narrative):
                critical = True
    except (httpx.HTTPError, ValueError):
        failure = "invalid_or_failed_response"
        critical = True
    return {"id": case.id, "surface": case.surface, "ok": failure is None and not critical, "failure": failure, "critical": critical, "abstained": bool(final and not final.factIds and not final.projectEstimateRef and not case.social), "elapsedMs": round((time.monotonic() - started) * 1000, 2), "route": "model" if "model" in routes else "deterministic", "steps": len(routes), "usage": usage}


def aggregate(rows):
    values = sorted(row["elapsedMs"] for row in rows)
    return {"count": len(rows), "p50Ms": statistics.median(values), "p95Ms": values[math.ceil(len(values) * 0.95) - 1], "failures": sum(not row["ok"] for row in rows), "usage": {key: sum(row.get("usage", {}).get(key, 0) for row in rows) for key in ("knownInputTokens", "knownOutputTokens", "unknownUsageSteps", "modelCalls")}}


async def evaluate(args):
    token = os.environ.get("ASSISTANT_SERVICE_TOKEN", "")
    if not token:
        raise SystemExit("Set the server-only ASSISTANT_SERVICE_TOKEN without putting it on the command line")
    all_cases = cases()
    async with httpx.AsyncClient(base_url=validate_model_url(args.url), headers={"Authorization": "Bearer " + token}, trust_env=False, follow_redirects=False, timeout=25) as client:
        quality = [await run_case(client, case, i) for i, case in enumerate(all_cases)]
        benchmarks = {}
        selected = {"direct": Case("bench_direct", "private", "Hi", social=True), "model": Case("bench_model", "private", "How are things going?", ("project_status",)), "complex": Case("bench_complex", "project_messages", "Could you show project progress and the published estimate together?", ("project_status", "project_estimate"))}
        for name, case in selected.items():
            cold = await run_case(client, case, 1000)
            for concurrency in (1, 2):
                rows = []
                for offset in range(0, args.samples, concurrency):
                    batch = await asyncio.gather(*(run_case(client, case, 2000 + offset + index) for index in range(min(concurrency, args.samples - offset))))
                    rows.extend(batch)
                benchmarks[f"{name}_c{concurrency}"] = {"firstObservedSampleMs": cold["elapsedMs"], "warm": aggregate(rows), "observedRoutes": sorted({row["route"] for row in rows})}
    cold_summary = {"verified": False, "reason": "Provide at least 30 separately collected cold model samples after independently controlled unload/restarts"}
    if args.cold_samples_file:
        cold_input = json.loads(Path(args.cold_samples_file).read_text())
        values = cold_input.get("samplesMs", [])
        if cold_input.get("modelDigest") != args.model_digest or len(values) < 30 or any(type(value) not in (int, float) or not math.isfinite(value) or value <= 0 for value in values):
            raise SystemExit("Invalid cold sample file or artifact mismatch")
        cold_summary = {"verified": True, "source": "Operator-provided independent-host cold samples", **aggregate([{"elapsedMs": value, "ok": True} for value in values])}
    score = sum(row["ok"] for row in quality) / len(quality)
    report = {"modelDigest": args.model_digest, "runtimeImage": args.runtime_image, "hardware": args.hardware, "quantization": args.quantization, "contextTokens": 16384, "maxOutputTokens": 2048, "quality": {"cases": len(quality), "correctDecisionRate": score, "abstentions": sum(row["abstained"] for row in quality), "criticalFailures": sum(row["critical"] for row in quality), "passedTarget": score >= 0.95 and not any(row["critical"] for row in quality)}, "cases": quality, "benchmarks": benchmarks, "coldModel": cold_summary, "sharedAutomaticWaitMs": 120000, "sharedWaitMeasured": False, "scope": "Internal Python service with synthetic authorized tool fixtures; public endpoint authorization/finance/races and real shared queue wait require separate backend verification"}
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["quality"]))
    return 0 if report["quality"]["passedTarget"] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-independent-host", action="store_true", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--model-digest", required=True)
    parser.add_argument("--runtime-image", required=True)
    parser.add_argument("--hardware", required=True)
    parser.add_argument("--quantization", required=True)
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--cold-samples-file")
    parser.add_argument("--output", default="evaluation-results.json")
    args = parser.parse_args()
    if platform.system() == "Darwin" or args.samples < 30:
        parser.error("Run on the independently authorized Linux host with at least 30 samples per class")
    raise SystemExit(asyncio.run(evaluate(args)))


if __name__ == "__main__":
    main()
