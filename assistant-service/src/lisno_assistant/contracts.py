"""Mirrors backend/src/contracts/assistant-step.ts; shared fixtures guard drift."""
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, TypeAdapter, field_validator, model_validator

Opaque = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
ToolName = Literal["resolve_project", "client_profile", "project_status", "project_execution", "project_estimate"]
Clarification = Literal["project_required", "question_required", "estimate_unavailable", "unsupported_request", "scope_fixed", "privacy_required", "unclear_question", "source_unavailable", "quote_required"]


def json_integer(value):
    # JavaScript JSON has one number type: 1.0 is an integer, true is not.
    if type(value) is float and value.is_integer():
        return int(value)
    return value


JsonInteger = Annotated[int, BeforeValidator(json_integer)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    @field_validator("protocolVersion", mode="before", check_fields=False)
    @classmethod
    def strict_version(cls, value):
        if type(value) not in (int, float) or value != 1:
            raise ValueError("Invalid protocol version")
        return 1

    @model_validator(mode="after")
    def javascript_string_lengths(self):
        for name, field in type(self).model_fields.items():
            value = getattr(self, name)
            if not isinstance(value, str):
                continue
            maximum = next((item.max_length for item in field.metadata if getattr(item, "max_length", None) is not None), None)
            if maximum is not None and len(value.encode("utf-16-le", errors="surrogatepass")) // 2 > maximum:
                raise ValueError("String exceeds contract limit")
        return self


class EmptyArgs(StrictModel):
    pass


class ResolveArgs(StrictModel):
    name: Annotated[str, Field(min_length=1, max_length=120)] | None


class EstimateArgs(StrictModel):
    basis: Literal["current", "approved", "published"]


class ResolveCall(StrictModel):
    id: Opaque
    name: Literal["resolve_project"]
    args: ResolveArgs


class ProfileCall(StrictModel):
    id: Opaque
    name: Literal["client_profile"]
    args: EmptyArgs


class StatusCall(StrictModel):
    id: Opaque
    name: Literal["project_status"]
    args: EmptyArgs


class ExecutionCall(StrictModel):
    id: Opaque
    name: Literal["project_execution"]
    args: EmptyArgs


class EstimateCall(StrictModel):
    id: Opaque
    name: Literal["project_estimate"]
    args: EstimateArgs


ToolCall = Annotated[ResolveCall | ProfileCall | StatusCall | ExecutionCall | EstimateCall, Field(discriminator="name")]


class SafeFact(StrictModel):
    id: Opaque
    kind: Literal["project_stage", "progress", "task_state", "schedule", "help"]
    text: Annotated[str, Field(min_length=1, max_length=500)]


class SafeFacts(StrictModel):
    state: Literal["available", "unavailable"]
    facts: Annotated[list[SafeFact], Field(max_length=20)]


class ResolveResultBody(StrictModel):
    state: Literal["resolved", "choose_project", "no_projects", "not_found", "clarification_required"]
    projectRef: Opaque | None


class EstimateResultBody(StrictModel):
    reportRef: Opaque | None
    state: Literal["published", "approved", "unavailable"]
    fields: Annotated[list[Literal["lines", "subtotal", "gst", "total"]], Field(max_length=4)]


class ResolveResult(StrictModel):
    callId: Opaque
    tool: Literal["resolve_project"]
    result: ResolveResultBody


class ProfileResult(StrictModel):
    callId: Opaque
    tool: Literal["client_profile"]
    result: SafeFacts


class StatusResult(StrictModel):
    callId: Opaque
    tool: Literal["project_status"]
    result: SafeFacts


class ExecutionResult(StrictModel):
    callId: Opaque
    tool: Literal["project_execution"]
    result: SafeFacts


class EstimateResult(StrictModel):
    callId: Opaque
    tool: Literal["project_estimate"]
    result: EstimateResultBody


ToolResult = Annotated[ResolveResult | ProfileResult | StatusResult | ExecutionResult | EstimateResult, Field(discriminator="tool")]


class Message(StrictModel):
    id: Opaque
    body: Annotated[str, Field(min_length=1, max_length=2000)]
    hasAttachments: bool | None = None


class StepRequest(StrictModel):
    protocolVersion: Literal[1]
    requestId: Opaque
    step: Annotated[JsonInteger, Field(ge=0, le=3)]
    surface: Literal["private", "project_messages"]
    remainingMs: Annotated[JsonInteger, Field(ge=1, le=90_000)]
    projectAvailable: bool
    messages: Annotated[list[Message], Field(min_length=1, max_length=16)]
    requiredMessageIds: Annotated[list[Opaque], Field(max_length=16)] | None = None
    allowedTools: Annotated[list[ToolName], Field(max_length=5)]
    toolResults: Annotated[list[ToolResult], Field(max_length=6)]

    @model_validator(mode="after")
    def references(self):
        ids = {message.id for message in self.messages}
        if len(ids) != len(self.messages) or any(item not in ids for item in self.requiredMessageIds or []):
            raise ValueError("Invalid message references")
        if len(set(self.allowedTools)) != len(self.allowedTools) or (self.surface == "project_messages" and set(self.allowedTools) & {"resolve_project", "client_profile"}):
            raise ValueError("Invalid surface capabilities")
        if len({item.callId for item in self.toolResults}) != len(self.toolResults) or any(item.tool not in self.allowedTools for item in self.toolResults):
            raise ValueError("Invalid tool result references")
        # Optional in TypeScript means absent, not JSON null.
        if "requiredMessageIds" in self.model_fields_set and self.requiredMessageIds is None:
            raise ValueError("Invalid message references")
        if any("hasAttachments" in item.model_fields_set and item.hasAttachments is None for item in self.messages):
            raise ValueError("Invalid message attachments")
        return self


class ToolsStep(StrictModel):
    type: Literal["tools"]
    calls: Annotated[list[ToolCall], Field(min_length=1, max_length=6)]


class Paragraph(StrictModel):
    text: Annotated[str, Field(min_length=1, max_length=1000)]
    factIds: Annotated[list[Opaque], Field(max_length=20)]


class FinalStep(StrictModel):
    type: Literal["final"]
    kind: Literal["status", "price", "clarification", "handoff", "no_answer"]
    factIds: Annotated[list[Opaque], Field(max_length=20)]
    projectEstimateRef: Opaque | None
    narrative: Annotated[list[Paragraph], Field(max_length=4)]
    clarificationCodes: Annotated[list[Clarification], Field(max_length=8)]


StepResult = Annotated[ToolsStep | FinalStep, Field(discriminator="type")]
RESULT_ADAPTER = TypeAdapter(StepResult)


class Usage(StrictModel):
    inputTokens: Annotated[JsonInteger, Field(ge=0, le=1_000_000)]
    outputTokens: Annotated[JsonInteger, Field(ge=0, le=2048)]


class StepResponse(StrictModel):
    protocolVersion: Literal[1]
    requestId: Opaque
    step: Annotated[JsonInteger, Field(ge=0, le=3)]
    route: Literal["deterministic", "model"]
    usage: Usage | None
    result: StepResult

    @model_validator(mode="after")
    def limits(self):
        if self.route == "deterministic" and (self.usage is None or self.usage.inputTokens or self.usage.outputTokens):
            raise ValueError("Deterministic routes require zero usage")
        if isinstance(self.result, FinalStep) and sum(len(p.text) for p in self.result.narrative) > 2000:
            raise ValueError("Narrative exceeds limit")
        if isinstance(self.result, ToolsStep) and len({call.id for call in self.result.calls}) != len(self.result.calls):
            raise ValueError("Duplicate calls")
        return self
