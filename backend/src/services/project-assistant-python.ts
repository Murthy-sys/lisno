import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { assistantStepRequestSchema, assistantStepResponseSchema, type AssistantSafeToolResult, type AssistantStepRequest, type AssistantStepResponse } from "../contracts/assistant-step.js";
import { ASSISTANT_DISCLOSURE_POLICY, type AssistantFact, type AssistantGeneratedResult, type AssistantProjectPricing, type AssistantSourceVersion } from "../contracts/project-chat-assistant.js";
import { ASSISTANT_DEFAULTS as limits, AssistantFailure } from "../domain/project-chat-assistant.js";
import type { AssistantProvider } from "./project-assistant-provider.js";
import { isSocialMessage } from "./ask-lisno-project-resolution.js";
import { assistantMessageNeedsPrivacyStop, projectAssistantSafeFacts, redactAssistantMessage } from "./project-assistant-privacy.js";
import { assistantDirectFetch } from "./project-assistant-http.js";

const greetings = ["Hello! I can help with your project's progress, timelines, and published estimates. What would you like to know?", "You're welcome. I can help with your project details and published estimates.", "Goodbye. I'm here when you need help with your project.", "I'm sorry this has been frustrating. Tell me what happened with your project so I can help."] as const;
const clarificationLabels = {
  project_required: "Choose one of your projects to continue.", question_required: "What would you like to know about your project?",
  estimate_unavailable: "A verified published project estimate is not available. Please ask your project team.", unsupported_request: "I can help with your project status, progress, schedule and published estimate.",
  scope_fixed: "This conversation can only answer questions about this project.", privacy_required: "Internal prices, configuration and private company information are not available in this chat.",
  quote_required: "Changes and new work need a quote from your project team. I can show your published or approved estimate.",
  unclear_question: "Could you clarify what you would like to know?", source_unavailable: "The project information could not be verified. Please try again or ask your project team."
} as const;
const invalid = (): never => { throw new AssistantFailure("ASSISTANT_INVALID_OUTPUT"); };
const empty = (): AssistantGeneratedResult => ({ disclosurePolicy: ASSISTANT_DISCLOSURE_POLICY, projectPricing: null, kind: "clarification", facts: [], candidates: [], missingInputs: [], commercial: null, freshness: [] });

