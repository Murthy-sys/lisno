"""Conservative fast intents; authoritative facts and all money stay in Node."""
import re

from .contracts import FinalStep, RESULT_ADAPTER, StepRequest, StepResult, ToolsStep

_SOCIAL = re.compile(r"^(?:(?:hi|hello|hey|good (?:morning|afternoon|evening)|namaste|namaskaram)(?: lisno)?|goodmorninglisno|(?:thanks|thank you|thank you very much|thanks a lot)(?: lisno)?|how are you|(?:bye|goodbye|see you)|(?:okay|ok|yes|no))[!.?,\s]*$", re.I)
_PRIVACY = re.compile(r"\b(?:configured? (?:prices?|rates?)|configuration|internal (?:costs?|prices?|rates?|information|notes?|margin)|margins?|vendor (?:rates?|prices?|costs?)|other (?:clients?|customers?)|another (?:client|customer)|passwords?|credentials?|api[ _-]?keys?|access[ _-]?tokens?|bank (?:account|details)|staff (?:notes?|salary)|unpublished|base (?:cost|rate))\b", re.I)
_SENSITIVE = re.compile(r"(?:https?://|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:bearer|secret|token|password)\s*[:=]|\b\d[\d ()+-]{8,}\d\b)", re.I)
_COST_QUESTION = re.compile(r"\b(?:costs?|prices?|pricing|estimates?|quotations?|quotes?|budget|total|gst|tax|charges?|amount|how much)\b", re.I)
_NEW_SCOPE = re.compile(r"\b(?:add|adding|addition|additional|extra|new|replace|replacing|replacement|upgrade|upgrading|remove|removing|increase|extend|extension)\b", re.I)
_ITEM_SCOPE = re.compile(r"\b(?:wardrobe|cabinet|sofa|kitchen|bedroom|bathroom|room|flooring|paint|painting|furniture|materials?)\b", re.I)
_UNRELATED_PRICE = re.compile(r"\b(?:bitcoin|crypto|stock|shares?|car|vehicle|petrol|gold|silver|flight|hotel|phone|laptop)\b", re.I)
_REQUEST_PREFIX = r"(?:(?:what(?:'s| is| are)|show(?: me)?|tell me|give(?: me)?|can i see|please show)\s+)?(?:my\s+|the\s+|this\s+|our\s+)?"
_PRICE_DIRECT = re.compile(r"^" + _REQUEST_PREFIX + r"(?:(?:current|approved|published|customer|latest)\s+)?(?:project(?:'s)?\s+)?(?:cost|price|prices|pricing|budget|estimate(?:\s+(?:total|gst|tax|subtotal|breakdown|line prices))?|quote|quotation(?:\s+breakdown)?)(?:\s+please)?[?.!\s]*$", re.I)
_STATUS_DIRECT = re.compile(r"^" + _REQUEST_PREFIX + r"(?:(?:current|recorded|latest)\s+)?(?:project(?:'s)?\s+)?(?:status|progress|stage|update)(?:\s+please)?[?.!\s]*$", re.I)
_EXECUTION_DIRECT = re.compile(r"^(?:" + _REQUEST_PREFIX + r"(?:(?:recorded|confirmed|proposed)\s+)?(?:project\s+)?(?:schedule|timeline|tasks|deadline|milestones)(?:\s+please)?|when is (?:my |the )?project completion)[?.!\s]*$", re.I)


def business_text(text: str) -> str:
    return re.sub(r"^(?:(?:hi|hello|hey|thanks|thank you|good morning)(?: lisno)?[,.!\s]+)", "", text, flags=re.I).strip()


def final(*, kind="clarification", code=None, text=None, facts=None, report=None):
    return FinalStep.model_validate({"type": "final", "kind": kind, "factIds": facts or [], "projectEstimateRef": report, "narrative": [{"text": text, "factIds": []}] if text else [], "clarificationCodes": [code] if code else []})


def relevant_text(request: StepRequest) -> str:
    required = set(request.requiredMessageIds or [request.messages[-1].id])
    return "\n".join(message.body for message in request.messages if message.id in required).strip()


def unsafe_context(request: StepRequest) -> bool:
    # Defense in depth only. Node's typed projections and message minimization
    # are mandatory; regexes cannot classify arbitrary private text safely.
    texts = [message.body for message in request.messages]
    texts.extend(fact.text for item in request.toolResults if hasattr(item.result, "facts") for fact in item.result.facts)
    return any(_SENSITIVE.search(text) for text in texts)


