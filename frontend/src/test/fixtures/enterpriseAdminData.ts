// Synthetic records reused from features/admin/AdminProjectDetailPage.test.tsx. No runtime test imports.
import type { PermissionCode } from "../../api/authorization-contract";

import type { ProjectFinanceBucket } from "../../api/types";

export const project = {
  id: "project-1",
  name: "Asha home",
  status: "planning",
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: { id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example" },
  lead: {
    id: "lead-1",
    stage: "site_visit",
    nextAction: "Share measurements",
    nextActionAt: "2026-08-25T05:00:00.000Z"
  },
  estimate: { id: "estimate-1", status: "draft", total: 975000 },
  createdAt: "2026-08-23T10:00:00.000Z"
};

export const approvedPendingProject = {
  ...project,
  id: "project-murthy",
  name: "murthy-1",
  lead: {
    ...project.lead,
    stage: "won",
    nextAction: "Assign Designer for design plan"
  },
  estimate: {
    id: "estimate-murthy",
    leadId: "lead-1",
    projectId: "project-murthy",
    resolvedProjectId: "project-murthy",
    projectLinkSource: "estimate_and_lead",
    version: 5,
    status: "client_approved",
    subtotal: 236_190,
    gst: 42_514,
    total: 278_704,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 4,
      reviewRoundId: "estimate-review-murthy",
      subtotal: 236_190,
      gst: 42_514,
      total: 278_704,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesigner: null,
    clientReview: null,
    hasPendingClientResponseTask: false
  }
};

export const approvedPendingBucket: ProjectFinanceBucket = {
  id: "finance-bucket-project-murthy",
  projectId: "project-murthy",
  projectName: "murthy-1",
  projectStatus: "planning",
  estimateId: "estimate-murthy",
  estimateVersion: 4,
  estimateReviewRoundId: "estimate-review-murthy",
  designPlanVersion: 0,
  currency: "INR",
  approvedSubtotalPaise: 23_619_000,
  approvedGstPaise: 4_251_400,
  approvedContractTotalPaise: 27_870_400,
  targetMarginBps: 2_000,
  targetProfitPaise: 4_723_800,
  costBudgetPaise: 18_895_200,
  procurementCostPaise: 0,
  employeePaymentPaise: 0,
  otherExpensePaise: 0,
  directSpendPaise: 0,
  overheadPaise: 0,
  recordedCostPaise: 0,
  remainingBudgetPaise: 18_895_200,
  currentProfitPaise: 23_619_000,
  currentMarginBps: 10_000,
  overBudget: false,
  deadlineAt: "2026-11-22T10:00:00.000Z",
  overdueDays: 0,
  deadlineStatus: "on_track",
  overdueTaskCount: 0,
  status: "pending_design",
  version: 1,
  openedAt: null,
  closedAt: null,
  createdAt: "2026-08-24T09:00:00.000Z",
  updatedAt: "2026-08-24T09:00:00.000Z"
};
