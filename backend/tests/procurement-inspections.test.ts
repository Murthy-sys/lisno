import { describe, expect, it } from "vitest";
import { chooseInspectionInstant, procurementInspectionPlanSchema, procurementInspectionRecordSchema } from "../src/domain/procurement-inspections.js";
const base = { expectedVersion: 0, sourceDigest: "a".repeat(64), idempotencyKey: "inspection-domain-key" };
const windows = [
  { id: "morning", startsAt: "2026-11-27T07:00:00Z", endsAt: "2026-11-27T08:00:00Z" },
  { id: "afternoon", startsAt: "2026-11-27T09:00:00Z", endsAt: "2026-11-27T10:00:00Z" }
];
describe("Project inspection planning rules", () => {
  it("supports distinct windows on the same day but rejects overlap and mismatched quota", () => {
    const input = { ...base, count: 2, windows, reason: "One-day installation" };
    expect(procurementInspectionPlanSchema.safeParse(input).success).toBe(true);
    expect(procurementInspectionPlanSchema.safeParse({ ...input, count: 3 }).success).toBe(false);
    expect(procurementInspectionPlanSchema.safeParse({ ...input, windows: [windows[0], { ...windows[1], startsAt: windows[0]!.endsAt }] }).success).toBe(false);
  });
  it("draws within inclusive windows and rejects malformed randomness", () => {
    expect(chooseInspectionInstant(windows[0]!, () => 0)).toBe("2026-11-27T07:00:00.000Z");
    expect(chooseInspectionInstant(windows[0]!, () => 0.5)).toBe("2026-11-27T07:30:00.000Z");
    expect(() => chooseInspectionInstant(windows[0]!, () => 1)).toThrow(RangeError);
  });
  it("requires visit notes, distinct coverage, and complete delay recovery details", () => {
    const input = { ...base, visitId: "visit-1", slotId: null, inspectedAt: "2026-11-27T07:30:00Z", itemIds: ["item-1"], notes: "Checked fitting" };
    expect(procurementInspectionRecordSchema.safeParse(input).success).toBe(true);
    expect(procurementInspectionRecordSchema.safeParse({ ...input, notes: " " }).success).toBe(false);
    expect(procurementInspectionRecordSchema.safeParse({ ...input, itemIds: ["item-1", "item-1"] }).success).toBe(false);
    expect(procurementInspectionRecordSchema.safeParse({ ...input, delayed: true }).success).toBe(false);
  });
});
