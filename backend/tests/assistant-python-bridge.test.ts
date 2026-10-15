import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AssistantProviderContext } from "../src/services/project-assistant-provider.js";
import type { AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { createPythonAssistantProvider } from "../src/services/project-assistant-python.js";
import { customerEstimatePricing } from "./helpers/assistant-pricing.js";

const interpreter = process.env.LISNO_ASSISTANT_TEST_PYTHON;
const source = {id: "project-a", label: "Unclassified source sentinel", href: null};
/** Explicit opt-in uses a lightweight test venv; never starts a runtime or loads weights. */
describe.skipIf(!interpreter)("real Python planner with Node authorization callbacks", () => {
  const transport = async (_url: unknown, init?: RequestInit): Promise<Response> => {
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(interpreter!, [fileURLToPath(new URL("./helpers/assistant-python-step.py", import.meta.url))], {
        env: {...process.env, PYTHONPATH: fileURLToPath(new URL("../../assistant-service/src", import.meta.url)), PYTHONDONTWRITEBYTECODE: "1"},
        stdio: ["pipe", "pipe", "pipe"], signal: init?.signal ?? undefined
      });
      let output = "", stderr = "";
      child.stdout.on("data", chunk => { output += String(chunk); if (Buffer.byteLength(output) > 32_768) child.kill(); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve(output) : reject(new Error(`Python deterministic bridge failed (${code}): ${stderr}`)));
      child.stdin.end(String(init?.body));
    });
    return new Response(body, {headers: {"content-type": "application/json"}});
  };
  it.each([
    ["Hi, show my approved estimate", "price", "projectEstimate"],
    ["Show my project status", "status", "status"],
    ["When is project completion?", "status", "execution"],
    ["What is the price for adding a new wardrobe?", "clarification", null],
    ["Show another project", "clarification", null]
  ] as const)("preserves intent and safe output: %s", async (message, kind, expectedReader) => {
    const sources: AssistantReadSources = {
      status: vi.fn(async () => ({facts: [{id: "project-status", label: "Status", value: "active", source}], freshness: []})),
      execution: vi.fn(async () => ({facts: [{id: "execution-summary", label: "Private room sentinel", value: "Site verified; awaiting Client acceptance.", source}], freshness: []})),
      projectEstimate: vi.fn(async () => ({report: customerEstimatePricing(), unavailableReason: null, freshness: []})),
      searchCatalogue: vi.fn(), recommendations: vi.fn(), preview: vi.fn(), revalidate: vi.fn(async () => true)
    };
    const context: AssistantProviderContext = {surface: "project_messages", messages: [{id: "question", body: message}], projectAvailable: true, sources,
      signal: AbortSignal.timeout(10_000), reserveAttempt: vi.fn(async () => "reservation"), settleAttempt: vi.fn(async () => {})};
    const fetch = vi.fn(transport);
    const output = await createPythonAssistantProvider({url: "http://127.0.0.1:8080", token: "synthetic-model-free-bridge-test-token", fetch}).generate(context);
    expect(output.kind).toBe(kind);
    if (expectedReader) expect(sources[expectedReader]).toHaveBeenCalledOnce();
    else for (const reader of [sources.status, sources.execution, sources.projectEstimate]) expect(reader).not.toHaveBeenCalled();
    expect(output.commercial).toBeNull();
    expect(output.candidates).toEqual([]);
    expect(sources.searchCatalogue).not.toHaveBeenCalled();
    expect(sources.preview).not.toHaveBeenCalled();
    expect(JSON.stringify(output)).not.toMatch(/Unclassified source sentinel|Private room sentinel/);
    expect(fetch.mock.calls.map(([, init]) => String(init?.body)).join("\n")).not.toMatch(/27140|23000|ratePaise|review-a|estimate-a/);
    if (kind === "price") expect(output.projectPricing?.totalPaise).toBe(27140);
  });
});
