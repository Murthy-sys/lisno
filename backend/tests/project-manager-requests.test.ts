import { describe, expect, it } from "vitest";
import { pmRequestActionSchema, requestTransition, supplyComplete, supplyRequiredReviewers } from "../src/domain/project-manager/requests.js";

describe("Project Manager operational boundaries", () => {
  it("keeps PM awareness separate from Procurement fulfillment and design decisions", () => {
    expect(requestTransition("selection", "open", "acknowledge", "site_manager")).toBe("acknowledged");
    expect(() => requestTransition("selection", "open", "fulfill", "site_manager")).toThrow("cannot decide");
    expect(() => requestTransition("procurement", "open", "fulfill", "site_manager")).toThrow("Procurement owner");
    expect(requestTransition("procurement", "acknowledged", "fulfill", "procurement")).toBe("fulfilled");
    expect(() => requestTransition("procurement", "fulfilled", "acknowledge", "procurement")).toThrow("closed");
  });
  it("requires every current reviewer and never treats a lone PM signature as dual sign-off", () => {
    expect(supplyRequiredReviewers("pm-a", ["designer-b", "designer-a", "designer-a"])).toEqual(["designer-a", "designer-b", "pm-a"]);
    expect(supplyComplete(["pm-a", "designer-a"], ["pm-a"])).toBe(false);
    expect(supplyComplete(["pm-a", "designer-a"], ["pm-a", "designer-a"])).toBe(true);
    expect(supplyComplete([], [])).toBe(false);
    expect(supplyRequiredReviewers("pm-a", [])).toEqual([]);
  });
  it("requires exact fulfillment references and rejects unused arbitrary fields", () => {
    const input = { expectedVersion: 1, idempotencyKey: "operation-1", sourceToken: "a".repeat(64), action: "fulfill", reason: "Created material record" };
    expect(pmRequestActionSchema.safeParse(input).success).toBe(false);
    expect(pmRequestActionSchema.safeParse({ ...input, artifact: { kind: "procurement_item", id: "item-a" } }).success).toBe(true);
    expect(pmRequestActionSchema.safeParse({ ...input, action: "approve", paid: true }).success).toBe(false);
  });
});
