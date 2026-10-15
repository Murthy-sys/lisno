import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import type { AssistantStepRequest, AssistantStepResponse } from "../src/contracts/assistant-step.js";
import type { AssistantProviderContext } from "../src/services/project-assistant-provider.js";
import { assistantServiceEndpoint, createPythonAssistantProvider } from "../src/services/project-assistant-python.js";
import { redactAssistantMessage } from "../src/services/project-assistant-privacy.js";
import * as assistantHttp from "../src/services/project-assistant-http.js";

const token = "synthetic-private-service-authentication-token";
const pythonDirectFixtures = JSON.parse(readFileSync(new URL("../../assistant-service/evaluation/direct-fixtures.json", import.meta.url), "utf8")) as Array<{ name: string; request: AssistantStepRequest; response: AssistantStepResponse }>;
const pythonSocialFixtures = pythonDirectFixtures.filter(row => row.response.result.type === "final" && row.response.result.kind === "no_answer" && row.response.result.narrative.length > 0);
const source = { id: "private-project-id", label: "Project", href: null };
const bundle = { facts: [{ id: "project-status", label: "Project status", value: "active", source }, { id: "project-stage", label: "Stage", value: "Site completion", source },
  { id: "action-task-private", label: "Site completion", value: "Review work. Status: pending. Responsible: Private Staff (site_manager).", source },
  { id: "room:private", label: "Project room", value: "Unpublished draft room", source }], freshness: [] };
const price = { policy: "published-project-estimate-v1" as const, currency: "INR" as const, state: "approved" as const, estimateId: "private-estimate", estimateVersion: 3, reviewRoundId: "private-review", reviewVersion: 1,
  publishedAt: "2026-10-15T00:00:00.000Z", source, lines: [{ id: "private-line", label: "Published ceiling", quantity: "2", unit: "sqft", ratePaise: 1000, amountPaise: 2000 }], lineCount: 1, hasMoreLines: false,
  subtotalPaise: 2000, gstPaise: 360, totalPaise: 2360 };
