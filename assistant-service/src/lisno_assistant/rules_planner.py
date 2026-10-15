"""Bounded intent matching; Node remains the authority for every project read."""
import re
import unicodedata
from itertools import zip_longest

from .contracts import FinalStep, Message, StepRequest, StepResult
from .planner import direct_step, final, plan_tools

_GREETING_PREFIX = re.compile(
    r"^(?:hi|hello|hey|namaste|namaskaram|thanks|thank you|good (?:morning|afternoon|evening))"
    r"(?: lisno(?: ai)?)?[,!.\s]+", re.I,
)
_TONE_PHRASE = r"(?:i(?:'m| am) (?:(?:really|very|so) )?(?:frustrated|upset|unhappy|worried|concerned|confused)|this is (?:urgent|frustrating))"
_TONE_PREFIX = re.compile(r"^" + _TONE_PHRASE + r"[,!.:;?]+\s*(?=\S)", re.I)
_TONE_TURN = re.compile(r"^" + _TONE_PHRASE + r"[!.?\s]*$", re.I)
_NON_DIRECT = re.compile(
    r"\b(?:not|never|don't|doesn't|isn't|wasn't|won't|without|except|instead|unless|if|would|could|compare|versus)\b",
    re.I,
)
_HELP = re.compile(r"^(?:help|help me|what can you do|what can i ask|how can you help|show help)[?.!\s]*$", re.I)
_FOLLOWUP = re.compile(
    r"^(?:and|what about)\s+(?:the |my |our |this )?((?:project )?(?:progress|status|timeline|schedule)|(?:published|approved) estimate)[?.!\s]*$",
    re.I,
)
_NAMED_PROGRESS = re.compile(r"^show progress for \[private name\][?.!\s]*$", re.I)
_POLITE_PROJECT = re.compile(
    r"^may i know ((?:(?:my|our|the|this) )?project (?:status|progress|timeline|schedule))(?:,? please)?[?.!\s]*$",
    re.I,
)
_COMBINED = re.compile(r"^show (?:my |the |our |this )?project (?:status|progress) and (?:its )?(?:timeline|schedule)[?.!\s]*$", re.I)
_BUSINESS_TOOLS = ["project_status", "project_execution", "project_estimate"]
_FACT_KINDS = ["project_stage", "progress", "schedule", "task_state", "help"]


def _normalized(message: Message) -> Message:
    body = unicodedata.normalize("NFKC", message.body).replace("’", "'").replace("‘", "'")
    return message.model_copy(update={"body": re.sub(r"\s+", " ", body).strip()})


def _plan_with_balanced_facts(request: StepRequest, names: list[str], basis: str) -> StepResult:
    result = plan_tools(request, names, basis)
    if not isinstance(result, FinalStep) or not (result.factIds or result.projectEstimateRef):
        return result
    existing = {item.tool: item.result for item in request.toolResults}
    groups = [existing[name].facts for name in names if name != "project_estimate"
              and name in existing and existing[name].state == "available"]
    codes = list(result.clarificationCodes)
    if any(not group for group in groups) and "source_unavailable" not in codes:
        codes.append("source_unavailable")
    if len({fact.id for group in groups for fact in group}) <= 20:
        return result.model_copy(update={"clarificationCodes": codes})

    # The shared planner takes the first 20 concatenated facts. Reserve each
    # requested source's distinct kinds first so a long status projection cannot
    # hide execution progress or schedules; fill spare slots across sources.
    representatives = [[next(fact for fact in group if fact.kind == kind)
                        for kind in _FACT_KINDS if any(fact.kind == kind for fact in group)]
                       for group in groups]
    selected: list[str] = []
    for candidates in (representatives, groups):
        for row in zip_longest(*candidates):
            for fact in row:
                if fact is not None and fact.id not in selected and len(selected) < 20:
                    selected.append(fact.id)
    represented = set(selected)
    missing = any(not any(fact.id in represented and fact.kind == kind for fact in group)
                  for group in groups for kind in {fact.kind for fact in group})
    if missing and "source_unavailable" not in codes:
        codes.append("source_unavailable")
    return result.model_copy(update={"factIds": selected, "clarificationCodes": codes})


