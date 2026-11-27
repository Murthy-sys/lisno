import type { PaymentOrder, PaymentOrdersPage, ProcurementPaymentAction } from "./lifecycleApi";

/** Synthetic contracts used by the rendered regression and browser checks. */
export function paymentOrderFixture(actions: ProcurementPaymentAction[] = ["propose_dates", "record", "request_correction"]): PaymentOrder {
  return {
    id: "order-a", projectId: "project-a", vendorId: "vendor-a", vendorName: "Synthetic Joinery", orderNumber: "PO-104",
    orderRevisionId: "issued-revision-a", version: 2, sourceDigest: "a".repeat(64), sourceAvailable: true, openingConfirmed: true,
    openingReconciliation: { id: "opening-a", balances: [{ milestoneId: "advance", amountPaise: 20000 }, { milestoneId: "final", amountPaise: 0 }] },
    timezone: "Asia/Kolkata", contractGrossPaise: 100000, authorizedGrossPaise: 100000, withholdingPaise: 2000,
    authorizedNetPaise: 98000, paidPaise: 20000, remainingPaise: 78000, authorizationId: "authorization-a", authorizationBasis: "invoice",
    assessment: { revisionId: "invoice-a", invoiceTotalPaise: 100000, tdsPaise: 2000, netPayablePaise: 98000 },
    milestones: [{ id: "advance", name: "Advance", contractGrossPaise: 50000, originalDueDate: "2026-11-20", dueDate: "2026-11-20", proposedDueDate: null,
      authorizedGrossPaise: 50000, withholdingPaise: 1000, authorizedNetPaise: 49000, paidPaise: 20000, remainingPaise: 29000,
      readiness: "ready", timing: "overdue", certificationId: "cert-a", certificationStatus: "certified", certificationToken: "token-a", retention: null, blockers: [] },
    { id: "final", name: "Final", contractGrossPaise: 50000, originalDueDate: "2026-12-10", dueDate: "2026-12-10", proposedDueDate: null,
      authorizedGrossPaise: 50000, withholdingPaise: 1000, authorizedNetPaise: 49000, paidPaise: 0, remainingPaise: 49000,
      readiness: "ready", timing: "upcoming", certificationId: "cert-b", certificationStatus: "certified", certificationToken: "token-b", retention: null, blockers: [] }],
    blockers: [], corrections: [], allowedActions: actions
  };
}
export function paymentPageFixture(order = paymentOrderFixture()): PaymentOrdersPage {
  return { projectId: order.projectId, serverNow: "2026-11-27T06:00:00Z", items: [order], total: 1, limit: 20, offset: 0, availableVendors: [{ id: order.vendorId, name: order.vendorName }, { id: "vendor-b", name: "Synthetic Stone" }] };
}
