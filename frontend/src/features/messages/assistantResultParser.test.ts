import { describe, expect, it } from "vitest";
import { parseAssistantResult } from "./assistantResultParser";
import { parseAskLisnoResponse } from "../ask-lisno/askLisnoApi";
import { publishedPriceFixture } from "./assistantPricingFixtures";

const answer = () => ({ disclosurePolicy: "project-publication-v1", kind: "price", facts: [], candidates: [], missingInputs: [], commercial: null, projectPricing: publishedPriceFixture() });
const result = () => ({ ...answer(), id: "result-a", projectId: "project-a", messageId: "message-a", checkedAt: "2026-10-15T00:00:00Z", commercialAccess: "allowed", stale: false });
describe("published project pricing contract", () => {
  it("preserves unequal project totals and exact paise, including zero and unavailable fields", () => {
    expect(parseAssistantResult(result(), "project-a", "result-a").projectPricing?.totalPaise).toBe(973500);
    const other = { ...result(), projectId: "project-b", id: "result-b", projectPricing: publishedPriceFixture({ estimateId: "estimate-b", totalPaise: 101, gstPaise: 0, subtotalPaise: null }) };
    expect(parseAssistantResult(other, "project-b", "result-b").projectPricing).toMatchObject({ totalPaise: 101, gstPaise: 0, subtotalPaise: null });
    expect(() => parseAssistantResult(other, "project-a", "result-b")).toThrow();
  });
  it.each([{ totalPaise: 1.5 }, { totalPaise: -1 }, { totalPaise: Number.MAX_SAFE_INTEGER + 1 }, { estimateVersion: 0 }, { publishedAt: "yesterday" }, { internalCost: 90 }, { lineCount: 2 }, { policy: "configuration-selling-v1" }, { source: { id: "e", label: "Estimate", href: "//example.test" } }, { source: { id: "e", label: "Estimate", href: "/%5cexample.test" } }])("rejects invalid financial or lineage data %j", change => {
    expect(() => parseAssistantResult({ ...result(), projectPricing: { ...publishedPriceFixture(), ...change } }, "project-a", "result-a")).toThrow();
  });
  it.each([{ stale: true }, { commercialAccess: "restricted" }, { commercialAccess: "none" }])("rejects contradictory disclosure %j", change => expect(() => parseAssistantResult({ ...result(), ...change }, "project-a", "result-a")).toThrow());
  it("replaces unknown legacy content with an empty refresh answer", () => {
    const parsed = parseAssistantResult({ ...result(), disclosurePolicy: "old", facts: [{ value: "internal" }], narrative: [{ text: "internal" }], commercial: { internalCost: 100 }, candidates: [{ name: "internal" }] }, "project-a", "result-a");
    expect(parsed).toMatchObject({ kind: "no_answer", facts: [], candidates: [], commercial: null, projectPricing: null });
    expect(JSON.stringify(parsed)).not.toContain("internal");
  });
  it("requires private prices to belong to the resolved authorized project and never accepts old Configuration prices", () => {
    const input = { projectId: null, message: "Cost", history: [] };
    const response = { projectId: "project-a", checkedAt: result().checkedAt, answer: answer() };
    expect(parseAskLisnoResponse(response, input).answer.projectPricing?.totalPaise).toBe(973500);
    expect(() => parseAskLisnoResponse({ ...response, projectId: null }, input)).toThrow();
    expect(() => parseAskLisnoResponse(response, { ...input, choiceProjectId: "project-b" })).toThrow();
    expect(() => parseAskLisnoResponse({ ...response, answer: { ...answer(), commercial: { totalPaise: 42 } } }, input)).toThrow();
  });
});