def rules_step(request: StepRequest) -> StepResult:
    # The latest message is mandatory even if a shared batch also supplies IDs.
    required = set(request.requiredMessageIds or []) | {request.messages[-1].id}
    normalized = [_normalized(message) for message in request.messages]
    messages = [message for message in normalized if message.id in required]
    guarded = request.model_copy(update={
        "messages": normalized, "requiredMessageIds": [message.id for message in messages],
        "toolResults": [], "step": 0,
    })

    # Run the existing privacy, mutation, item and new-work checks against the
    # complete message input before removing greeting prefixes or recognizing
    # aliases. Safe tool projections contain legitimate dates that the older
    # text heuristic mistakes for phone numbers; they are never intent input.
    # Only plan_tools consumes their opaque references from the real request.
    guard = direct_step(guarded)
    if isinstance(guard, FinalStep) and guard.clarificationCodes:
        return guard
    if any(_NON_DIRECT.search(message.body) for message in messages):
        return final(code="unclear_question")

    wanted: list[str] = []
    bases: set[str] = set()
    social: list[FinalStep] = []
    for message in messages:
        text = message.body
        if len(text) > 240:
            return final(code="unclear_question")
        # Classify only. This synthetic request cannot read or authorize data;
        # plan_tools below applies the actual scope, capabilities and budgets.
        classification = guarded.model_copy(update={
            "step": 0, "projectAvailable": True, "toolResults": [],
            "messages": [message], "requiredMessageIds": [message.id],
            "allowedTools": _BUSINESS_TOOLS,
        })
        result = direct_step(classification)
        if isinstance(result, FinalStep):
            if result.narrative:
                social.append(result)
                continue
            return result
        if _TONE_TURN.fullmatch(text):
            # Whole tone fragments need no project read and contribute no
            # generated prose. Node presents the original user's wording.
            social.append(final(code="question_required"))
            continue
        for _ in range(3):
            stripped = _GREETING_PREFIX.sub("", text, count=1).strip()
            if stripped == text:
                break
            text = stripped
        text = _TONE_PREFIX.sub("", text, count=1).strip()
        if _HELP.fullmatch(text):
            return final(code="unsupported_request")
        polite_project = _POLITE_PROJECT.fullmatch(text)
        if polite_project:
            text = "show " + polite_project.group(1)
        if _NAMED_PROGRESS.fullmatch(text):
            if request.surface != "private":
                return final(code="scope_fixed")
            if not request.projectAvailable:
                return final(code="project_required")
            # Only this exact backend-redacted callback is an alias. Never
            # discard arbitrary suffixes or treat text as project authority.
            text = "show project progress"
        followup = _FOLLOWUP.fullmatch(text)
        if followup:
            text = "show " + followup.group(1)
        if _COMBINED.fullmatch(text):
            wanted.extend(["project_status", "project_execution"])
            continue
        if result is None or text != message.body:
            result = direct_step(classification.model_copy(update={"messages": [message.model_copy(update={"body": text})]}))
        if result is None:
            return final(code="unclear_question")
        if isinstance(result, FinalStep):
            return result if result.clarificationCodes else final(code="unclear_question")
        for call in result.calls:
            wanted.append(call.name)
            if call.name == "project_status" and re.search(r"\bprogress\b", text, re.I):
                # Stage and verified execution progress are separate backend
                # projections. Asking for progress needs both safe readers.
                wanted.append("project_execution")
            if call.name == "project_estimate":
                bases.add(call.args.basis)

    if len(bases) > 1:
        # One report reference cannot claim to compare separate source states.
        return final(code="unclear_question")
    if wanted:
        return _plan_with_balanced_facts(request, list(dict.fromkeys(wanted)), next(iter(bases), "current"))
    if social:
        return social[-1]
    return final(code="question_required")