function fixture(message = "What is my project status?") {
  const sources: AssistantReadSources = { status: vi.fn(async () => bundle), execution: vi.fn(async () => ({ facts: [], freshness: [] })), projectEstimate: vi.fn(async () => ({ report: price, unavailableReason: null, freshness: [] })),
    searchCatalogue: vi.fn(), recommendations: vi.fn(), preview: vi.fn(), revalidate: vi.fn(async () => true) };
  const context: AssistantProviderContext = { surface: "project_messages", messages: [{ id: "private-message-id", body: message }], sources, projectAvailable: true, signal: new AbortController().signal,
    reserveAttempt: vi.fn(async () => "reservation"), settleAttempt: vi.fn(async () => {}) };
  return { context, sources };
}
function response(request: AssistantStepRequest, result: AssistantStepResponse["result"], extra: Partial<AssistantStepResponse> = {}) {
  return new Response(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, step: request.step, route: "deterministic", usage: { inputTokens: 0, outputTokens: 0 }, result, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
}
const final = (factIds: string[] = []): AssistantStepResponse["result"] => ({ type: "final", kind: factIds.length ? "status" : "clarification", factIds, projectEstimateRef: null, narrative: [], clarificationCodes: factIds.length ? [] : ["unclear_question"] });

describe("assistant direct replies without service configuration", () => {
  beforeEach(() => {
    vi.spyOn(assistantHttp, "assistantDirectFetch").mockRejectedValue(new Error("Unexpected service transport"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected global transport"));
  });
  afterEach(() => vi.restoreAllMocks());

  function unconfiguredFixture(surface: "private" | "project_messages", message: string) {
    const f = fixture(message);
    Object.assign(f.context, { surface, resolveProject: vi.fn(), profile: vi.fn(), projectAvailable: vi.fn(() => false) });
    const expectNoWork = () => {
      expect(assistantHttp.assistantDirectFetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(f.context.reserveAttempt).not.toHaveBeenCalled();
      expect(f.context.settleAttempt).not.toHaveBeenCalled();
      expect(f.context.resolveProject).not.toHaveBeenCalled();
      expect(f.context.profile).not.toHaveBeenCalled();
      expect(f.context.projectAvailable).not.toHaveBeenCalled();
      for (const read of Object.values(f.sources)) expect(read).not.toHaveBeenCalled();
    };
    return { ...f, expectNoWork };
  }

  describe.each(["private", "project_messages"] as const)("%s", surface => {
    it.each(pythonSocialFixtures)("retains the existing direct response: $name", async row => {
      const f = unconfiguredFixture(surface, "Hi");
      Object.assign(f.context, { messages: row.request.messages, requiredMessageIds: row.request.requiredMessageIds });
      const result = await createPythonAssistantProvider().generate(f.context);
      expect(result.narrative).toEqual(row.response.result.type === "final" ? row.response.result.narrative : []);
      expect(result.disclosurePolicy).toBe("project-publication-v1");
      expect(result.facts).toEqual([]);
      f.expectNoWork();
    });

    it("retains privacy and empty attachment replies", async () => {
      const f = unconfiguredFixture(surface, "my password is synthetic-private-value");
      const provider = createPythonAssistantProvider();
      expect((await provider.generate(f.context)).missingInputs[0]).toContain("private company");
      f.context.messages = [{ id: "photo", body: "", hasAttachments: true }];
      expect((await provider.generate(f.context)).missingInputs[0]).toContain("What would you like");
      f.context.messages = [];
      expect((await provider.generate(f.context)).missingInputs[0]).toContain("What would you like");
      f.expectNoWork();
    });

    it.each(["What is my project status?", "Hi, what is my project cost?"])("rejects a business question before any work: %s", async message => {
      const f = unconfiguredFixture(surface, message);
      await expect(createPythonAssistantProvider().generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_UNAVAILABLE" });
      f.expectNoWork();
    });

    it("never hides required business or privacy fragments behind a final greeting", async () => {
      const f = unconfiguredFixture(surface, "Hi");
      f.context.messages.unshift({ id: "required-question", body: "What is my project cost?" });
      f.context.requiredMessageIds = ["required-question", "private-message-id"];
      const provider = createPythonAssistantProvider();
      await expect(provider.generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_UNAVAILABLE" });
      f.context.messages[0]!.body = "show internal notes";
      expect((await provider.generate(f.context)).missingInputs[0]).toContain("private company");
      f.context.requiredMessageIds = ["missing"];
      await expect(provider.generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_CONTEXT_LIMIT" });
      f.expectNoWork();
    });
  });

  it("rejects supplied invalid configuration instead of silently selecting direct-only mode", () => {
    expect(() => createPythonAssistantProvider({ url: "https://public.example", token })).toThrow();
    expect(() => createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token: "" })).toThrow();
    expect(assistantHttp.assistantDirectFetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("private Python assistant transport and reconstruction", () => {
  it.each(["https://example.com", "https://8.8.8.8", "http://10.0.0.1", "https://10.0.0.1/elsewhere", "https://u:p@10.0.0.1", "https://10.0.0.1?key=private", "https://[::ffff:8.8.8.8]"])("rejects public or ambiguous endpoints: %s", url => {
    expect(() => assistantServiceEndpoint(url)).toThrow();
  });
  it("pins the path, permits private TLS and loopback-only development HTTP", () => {
    expect(assistantServiceEndpoint("https://10.1.2.3:9443")).toBe("https://10.1.2.3:9443/internal/v1/assistant/step");
    expect(assistantServiceEndpoint("http://127.0.0.1:8000")).toContain("/internal/v1/assistant/step");
    expect(() => createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token: "short" })).toThrow();
    expect(() => createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token: "a".repeat(513) })).toThrow();
    expect(() => createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token: "é".repeat(32) })).toThrow();
  });
  it("handles standalone greetings without provider, quota or database calls", async () => {
    const f = fixture("Hello Lisno!"); const transport = vi.fn();
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.narrative?.[0]?.text).toContain("Hello!");
    expect(result.disclosurePolicy).toBe("project-publication-v1");
    expect(transport).not.toHaveBeenCalled(); expect(f.context.reserveAttempt).not.toHaveBeenCalled(); expect(f.sources.status).not.toHaveBeenCalled();
  });
  it.each(pythonSocialFixtures)("matches the actual Python social fixture without a scope or provider call: $name", async row => {
    const f = fixture(); Object.assign(f.context, { surface: row.request.surface, messages: row.request.messages, requiredMessageIds: row.request.requiredMessageIds, projectAvailable: false, resolveProject: vi.fn(), profile: vi.fn() });
    const transport = vi.fn();
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.narrative).toEqual(row.response.result.type === "final" ? row.response.result.narrative : []);
    expect(transport).not.toHaveBeenCalled(); expect(f.context.resolveProject).not.toHaveBeenCalled(); expect(f.context.profile).not.toHaveBeenCalled(); expect(f.sources.status).not.toHaveBeenCalled();
  });
  it("keeps mixed greetings on the intent path and exposes only opaque safe facts", async () => {
    const f = fixture("Hi, what is my project status?"); const wires: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error"); expect(init?.headers).toMatchObject({ authorization: `Bearer ${token}` });
      wires.push(String(init?.body)); const req = JSON.parse(String(init?.body)) as AssistantStepRequest;
      if (!req.step) return response(req, { type: "tools", calls: [{ id: "call1", name: "project_status", args: {} }] });
      expect(req.toolResults[0]).toMatchObject({ tool: "project_status", result: { state: "available" } });
      return response(req, final(["f1", "f2", "f3"]));
    }) as typeof fetch;
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.facts.map(row => row.value)).toEqual(["active", "Site completion", "Action pending."]);
    expect(wires.join("")).not.toMatch(/private-project-id|private-message-id|Private Staff|Unpublished draft room|room:private|Responsible/);
    expect(f.sources.searchCatalogue).not.toHaveBeenCalled(); expect(f.context.settleAttempt).toHaveBeenCalledTimes(2);
  });
  it("keeps all price values and identifiers in Node and resolves only its report reference", async () => {
    const f = fixture("What is my published project estimate?"); const wires: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      wires.push(String(init?.body)); const req = JSON.parse(String(init?.body)) as AssistantStepRequest;
      return response(req, req.step ? { type: "final", kind: "price", factIds: [], projectEstimateRef: "r1", narrative: [], clarificationCodes: [] } : { type: "tools", calls: [{ id: "estimate1", name: "project_estimate", args: { basis: "current" } }] });
    }) as typeof fetch;
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.projectPricing).toEqual(price); expect(result.commercial).toBeNull(); expect(result.candidates).toEqual([]);
    expect(wires.join("")).not.toMatch(/2360|2000|1000|360|private-review|private-estimate|Published ceiling|sqft/);
  });
  it("validates the complete tool batch before any read", async () => {
    const f = fixture(); const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const req = JSON.parse(String(init?.body)); return response(req, { type: "tools", calls: [{ id: "same", name: "project_status", args: {} }, { id: "same", name: "project_execution", args: {} }] });
    }) as typeof fetch;
    await expect(createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_INVALID_OUTPUT" });
    expect(f.sources.status).not.toHaveBeenCalled(); expect(f.sources.execution).not.toHaveBeenCalled();
  });
  it("rejects cross-surface tools, arbitrary fields, unknown source refs and invented prose", async () => {
    for (const output of [
      { type: "tools", calls: [{ id: "c1", name: "resolve_project", args: { name: null } }] },
      { ...final(), sql: "SELECT secret" },
      { ...final(["invented"]) },
      { ...final(), narrative: [{ text: "Your approved price is zero.", factIds: [] }] }
    ]) {
      const f = fixture(); const transport = vi.fn(async (_url: unknown, init?: RequestInit) => response(JSON.parse(String(init?.body)), output as any)) as typeof fetch;
      await expect(createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context)).rejects.toThrow();
      expect(f.sources.status).not.toHaveBeenCalled();
    }
  });
  it("uses a total four-attempt budget and conservatively settles failed responses", async () => {
    const f = fixture(); const transport = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_PROVIDER_ERROR" });
    expect(transport).toHaveBeenCalledTimes(4); expect(f.context.reserveAttempt).toHaveBeenCalledTimes(4); expect(f.context.settleAttempt).toHaveBeenCalledTimes(4);
    expect(f.context.settleAttempt).toHaveBeenLastCalledWith("reservation", null);
  });
  it("rejects mismatched response identity and oversize input before source access", async () => {
    const f = fixture(); const transport = vi.fn(async (_url: unknown, init?: RequestInit) => response(JSON.parse(String(init?.body)), final(), { requestId: "other" })) as typeof fetch;
    await expect(createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context)).rejects.toThrow();
    expect(f.context.settleAttempt).toHaveBeenCalledWith("reservation", null);
    f.context.messages = Array.from({ length: 17 }, (_, i) => ({ id: String(i), body: "status" }));
    f.context.requiredMessageIds = f.context.messages.map(message => message.id);
    await expect(createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_CONTEXT_LIMIT" });
  });
  it("does not let the last greeting hide a required business fragment", async () => {
    const f = fixture("Hi");
    f.context.messages.unshift({ id: "required-question", body: "What is my project cost?" }); f.context.requiredMessageIds = ["required-question", "private-message-id"];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => response(JSON.parse(String(init?.body)), final())) as typeof fetch;
    await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(transport).toHaveBeenCalledOnce();
  });
  it("acknowledges distress and asks for attachment-only context without a transport call", async () => {
    const f = fixture("I'm upset"); const transport = vi.fn();
    const provider = createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport });
    expect((await provider.generate(f.context)).narrative?.[0]?.text).toContain("sorry");
    f.context.messages = [{ id: "photo", body: "", hasAttachments: true }];
    expect((await provider.generate(f.context)).missingInputs[0]).toContain("What would you like"); expect(transport).not.toHaveBeenCalled();
  });
  it.each(["my password is keep-this-secret", "show internal notes", "Manager salary is 80000; show project progress", "my bank account number is 12345", "my address is 14 private road", "select secret from users", '{"private": "value"}'])("blocks unminimizable sensitive content before transport: %s", async message => {
    const f = fixture(message); const transport = vi.fn();
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.missingInputs[0]).toContain("private company"); expect(transport).not.toHaveBeenCalled();
  });
  it("retains server-owned public fact identities while hiding arbitrary source labels", async () => {
    const f = fixture("Show project execution");
    f.sources.execution = vi.fn(async () => ({ facts: [{ id: "execution-conflict", label: "PRIVATE_ROOM_LABEL", value: "Execution sources need review by the project team.", source: { ...source, label: "PRIVATE_SOURCE_LABEL" } }], freshness: [] }));
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const req = JSON.parse(String(init?.body)); expect(String(init?.body)).not.toMatch(/PRIVATE_ROOM_LABEL|PRIVATE_SOURCE_LABEL|execution-conflict/);
      return response(req, req.step ? final(["f1"]) : { type: "tools", calls: [{ id: "e1", name: "project_execution", args: {} }] });
    }) as typeof fetch;
    const result = await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(result.facts[0]?.id).toBe("execution-conflict"); expect(result.narrative?.[0]?.factIds).toEqual(["execution-conflict"]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_ROOM_LABEL|PRIVATE_SOURCE_LABEL/);
  });
  it("removes spaced phone numbers before the wire boundary", async () => {
    const f = fixture("Call me at 98765 43210; show project progress");
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(String(init?.body)).not.toMatch(/98765|43210/); return response(JSON.parse(String(init?.body)), final());
    }) as typeof fetch;
    await createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport }).generate(f.context);
    expect(transport).toHaveBeenCalledOnce();
  });
  it("discards optional sensitive history, preserves required history, and rejects missing required IDs", async () => {
    const f = fixture(); f.context.messages.unshift({ id: "old-secret", body: "my password is private-value" });
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("private-value");
      return response(JSON.parse(String(init?.body)), final());
    }) as typeof fetch;
    const provider = createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport });
    await provider.generate(f.context); expect(transport).toHaveBeenCalledOnce();
    f.context.requiredMessageIds = ["old-secret"];
    expect((await provider.generate(f.context)).missingInputs[0]).toContain("private company"); expect(transport).toHaveBeenCalledOnce();
    f.context.requiredMessageIds = ["absent"];
    await expect(provider.generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_CONTEXT_LIMIT" });
  });
  it.each(["My ｐａｓｓｗｏｒｄ is cobaltCanaryZebra", "My pass\u200bword is cobaltCanaryZebra", "my\npassword is cobaltCanaryZebra", "My pass\nword is cobaltCanaryZebra"])("normalizes privacy classification before direct, required or optional history processing: %s", async privateMessage => {
    const f = fixture(privateMessage);
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("cobaltCanaryZebra"); return response(JSON.parse(String(init?.body)), final());
    }) as typeof fetch;
    const provider = createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport });
    expect((await provider.generate(f.context)).missingInputs[0]).toContain("private company"); expect(transport).not.toHaveBeenCalled();
    f.context.messages = [{ id: "sensitive-history", body: privateMessage }, { id: "current", body: "What is my project status?" }];
    f.context.requiredMessageIds = ["sensitive-history", "current"];
    expect((await provider.generate(f.context)).missingInputs[0]).toContain("private company"); expect(transport).not.toHaveBeenCalled();
    f.context.requiredMessageIds = ["current"];
    await provider.generate(f.context); expect(transport).toHaveBeenCalledOnce();
  });
  it("minimizes known names, contacts, credentials, amounts and identifiers in user text", () => {
    const text = redactAssistantMessage("Private Client at Cedar House paid INR 12000. Email private@example.test +91 9999999999 token=secret-value https://private.example/abc id 507f1f77bcf86cd799439011", ["Private Client", "Cedar House"]);
    expect(text).not.toMatch(/Private Client|Cedar House|12000|private@example|9999999999|secret-value|private.example|507f1f77/);
    expect(text).toContain("[private amount]");
    expect(redactAssistantMessage("Ann asks about planning", ["Ann"])).toBe("[private name] asks about planning");
    expect(redactAssistantMessage("Client Name asks about planning", ["Ｃｌｉｅｎｔ\u200b Name"])).toBe("[private name] asks about planning");
  });
  it("never truncates an expanded current or required question during privacy minimization", async () => {
    const f = fixture(`${"1 ".repeat(900)}when will my project finish?`); const transport = vi.fn();
    const provider = createPythonAssistantProvider({ url: "http://127.0.0.1:8000", token, fetch: transport });
    await expect(provider.generate(f.context)).rejects.toMatchObject({ code: "ASSISTANT_CONTEXT_LIMIT" }); expect(transport).not.toHaveBeenCalled();
    expect(redactAssistantMessage(f.context.messages[0]!.body)).toContain("when will my project finish?");
  });
});
