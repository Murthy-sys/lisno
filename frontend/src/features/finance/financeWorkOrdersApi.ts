import { apiClient } from "../../api/client";

export interface FinanceWorkOrderSummary {
  id: string; orderNumber: string; vendorName: string; netPaise: number; gstPaise: number;
  totalPaise: number; approvedAt: string; assessmentStatus: "pending" | "reviewed";
  assessmentVersion: number;
}

export interface FinanceInvoiceAssessment {
  orderId: string; version: number; revisionId: string; invoiceNumber: string; invoiceDate: string;
  invoiceEvidenceReference: string; invoiceTotalPaise: number; tdsBasisPaise: number;
  tdsRateBasisPoints: number; tdsPaise: number; netPayablePaise: number;
  withholdingEffectiveDate: string; withholdingRuleReference: string; reason: string;
  assessedAt: string; assessedById: string;
}

export interface FinanceWorkOrderAssessmentRead {
  order: { id: string; orderNumber: string; projectId: string; vendorName: string;
    netPaise: number; gstPaise: number; totalPaise: number };
  assessment: FinanceInvoiceAssessment | null;
}

export const financeWorkOrderKeys = {
  list: (projectId: string, offset: number) => ["finance", "work-orders", projectId, offset] as const,
  assessment: (orderId: string) => ["finance", "work-order-assessment", orderId] as const
};

export function listFinanceWorkOrders(projectId: string, offset: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20", offset: String(offset) });
  return apiClient.get<{ items: FinanceWorkOrderSummary[]; total: number; limit: number; offset: number }>(
    `/finance/projects/${encodeURIComponent(projectId)}/work-orders?${query}`, { signal, showGlobalLoader: false }
  );
}

export function getFinanceWorkOrderAssessment(orderId: string, signal?: AbortSignal) {
  return apiClient.get<FinanceWorkOrderAssessmentRead>(
    `/finance/work-orders/${encodeURIComponent(orderId)}/invoice-assessment`, { signal, showGlobalLoader: false }
  );
}

export function saveFinanceWorkOrderAssessment(orderId: string, input: {
  expectedVersion: number; idempotencyKey: string; invoiceNumber: string; invoiceDate: string;
  invoiceEvidenceReference: string; invoiceTotalPaise: number; tdsBasisPaise: number;
  tdsRateBasisPoints: number; withholdingEffectiveDate: string;
  withholdingRuleReference: string; reason: string;
}) {
  return apiClient.post<FinanceInvoiceAssessment>(
    `/finance/work-orders/${encodeURIComponent(orderId)}/invoice-assessment`, input
  );
}
