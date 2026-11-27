import type { LifecycleBlocker, LifecycleCommand, LifecyclePage } from "./procurement-lifecycle.js";

export type ProcurementPaymentAction = "propose_dates" | "confirm_dates" | "authorize" | "record" | "reverse" | "request_correction" | "resolve_correction" | "reconcile" | "approve_retention" | "acknowledge_retention";
export interface PaymentAllocation { milestoneId: string; amountPaise: number; }
export interface PaymentAuthorizationAllocation { milestoneId: string; grossPaise: number; withholdingPaise: number; netPaise: number; }
export interface PaymentMilestone {
  id: string; name: string; contractGrossPaise: number; originalDueDate: string | null; dueDate: string | null; proposedDueDate: string | null;
  authorizedGrossPaise: number | null; withholdingPaise: number | null; authorizedNetPaise: number | null; paidPaise: number | null; remainingPaise: number | null;
  readiness: "setup_required" | "awaiting_certification" | "awaiting_finance" | "ready" | "no_payment_required";
  timing: "unscheduled" | "upcoming" | "due_today" | "overdue" | "paid" | "no_payment_required";
  certificationId: string | null; certificationStatus: string; certificationToken: string | null;
  retention: { id: string; amountPaise: number; remainingPaise: number; dueDate: string; ownerId: string; approvedAt: string; acknowledgedAt: string | null } | null;
  blockers: LifecycleBlocker[];
}
export interface PaymentOrder {
  id: string; projectId: string; vendorId: string; vendorName: string; orderNumber: string; orderRevisionId: string | null;
  version: number; sourceDigest: string; sourceAvailable: boolean; openingConfirmed: boolean; timezone: string;
  openingReconciliation: { id: string; balances: PaymentAllocation[] } | null;
  contractGrossPaise: number; authorizedGrossPaise: number | null; withholdingPaise: number | null; authorizedNetPaise: number | null;
  paidPaise: number | null; remainingPaise: number | null; authorizationId: string | null; authorizationBasis: "invoice" | "advance" | null;
  assessment: { revisionId: string; invoiceTotalPaise: number; tdsPaise: number; netPayablePaise: number } | null;
  milestones: PaymentMilestone[]; blockers: LifecycleBlocker[]; allowedActions: ProcurementPaymentAction[];
  corrections: Array<{ id: string; transactionId: string; reason: string; requestedAt: string; requestedById: string; status: "pending" | "resolved" | "rejected"; resolution: { reason: string; actorId: string; at: string } | null }>;
}
export interface PaymentOrdersPage extends LifecyclePage<PaymentOrder> { projectId: string; serverNow: string; availableVendors: Array<{ id: string; name: string }>; }
export interface PaymentTransactionHistory {
  id: string; orderId: string; vendorId: string; kind: "payment" | "reversal" | "opening_reconciliation";
  amountPaise: number; allocations: PaymentAllocation[]; paidAt: string | null; recordedAt: string; actorId: string; actorName?: string | null;
  method: string | null; reference: string | null; note: string | null; evidenceIds: string[]; relatedTransactionId: string | null;
  reversed: boolean;
  supersedesReconciliationId?: string | null;
}
export interface PaymentHistoryPage extends LifecyclePage<PaymentTransactionHistory> { projectId: string; }
export interface PaymentAlertSource {
  id: string; projectId: string; orderId: string; milestoneId: string | null; vendorId: string; vendorName: string;
  title: string; dueDate: string | null; remainingPaise: number | null; timezone: string; kind: "payment" | "payment_setup" | "payment_correction";
  blockers: LifecycleBlocker[];
}
export interface PaymentCommandBase extends LifecycleCommand { orderId: string; action: ProcurementPaymentAction; }
