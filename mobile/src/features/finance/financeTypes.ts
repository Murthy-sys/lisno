export interface Page<T> { items: T[]; pagination: { limit: number; offset: number; total: number; hasMore: boolean } }
export interface ProjectFinanceBucket {
  baselinePhase?: "pre" | "post";
  originalApprovedContractTotalPaise?: number;
  id: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  designPlanVersion: number;
  currency: "INR";
  approvedSubtotalPaise: number;
  approvedGstPaise: number;
  approvedContractTotalPaise: number;
  targetMarginBps: 2000;
  targetProfitPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudget: boolean;
  deadlineAt: string;
  overdueDays: number;
  deadlineStatus:
    | "on_track"
    | "overdue"
    | "completed_on_time"
    | "completed_late"
    | "completed_date_unknown";
  overdueTaskCount: number;
  status: "pending_design" | "open" | "closed";
  version: number;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFinancePortfolioSummary {
  projectCount: number;
  approvedContractTotalPaise: number;
  approvedGstPaise: number;
  approvedSubtotalPaise: number;
  targetProfitPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudgetProjectCount: number;
  overdueProjectCount: number;
  lateCompletedProjectCount: number;
  overdueTaskCount: number;
}

export interface FinanceLedgerEntry {
  id: string;
  bucketId: string;
  projectId: string;
  type: "direct_spend" | "overhead";
  expenseClass: "procurement" | "employee_payment" | "other" | null;
  category: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor: string | null;
  reference: string | null;
  sourceSectionId: string | null;
  sourceLineItemKey: string | null;
  /* Display names for the two identifiers above; render these, never the ids. */
  sourceSectionLabel: string | null;
  sourceLineItemLabel: string | null;
  supportingDocument: SupportingDocumentSummary | null;
  idempotencyKey: string;
  status: "posted" | "voided";
  version: number;
  createdById: string;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportingDocumentSummary {
  id: string;
  originalFilename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  createdAt: string;
}

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