/** Literal private addresses avoid DNS rebinding. Only loopback development may use HTTP. */
export function assistantServiceEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AssistantFailure("ASSISTANT_UNAVAILABLE"); }
  const host = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const octets = host.split(".").map(Number);
  const ipv4 = isIP(host) === 4;
  const loopback = ipv4 && octets[0] === 127 || host === "::1";
  const privateAddress = loopback || ipv4 && (octets[0] === 10 || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31 || octets[0] === 192 && octets[1] === 168) || isIP(host) === 6 && /^(?:fc|fd)[0-9a-f]{2}:/u.test(host);
  if (!privateAddress || !["http:", "https:"].includes(url.protocol) || !loopback && url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new AssistantFailure("ASSISTANT_UNAVAILABLE");
  return new URL("/internal/v1/assistant/step", url).toString();
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AssistantFailure("ASSISTANT_INVALID_OUTPUT");
  const chunks: Uint8Array[] = []; let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limits.maxPayloadBytes) { cancel(); invalid(); }
      chunks.push(next.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return invalid(); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export function createPythonAssistantProvider(options?: { url: string; token: string; fetch?: typeof globalThis.fetch }): AssistantProvider {
  const endpoint = options === undefined ? null : assistantServiceEndpoint(options.url);
  if (options !== undefined && (typeof options.token !== "string" || options.token.length < 32 || options.token.length > 512 || /[^\x21-\x7e]/u.test(options.token))) throw new AssistantFailure("ASSISTANT_UNAVAILABLE");
  const transport = options?.fetch ?? assistantDirectFetch;
  return { async generate(context) {
    context.signal.throwIfAborted();
    const last = (context.messages.at(-1)?.body ?? "").normalize("NFKC");
    const required = new Set(context.requiredMessageIds ?? []);
    if ([...required].some(id => !context.messages.some(message => message.id === id))) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
    const mandatoryMessages = context.messages.filter((message, index) => required.has(message.id) || index === context.messages.length - 1);
    if (!mandatoryMessages.length || mandatoryMessages.every(message => !message.body.trim())) return { ...empty(), missingInputs: [clarificationLabels.question_required] };
    if (mandatoryMessages.some(message => assistantMessageNeedsPrivacyStop(message.body))) return { ...empty(), missingInputs: [clarificationLabels.privacy_required] };
    // Whole-message matching means "Hi, what is my cost?" still enters the tool path.
    if (mandatoryMessages.every(message => isSocialMessage(message.body))) {
      const text = /\b(?:upset|worried|confused|frustrated|frustrating|unhappy)\b/iu.test(last) ? greetings[3] : /\b(?:bye|goodbye|see you)\b/iu.test(last) ? greetings[2] : /\b(?:thanks|thank|thankyou|okay|ok|noted|understood)\b/iu.test(last) ? greetings[1] : greetings[0];
      return { ...empty(), kind: "no_answer", narrative: [{ text, factIds: [] }] };
    }
    if (options === undefined || endpoint === null) throw new AssistantFailure("ASSISTANT_UNAVAILABLE");
    const deadline = Date.now() + limits.generationMs;
    const generationSignal = AbortSignal.any([context.signal, AbortSignal.timeout(limits.generationMs)]);
    const surface = context.surface ?? (context.resolveProject ? "private" : "project_messages");
    const requestId = randomUUID();
    const available = () => typeof context.projectAvailable === "function" ? context.projectAvailable() : context.projectAvailable !== false;
    let resolvedOnce = false, attempts = 0, toolCount = 0;
    const results: AssistantSafeToolResult[] = [];
    const facts = new Map<string, AssistantFact>(), reports = new Map<string, AssistantProjectPricing>();
    const freshness: AssistantSourceVersion[] = [];
    const messageAliases = new Map<string, string>();
    const callsSeen = new Set<string>();
    const allowedTools: AssistantStepRequest["allowedTools"] = ["project_status", "project_execution", "project_estimate"];
    if (surface === "private" && context.resolveProject) allowedTools.push("resolve_project");
    if (surface === "private" && context.profile) allowedTools.push("client_profile");
    const checkTime = () => { if (generationSignal.aborted || Date.now() >= deadline) throw new AssistantFailure("ASSISTANT_TIMEOUT", true); };
    for (let step = 0; step <= limits.maxToolRounds; step++) {
      checkTime();
      const mandatory = new Set(context.requiredMessageIds ?? []);
      if (mandatory.size > limits.maxContextMessages) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
      if (context.messages.at(-1)) mandatory.add(context.messages.at(-1)!.id);
      const retained = context.messages.filter(message => mandatory.has(message.id) || !assistantMessageNeedsPrivacyStop(message.body));
      for (let index = 0; retained.length > limits.maxContextMessages && index < retained.length;) {
        if (mandatory.has(retained[index]!.id)) index++; else retained.splice(index, 1);
      }
      if (retained.length > limits.maxContextMessages) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
      const messages = retained.flatMap(message => {
        if (!messageAliases.has(message.id)) messageAliases.set(message.id, `m${messageAliases.size + 1}`);
        const body = redactAssistantMessage(message.body, context.sensitiveTerms);
        if (body.length > 2_000 && !mandatory.has(message.id)) return [];
        return [{ id: messageAliases.get(message.id)!, body, ...(message.hasAttachments ? { hasAttachments: true } : {}) }];
      });
      const requiredMessageIds = [...required].map(id => messageAliases.get(id)!);
      const request: AssistantStepRequest = { protocolVersion: 1, requestId, step, surface, remainingMs: Math.max(1, deadline - Date.now()), projectAvailable: available(), messages, requiredMessageIds, allowedTools, toolResults: results };
      const parsedRequest = assistantStepRequestSchema.safeParse(request);
      if (!parsedRequest.success) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
      let body = JSON.stringify(parsedRequest.data), bytes = Buffer.byteLength(body);
      for (let index = 0; bytes > limits.maxPayloadBytes && index < parsedRequest.data.messages.length - 1;) {
        const message = parsedRequest.data.messages[index]!;
        if (requiredMessageIds.includes(message.id)) { index++; continue; }
        parsedRequest.data.messages.splice(index, 1); body = JSON.stringify(parsedRequest.data); bytes = Buffer.byteLength(body);
      }
      if (bytes > limits.maxPayloadBytes) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
      let response: AssistantStepResponse | undefined;
      while (!response) {
        checkTime();
        if (attempts >= limits.maxProviderAttempts) throw new AssistantFailure("ASSISTANT_RETRY_LIMIT");
        const reservation = await context.reserveAttempt(bytes);
        let usage: AssistantStepResponse["usage"] = null;
        try {
          checkTime(); attempts++;
          const signal = AbortSignal.any([generationSignal, AbortSignal.timeout(Math.max(1, Math.min(limits.requestMs, deadline - Date.now())))]);
          const raw = await transport(endpoint, { method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Bearer ${options.token}` }, body, signal });
          if (!raw.ok) {
            void raw.body?.cancel().catch(() => {});
            throw new AssistantFailure(raw.status === 429 ? "ASSISTANT_RATE_LIMIT" : "ASSISTANT_PROVIDER_ERROR", raw.status === 429 || raw.status >= 500);
          }
          const decoded = await boundedJson(raw, signal);
          const parsed = assistantStepResponseSchema.safeParse(decoded);
          if (!parsed.success) throw new AssistantFailure("ASSISTANT_INVALID_OUTPUT");
          if (parsed.data.requestId !== requestId || parsed.data.step !== step) invalid();
          usage = parsed.data.usage; response = parsed.data;
        } catch (error) {
          const failure = error instanceof AssistantFailure ? error : new AssistantFailure(generationSignal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "ASSISTANT_TIMEOUT" : "ASSISTANT_NETWORK", true);
          if (!failure.transient || attempts >= limits.maxProviderAttempts || generationSignal.aborted) throw failure;
        } finally { await context.settleAttempt(reservation, usage); }
      }
      checkTime();
      const output = response.result;
      if (output.type === "tools") {
        if (step === limits.maxToolRounds || toolCount + output.calls.length > limits.maxTools) throw new AssistantFailure("ASSISTANT_TOOL_LIMIT");
        if (output.calls.some(call => !allowedTools.includes(call.name))) throw new AssistantFailure("ASSISTANT_UNKNOWN_TOOL");
        if (output.calls.some(call => callsSeen.has(call.id)) || output.calls.filter(call => call.name === "resolve_project").length > 1) invalid();
        // A resolution batch is isolated. No project read can race or bypass its scope decision.
        if (output.calls.some(call => call.name === "resolve_project") && (resolvedOnce || output.calls.length !== 1)) invalid();
        if (!available() && output.calls.some(call => ["project_status", "project_execution", "project_estimate"].includes(call.name))) throw new AssistantFailure("ASSISTANT_UNKNOWN_TOOL");
        for (const call of output.calls) {
          checkTime(); callsSeen.add(call.id); toolCount++;
          if (call.name === "resolve_project") {
            if (!context.resolveProject || surface !== "private") throw new AssistantFailure("ASSISTANT_UNKNOWN_TOOL");
            const resolution = await context.resolveProject(call.args); resolvedOnce = true;
            results.push({ callId: call.id, tool: call.name, result: { state: resolution.state === "resolved" ? "resolved" : resolution.choices.length ? "choose_project" : "clarification_required", projectRef: resolution.state === "resolved" ? "project" : null } });
          } else if (call.name === "project_estimate") {
            const estimate = await context.sources.projectEstimate?.(call.args);
            if (estimate) freshness.push(...estimate.freshness);
            const reportRef = estimate?.report ? `r${reports.size + 1}` : null;
            if (reportRef) reports.set(reportRef, estimate!.report!);
            results.push({ callId: call.id, tool: call.name, result: { reportRef, state: estimate?.report?.state ?? "unavailable", fields: estimate?.report ? ["lines", "subtotal", "gst", "total"] : [] } });
          } else {
            const bundle = call.name === "client_profile" ? await context.profile!() : await (call.name === "project_status" ? context.sources.status() : context.sources.execution());
            freshness.push(...bundle.freshness);
            let counter = facts.size;
            const safe = projectAssistantSafeFacts(bundle, call.name, () => `f${++counter}`);
            safe.facts.forEach((fact, index) => facts.set(safe.wire[index]!.id, fact));
            results.push({ callId: call.id, tool: call.name, result: { state: safe.wire.length ? "available" : "unavailable", facts: safe.wire } });
          }
          checkTime();
        }
        continue;
      }
      if (new Set(output.factIds).size !== output.factIds.length || output.factIds.some(id => !facts.has(id)) || output.projectEstimateRef !== null && !reports.has(output.projectEstimateRef)) throw new AssistantFailure("ASSISTANT_UNKNOWN_SOURCE");
      if ((output.kind === "price") !== (output.projectEstimateRef !== null) || output.kind === "status" && !output.factIds.length || output.kind === "clarification" && !output.clarificationCodes.length) invalid();
      // Model prose is not a trusted fact channel. Python returns only references;
      // the three social templates are the sole free-text exception.
      if (output.narrative.some(paragraph => paragraph.factIds.length || !greetings.includes(paragraph.text as typeof greetings[number])) || output.narrative.length > 1 || output.narrative.length && (output.factIds.length || output.projectEstimateRef !== null || output.kind !== "no_answer" || response.route !== "deterministic" || !mandatoryMessages.every(message => isSocialMessage(message.body)))) invalid();
      const selectedFacts = [...new Map(output.factIds.map(id => { const fact = facts.get(id)!; return [fact.id, fact] as const; })).values()];
      const missingInputs = [...new Set(output.clarificationCodes)].map(code => clarificationLabels[code]);
      const narrative = selectedFacts.length ? selectedFacts.slice(0, 4).map(fact => ({ text: `${fact.label}: ${fact.value}`, factIds: [fact.id] })) : output.narrative;
      return { ...empty(), kind: output.kind, facts: selectedFacts, narrative, missingInputs,
        projectPricing: output.projectEstimateRef ? reports.get(output.projectEstimateRef)! : null,
        freshness: [...new Map(freshness.map(row => [`${row.kind}:${row.id}:${row.version}`, row])).values()] };
    }
    throw new AssistantFailure("ASSISTANT_TOOL_LIMIT");
  } };
}
