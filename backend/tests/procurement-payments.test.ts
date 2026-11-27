import { describe, expect, it } from "vitest";
import { allocationTotal, normalizedPaymentReference, paymentCommandSchema, paymentMoney, paymentTiming } from "../src/domain/procurement-payments.js";
import { lcLocalDate } from "../src/domain/procurement-lifecycle.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../src/domain/project-finance.js";

describe("payment amounts, dates and command contracts", () => {
  it("rejects fractional, negative and unsupported money and prevents summed integer overflow", () => {
    for (const value of [-1, 0.5, Infinity, NaN, MAX_FINANCE_AMOUNT_PAISE + 1]) expect(paymentMoney.safeParse(value).success).toBe(false);
    expect(() => allocationTotal([{ milestoneId: "a", amountPaise: Number.MAX_SAFE_INTEGER }, { milestoneId: "b", amountPaise: 1 }])).toThrow();
  });
  it("uses the project local calendar and separates settlement from zero-value milestones", () => {
    const today = lcLocalDate(new Date("2026-11-26T18:31:00Z"), "Asia/Kolkata");
    expect(today).toBe("2026-11-27");
    expect(paymentTiming("2026-11-26", today, 10, 100)).toBe("overdue");
    expect(paymentTiming(today, today, 10, 100)).toBe("due_today");
    expect(paymentTiming(null, today, 0, 100)).toBe("paid");
    expect(paymentTiming(null, today, null, 0)).toBe("no_payment_required");
    expect(normalizedPaymentReference("  bank   Ref-a  ")).toBe("BANK REF-A");
  });
  it("rejects duplicate allocations, impossible dates and client-injected authority", () => {
    const base = { orderId: "order", expectedVersion: 0, sourceDigest: "a".repeat(64), idempotencyKey: "payment-test-key" };
    expect(paymentCommandSchema.safeParse({ ...base, action: "confirm_dates", dates: [{ milestoneId: "advance", dueDate: "2026-02-30" }], reason: "Confirmed terms" }).success).toBe(false);
    expect(paymentCommandSchema.safeParse({ ...base, action: "record", transactionId: "payment", amountPaise: 2, allocations: [{ milestoneId: "advance", amountPaise: 1 }, { milestoneId: "advance", amountPaise: 1 }], paidAt: "2026-11-27T00:00:00Z", method: "upi", reference: "ref", evidenceIds: ["proof"] }).success).toBe(false);
    expect(paymentCommandSchema.safeParse({ ...base, action: "reverse", transactionId: "payment", reason: "Correction reason", actorId: "someone-else" }).success).toBe(false);
  });
});
