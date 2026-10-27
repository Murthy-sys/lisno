import { describe, expect, it } from "vitest";
import { nextEscalationStatus, nextSnagStatus, pmEscalationCreateSchema, pmSnagActionSchema, pmSnagVisitSchema, pmSnagQuerySchema } from "../src/domain/project-manager/client.js";

describe("PM client and snag transitions", () => {
  it("requires repair then a separate verification and explicit reopening", () => {
    expect(nextSnagStatus("open", "verify")).toBeNull();
    expect(nextSnagStatus("in_progress", "verify")).toBeNull();
    expect(nextSnagStatus("open", "resolve")).toBe("resolved");
    expect(nextSnagStatus("resolved", "verify")).toBe("verified");
    expect(nextSnagStatus("verified", "resolve")).toBeNull();
    expect(nextSnagStatus("verified", "reopen")).toBe("open");
    expect(nextSnagStatus("resolved", "reopen")).toBe("open");
    expect(nextSnagStatus("resolved", "assign")).toBe("resolved");
    expect(nextSnagStatus("verified", "assign")).toBeNull();
  });
  it("validates bounded snag filters and independent visit pagination", () => {
    expect(pmSnagQuerySchema.parse({ kind: "visits", roomId: "room-2", tradeId: "trade-1", vendorId: "vendor-1", status: "open", limit: "100", offset: "100" })).toMatchObject({ kind: "visits", roomId: "room-2", limit: 100, offset: 100 });
    expect(pmSnagQuerySchema.safeParse({ roomName: "Living" }).success).toBe(false);
    expect(pmSnagQuerySchema.safeParse({ status: "done" }).success).toBe(false);
  });
  it("prevents silently changing a resolved escalation", () => {
    expect(nextEscalationStatus("open", "pending")).toBe("pending");
    expect(nextEscalationStatus("pending", "follow_up")).toBe("pending");
    expect(nextEscalationStatus("pending", "resolve")).toBe("resolved");
    expect(nextEscalationStatus("resolved", "escalate")).toBeNull();
    expect(nextEscalationStatus("resolved", "reopen")).toBe("open");
  });
  it("rejects unversioned, reasonless and arbitrary property commands", () => {
    const valid = { expectedVersion: 2, idempotencyKey: "verify-snag-command", action: "verify", reason: "Inspected repaired joint" };
    expect(pmSnagActionSchema.safeParse(valid).success).toBe(true);
    expect(pmSnagActionSchema.safeParse({ ...valid, reason: "" }).success).toBe(false);
    expect(pmSnagActionSchema.safeParse({ ...valid, status: "verified" }).success).toBe(false);
    expect(pmEscalationCreateSchema.safeParse({ expectedVersion: 1, idempotencyKey: "new-escalation", title: "Delay", description: "Discuss revised timeline" }).success).toBe(false);
    expect(pmSnagVisitSchema.safeParse({ expectedVersion: 0, idempotencyKey: "new-visit", visitedAt: "yesterday", reason: "Inspected repair", snagIds: ["snag-a"] }).success).toBe(false);
  });
});
