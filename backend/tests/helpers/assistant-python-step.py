"""Model-free bridge for the opt-in cross-language contract test."""
import sys

from lisno_assistant.contracts import StepRequest, StepResponse, Usage
from lisno_assistant.planner import direct_step

request = StepRequest.model_validate_json(sys.stdin.buffer.read(32_769))
result = direct_step(request)
if result is None:
    raise RuntimeError("This fixture requires a model and is not a deterministic bridge case")
print(StepResponse(protocolVersion=1, requestId=request.requestId, step=request.step,
                   route="deterministic", usage=Usage(inputTokens=0, outputTokens=0), result=result).model_dump_json())
