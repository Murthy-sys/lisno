import { publishedPriceFixture } from "../messages/assistantPricingFixtures";
import { ApiError, ApiProtocolError, ApiTimeoutError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { askLisnoFailure, boundAskLisnoInput, classifyAskLisnoFailure, createAskLisnoApi, parseAskLisnoResponse, type AskLisnoInput } from "./askLisnoApi";
import { answerFixture, directoryFixture, summaryFixture } from "./askLisnoFixtures";

const input: AskLisnoInput = { projectId: null, message: "Project progress", history: [] };
describe("private Ask Lisno contract", () => {
  it("accepts verified facts and rejects unknown answer fields", () => {
    const fixture = answerFixture();
    expect(parseAskLisnoResponse(fixture, input)).toEqual(fixture);
    expect(() => parseAskLisnoResponse({ ...fixture, answer: { ...fixture.answer, vendorRate: 123 } }, input)).toThrow(ApiProtocolError);
  });
  it.each([
    { ...answerFixture(), checkedAt: "invalid" },
    { ...answerFixture(), projectId: "different-project" },
    { ...answerFixture(), answer: { ...answerFixture().answer, narrative: [{ text: "Unsupported", factIds: ["missing"] }] } },
    { ...answerFixture(), answer: { ...answerFixture().answer, facts: [...answerFixture().answer.facts, ...answerFixture().answer.facts] } }
  ])("rejects malformed or unbound answers", fixture => expect(() => parseAskLisnoResponse(fixture, input)).toThrow(ApiProtocolError));
  it("rejects an answer bound to a different explicit project choice", () => {
    expect(() => parseAskLisnoResponse(answerFixture("project-b"), { ...input, choiceProjectId: "project-a" })).toThrow(ApiProtocolError);
  });
  it("rejects unsafe money and internal commercial fields", () => {
    const price = publishedPriceFixture({ totalPaise: 11801 });
    const fixture = { ...answerFixture(), answer: { ...answerFixture().answer, projectPricing: price } };
    expect(parseAskLisnoResponse(fixture, input).answer.projectPricing?.totalPaise).toBe(11801);
    for (const change of [{ totalPaise: 1.23 }, { totalPaise: Number.MAX_SAFE_INTEGER + 1 }, { vendorRate: 10 }]) {
      expect(() => parseAskLisnoResponse({ ...fixture, answer: { ...fixture.answer, projectPricing: { ...price, ...change } } }, input)).toThrow(ApiProtocolError);
    }
    expect(() => parseAskLisnoResponse({ ...fixture, projectId: null, resolution: undefined }, input)).toThrow(ApiProtocolError);
  });

  it("binds paged directories to their requested offset and freshness marker", () => {
    expect(parseAskLisnoResponse(directoryFixture(20), { ...input, projectListPage: { offset: 20, version: "a".repeat(64) } }).projectList?.offset).toBe(20);
    expect(() => parseAskLisnoResponse(directoryFixture(20), { ...input, projectListPage: { offset: 20, version: "b".repeat(64) } })).toThrow(expect.objectContaining({ code: "ASK_LISNO_PROJECT_LIST_CHANGED" }));
  });
  it("keeps latest fifteen questions and bounds multibyte history without removing the current question", () => {
    const history = Array.from({ length: 25 }, (_, index) => ({ body: `${index} ${"字".repeat(1900)}`, projectId: "project-a" }));
    const bounded = boundAskLisnoInput({ ...input, history });
    expect(bounded.history.length).toBeLessThanOrEqual(15);
    expect(Buffer.byteLength(JSON.stringify(bounded), "utf8")).toBeLessThanOrEqual(32768);
    expect(bounded.history.at(-1)).toEqual(history.at(-1));
    expect(bounded.message).toBe(input.message);
    expect(history).toHaveLength(25);
  });
  it("uses a 100 second deadline and never retries the private POST", async () => {
    const post = jest.fn().mockResolvedValue(answerFixture());
    const api = createAskLisnoApi({ api: { authenticated: { post } } } as unknown as MobileRuntime);
    const signal = new AbortController().signal;
    await api.ask(input, signal);
    expect(post).toHaveBeenCalledWith("/client/ask-lisno", input, { signal, timeoutMs: 100000, safeRetryCount: 0 });
  });
  it("revalidates project and chat membership with the same stable ID", async () => {
    const get = jest.fn().mockResolvedValueOnce({ id: "project-a" }).mockResolvedValueOnce(summaryFixture("project-a"));
    const api = createAskLisnoApi({ api: { authenticated: { get } } } as unknown as MobileRuntime);
    await api.verifyProject("project-a", new AbortController().signal);
    expect(get.mock.calls.map(call => call[0])).toEqual(["/projects/project-a", "/projects/project-a/chat"]);
    get.mockResolvedValueOnce({ id: "other" }).mockResolvedValueOnce(summaryFixture("project-a"));
    await expect(api.verifyProject("project-a", new AbortController().signal)).rejects.toThrow(ApiProtocolError);
  });
  it("distinguishes busy, quota and timeout without exposing raw upstream errors", () => {
    expect(askLisnoFailure(new ApiError(429, "ASSISTANT_BUSY", "private upstream"))).toContain("busy");
    expect(askLisnoFailure(new ApiError(429, "ASSISTANT_TOKEN_LIMIT", "private upstream"))).toContain("limit");
    expect(askLisnoFailure(new ApiTimeoutError())).toContain("longer than expected");
    expect(askLisnoFailure(new Error("private upstream"))).not.toContain("private upstream");
  });
  it.each([
    [new ApiError(429, "ASSISTANT_BUSY", "private upstream"), "busy"],
    [new ApiError(429, "UNKNOWN_LIMIT", "private upstream"), "usage_limit"],
    [new ApiError(503, "ASSISTANT_RATE_LIMIT", "private upstream"), "usage_limit"],
    [new ApiError(429, "ASSISTANT_ADMISSION_LIMIT", "private upstream"), "usage_limit"],
    [new ApiError(429, "ASSISTANT_TOKEN_LIMIT", "private upstream"), "usage_limit"],
    [new ApiTimeoutError(), "timeout"],
    [new ApiError(504, "ASSISTANT_TIMEOUT", "private upstream"), "timeout"],
    [new ApiProtocolError(), "invalid_answer"],
    [new ApiError(409, "ASSISTANT_SOURCE_CHANGED", "private upstream"), "invalid_answer"],
    [new Error("private upstream"), "unavailable"]
  ])("classifies a failure for safe chat presentation (%s)", (error, kind) => {
    expect(classifyAskLisnoFailure(error)).toBe(kind);
    expect(askLisnoFailure(error)).not.toContain("private upstream");
    if (kind === "usage_limit") {
      expect(askLisnoFailure(error)).toContain("try again later");
      expect(askLisnoFailure(error)).not.toMatch(/shortly|\d/);
    }
  });
});
