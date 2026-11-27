import { describe, expect, it } from "vitest";
import type { LifecycleItem } from "../src/contracts/procurement-lifecycle.js";
import { priorUncheckedItemIds, procurementProgressCommandSchema, reviewDueAfter, reviewMemberDigest } from "../src/domain/procurement-progress.js";

const item = (id: string, priority: LifecycleItem["priority"]) => ({ id, priority, itemName: "Repeated name", roomId: id } as LifecycleItem);
const observation = { checkedAt: "2026-11-27T06:00:00Z", status: "blocked", notes: "Waiting for dimensions", nextAction: "Measure opening", nextCheckDate: "2026-12-01" };
const command = { action: "check", expectedVersion: 1, sourceDigest: "a".repeat(64), idempotencyKey: "progress-domain-key", roundId: "round-1", itemId: "item-1", observation };
describe("Procurement review rules", () => {
  it("requires recovery ownership for blocked and delayed observations", () => {
    expect(procurementProgressCommandSchema.safeParse(command).success).toBe(false);
    expect(procurementProgressCommandSchema.safeParse({ ...command, observation: { ...observation, delayReason: "Opening size changed", responsibleParty: "Assigned vendor", recoveryAction: "Measure on site", recoveryDate: "2026-11-30" } }).success).toBe(true);
    expect(procurementProgressCommandSchema.safeParse({ ...command, observation: { ...observation, status: "in_progress", delayed: true } }).success).toBe(false);
  });
  it("gates checks by stable item identity and skips empty priority groups", () => {
    const items = [item("room-a", "P1"), item("room-b", "P1"), item("room-c", "P3")];
    expect(priorUncheckedItemIds(items, new Set(["room-a"]), "room-c")).toEqual(["room-b"]);
    expect(priorUncheckedItemIds(items, new Set(["room-a", "room-b"]), "room-c")).toEqual([]);
  });
  it("requires reasoned forecasts and consistent percentages", () => {
    expect(procurementProgressCommandSchema.safeParse({ ...command, observation: { ...observation, status: "completed", progress: 40 } }).success).toBe(false);
    expect(procurementProgressCommandSchema.safeParse({ ...command, observation: { ...observation, status: "in_progress", forecastDate: "2026-12-10" } }).success).toBe(false);
  });
  it("uses local calendar days across DST and preserves source binding across vendor reports", () => {
    expect(reviewDueAfter(new Date("2026-03-06T15:00:00Z"), 7, "America/New_York").toISOString()).toBe("2026-03-13T14:00:00.000Z");
    const before = { ...item("room-a", "P1"), vendorProgress: 10, vendorNote: "Started", vendorStatus: "in_progress" };
    expect(reviewMemberDigest({ ...before, vendorProgress: 90, vendorNote: "Nearly done" })).toBe(reviewMemberDigest(before));
    expect(reviewMemberDigest({ ...before, priority: "P3" })).not.toBe(reviewMemberDigest(before));
  });
});