def direct_step(request: StepRequest) -> StepResult | None:
    text = relevant_text(request)
    if unsafe_context(request) or _PRIVACY.search(text):
        return final(code="privacy_required")
    if request.surface == "project_messages" and re.search(r"\b(?:another|other|switch|different) project\b", text, re.I):
        return final(code="scope_fixed")
    if re.fullmatch(r"(?:i(?:'m| am) (?:upset|frustrated|unhappy|worried)|this is frustrating)[!.\s]*", text, re.I):
        return final(kind="no_answer", text="I'm sorry this has been frustrating. Tell me what happened with your project so I can help.")
    if _SOCIAL.fullmatch(text):
        lower = text.lower()
        if lower.startswith(("thank", "thanks")):
            return final(kind="no_answer", text="You're welcome. I can help with your project details and published estimates.")
        if lower.startswith(("bye", "goodbye", "see you")):
            return final(kind="no_answer", text="Goodbye. I'm here when you need help with your project.")
        if lower.strip("!.,? ") in ("yes", "no", "ok", "okay"):
            # A bare confirmation never authorizes a write or infers a price.
            return final(code="question_required") if len(request.messages) == 1 else None
        return final(kind="no_answer", text="Hello! I can help with your project's progress, timelines, and published estimates. What would you like to know?")
    # No business writes, hidden amounts, or claims that a team was contacted.
    if re.search(r"\b(?:approve|pay|delete|cancel|send|publish|change|edit|update)\s+(?:my |the |this )?(?:estimate|payment|price|project|deadline|message)\b", text, re.I):
        return final(code="unsupported_request")
    if _COST_QUESTION.search(text) and _UNRELATED_PRICE.search(text):
        return final(code="unsupported_request")
    if _COST_QUESTION.search(text) and _NEW_SCOPE.search(text):
        return final(code="quote_required")
    if _COST_QUESTION.search(text) and _ITEM_SCOPE.search(text) and not re.search(r"\b(?:breakdown|lines|line prices)\b", text, re.I):
        return final(code="unclear_question")
    if re.search(r"\b(?:materials?|scope)\b", text, re.I) and not re.search(r"\b(?:estimate|quote|quotation)\b.*\b(?:breakdown|lines)\b|\bbreakdown\b.*\b(?:estimate|quote|quotation)\b", text, re.I):
        return final(code="source_unavailable")
    if _ITEM_SCOPE.search(text) and not re.search(r"\b(?:breakdown|lines|line prices)\b", text, re.I):
        # Projections deliberately omit room/item labels. Generic work facts
        # cannot prove the state of a named room or item.
        return final(code="unclear_question")
    direct = business_text(text)
    wanted = []
    if _PRICE_DIRECT.fullmatch(direct):
        wanted.append("project_estimate")
    if _STATUS_DIRECT.fullmatch(direct):
        wanted.append("project_status")
    if _EXECUTION_DIRECT.fullmatch(direct):
        wanted.append("project_execution")
    # Keyword routing only applies to short direct questions. Complex wording,
    # negations, comparisons and context-dependent follow-ups go to the model.
    if not wanted or len(text) > 240 or re.search(r"\b(?:not|don't|instead|compare|versus|why|if|would|could|same|that|it)\b", text, re.I):
        return None
    return plan_tools(request, wanted, "approved" if re.search(r"\bapproved\b", text, re.I) else "published" if re.search(r"\b(?:published|quote|quotation)\b", text, re.I) else "current")


def plan_tools(request: StepRequest, names: list[str], basis: str = "current") -> StepResult:
    if not request.projectAvailable:
        previous = [item for item in request.toolResults if item.tool == "resolve_project"]
        if previous or request.step >= 3 or "resolve_project" not in request.allowedTools:
            return final(code="project_required")
        return RESULT_ADAPTER.validate_python({"type": "tools", "calls": [{"id": f"s{request.step}_resolve", "name": "resolve_project", "args": {"name": None}}]})
    if any(name not in request.allowedTools for name in names):
        return final(code="unsupported_request")
    existing = {item.tool: item for item in request.toolResults}
    missing = [name for name in names if name not in existing]
    if missing:
        if request.step >= 3 or len(request.toolResults) + len(missing) > 6:
            return final(code="source_unavailable")
        return RESULT_ADAPTER.validate_python({"type": "tools", "calls": [{"id": f"s{request.step}_{index}", "name": name, "args": {"basis": basis} if name == "project_estimate" else {}} for index, name in enumerate(missing)]})
    facts, report = [], None
    unavailable = False
    for name in names:
        result = existing[name].result
        if name == "project_estimate":
            if result.state != "unavailable" and result.reportRef:
                report = result.reportRef
            else:
                unavailable = True
        else:
            if result.state == "available":
                facts.extend(item.id for item in result.facts)
            else:
                unavailable = True
    facts = list(dict.fromkeys(facts))[:20]
    return final(kind="price" if report else "status" if facts else "clarification", facts=facts, report=report, code=("estimate_unavailable" if "project_estimate" in names and report is None else "source_unavailable") if unavailable or not (facts or report) else None)


def validate_model_result(request: StepRequest, result: StepResult) -> StepResult:
    """Model prose is never authoritative, including prose with valid IDs."""
    if isinstance(result, ToolsStep):
        if request.step >= 3 or len(request.toolResults) + len(result.calls) > 6:
            raise ValueError("Tool budget exhausted")
        ids = {item.callId for item in request.toolResults}
        for call in result.calls:
            if call.id in ids or call.name not in request.allowedTools:
                raise ValueError("Invalid tool capability or reference")
            ids.add(call.id)
            if not request.projectAvailable and call.name not in ("resolve_project", "client_profile"):
                raise ValueError("Project scope required")
        return result
    available_facts = {fact.id for item in request.toolResults if hasattr(item.result, "facts") and item.result.state == "available" for fact in item.result.facts}
    reports = {item.result.reportRef for item in request.toolResults if item.tool == "project_estimate" and item.result.state != "unavailable" and item.result.reportRef}
    if any(ref not in available_facts for ref in result.factIds) or any(ref not in available_facts or ref not in result.factIds for paragraph in result.narrative for ref in paragraph.factIds):
        raise ValueError("Unknown fact reference")
    if result.projectEstimateRef is not None and result.projectEstimateRef not in reports:
        raise ValueError("Unknown report reference")
    # Node renders the selected facts exactly, with their source qualifiers.
    # No model-authored number, price inference, link or completion promise
    # crosses the response boundary, even if attached to a genuine fact ID.
    if result.projectEstimateRef:
        return result.model_copy(update={"kind": "price", "narrative": []})
    if result.factIds:
        return result.model_copy(update={"kind": "status", "narrative": []})
    return final(code=result.clarificationCodes[0] if result.clarificationCodes else "unclear_question")
