import { describe, expect, it } from "vitest";
import {
  calculatePurchaseOrderLine, calculatePurchaseOrderTotals,
  purchaseOrderDecisionSchema, purchaseOrderDraftSchema, purchaseOrderSubmitSchema
} from "../src/domain/project-purchase-order.js";

const validLine = {
  procurementItemId: "procurement-item-a", quantityMilliUnits: 1_250,
  unitPricePaise: 101, gstBasisPoints: 1_800,
  scopeType: "execution" as const, description: "Joinery installation",
  targetDate: "2026-10-31", deliveryLocation: "Site A"
};

describe("project purchase order domain", () => {
  it("rounds unit quantity and GST at the line boundary using integer paise", () => {
    // 1.25 × 101 paise = 126.25, rounded to 126; 18% GST = 22.68, rounded to 23.
    expect(calculatePurchaseOrderLine(validLine)).toEqual({ netPaise: 126, gstPaise: 23, totalPaise: 149 });
    expect(calculatePurchaseOrderTotals([
      { netPaise: 126, gstPaise: 23, totalPaise: 149 },
      { netPaise: 5, gstPaise: 1, totalPaise: 6 }
    ])).toEqual({ netPaise: 131, gstPaise: 24, totalPaise: 155 });
  });

  it("rejects duplicate procurement children in one order and unsafe money", () => {
    expect(purchaseOrderDraftSchema.safeParse({ vendorId: "vendor-a", lines: [validLine, validLine], terms: "Delivery included", idempotencyKey: "request-123" }).success).toBe(false);
    expect(() => calculatePurchaseOrderLine({ ...validLine, unitPricePaise: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
    expect(() => calculatePurchaseOrderLine({ ...validLine, quantityMilliUnits: 1.2 })).toThrow(RangeError);
  });

  it("requires versioned idempotent submissions and reasoned adverse decisions", () => {
    expect(purchaseOrderSubmitSchema.safeParse({ expectedVersion: 2, idempotencyKey: "request-123" }).success).toBe(true);
    expect(purchaseOrderSubmitSchema.safeParse({ expectedVersion: 0, idempotencyKey: "x" }).success).toBe(false);
    expect(purchaseOrderDecisionSchema.safeParse({ expectedVersion: 3, submittedRevisionId: "revision-a", idempotencyKey: "request-124", decision: "request_changes", reason: null }).success).toBe(false);
    expect(purchaseOrderDecisionSchema.safeParse({ expectedVersion: 3, submittedRevisionId: "revision-a", idempotencyKey: "request-124", decision: "approve", reason: null }).success).toBe(true);
  });
});
