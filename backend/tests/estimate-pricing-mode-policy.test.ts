import { describe, expect, it } from "vitest";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { assertEstimatePricingModeChanges, canChangeEstimatePricingMode } from "../src/services/estimate-collaboration-policy.service.js";

const sales = { id: "sales-a", role: "estimator_sales" as const };
const designer = { id: "designer-a", role: "designer" as const };
const client = { id: "client-a", role: "client" as const };
const project = { estimationWorkflowVersion: 3, assignedEstimatorId: sales.id, primaryDesignerId: designer.id, clientId: client.id };
const line = { id: "line-one", source: "configuration", roomId: "room-a", mainLineId: "main-a", pricingMode: "pmc", classification: "special", included: true };
const estimate = (phase: "pre" | "post") => ({ ownerId: sales.id, designPlanDesignerId: designer.id, lineItems: [line],
  estimation: { ...newQuotationLifecycle(), phase, preApproval: phase === "post"
    ? { reviewRoundId: "approved-initial", estimateVersion: 1, approvedAt: "2026-11-08T00:00:00.000Z" } : null } });

describe("V3 pricing mode authority", () => {
  it("moves staff authority from assigned Sales to the primary Designer at initial approval", () => {
    expect([client, sales, designer].map(actor => canChangeEstimatePricingMode(actor, estimate("pre"), project))).toEqual([true, true, false]);
    expect([client, sales, designer].map(actor => canChangeEstimatePricingMode(actor, estimate("post"), project))).toEqual([true, false, true]);
    for (const actor of [client, sales, designer]) expect(canChangeEstimatePricingMode({ ...actor, id: "unrelated" }, estimate("post"), project)).toBe(false);
    expect(canChangeEstimatePricingMode({ id: "admin", role: "super_admin" }, estimate("post"), project)).toBe(false);
  });

  it("preserves Client pending-edit authority and closed-estimate restrictions", () => {
    const pending = estimate("post");
    pending.estimation.status = "sent_to_client";
    expect(canChangeEstimatePricingMode(client, pending, project)).toBe(true);
    expect(canChangeEstimatePricingMode(designer, pending, project)).toBe(false);
    pending.estimation.editClosedAt = "2026-11-08T00:00:00.000Z";
    expect(canChangeEstimatePricingMode(client, pending, project)).toBe(false);
  });

  it("allows unchanged modes and exclusion but blocks resets, row replacement and dropped non-default metadata", () => {
    const post = estimate("post");
    expect(() => assertEstimatePricingModeChanges(sales, post, project, [{ ...line, quantity: 8, included: false }])).not.toThrow();
    for (const lines of [[], [{ ...line, pricingMode: "sub_vendor" }], [{ ...line, id: "new-id", pricingMode: "in_house" }]]) {
      expect(() => assertEstimatePricingModeChanges(sales, post, project, lines)).toThrow(expect.objectContaining({ code: "ESTIMATE_PRICING_MODE_FORBIDDEN" }));
    }
    expect(() => assertEstimatePricingModeChanges(designer, post, project, [{ ...line, pricingMode: "sub_vendor" }])).not.toThrow();
  });

  it("permits ordinary new default-priced items but prevents selecting another mode after handoff", () => {
    const newLine = { ...line, id: "new-line", mainLineId: "different-main", pricingMode: "sub_vendor" };
    expect(() => assertEstimatePricingModeChanges(sales, estimate("post"), project, [line, newLine])).not.toThrow();
    expect(() => assertEstimatePricingModeChanges(sales, estimate("post"), project, [line, { ...newLine, pricingMode: "pmc" }]))
      .toThrow(expect.objectContaining({ code: "ESTIMATE_PRICING_MODE_FORBIDDEN" }));
  });

  it("does not change legacy workflow policy", () => {
    expect(() => assertEstimatePricingModeChanges(sales, { ...estimate("post"), estimation: undefined }, null, [])).not.toThrow();
  });
});
