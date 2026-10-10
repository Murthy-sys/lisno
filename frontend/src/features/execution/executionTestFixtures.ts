import type { ExecutionCounts, ExecutionPage, ExecutionWork } from "./executionApi";
export const executionFixture: ExecutionWork = {
  id: "work-one", timezone: "Asia/Kolkata", projectId: "project-one", projectName: "Oak residence", vendorId: "vendor-one", vendorName: "Oak Works",
  orderId: "order-one", orderNumber: "PO-100", orderRevision: 2, lineId: "line-one", sourceLineItemKey: "source-one",
  itemName: "Oak wall panelling", roomName: "Living room", description: "Install wall panelling to the issued scope.", scopeType: "execution",
  mainBasketId: "basket-one", mainBasketName: "Carpentry", subBasketId: "sub-one", subBasketName: "Wall finishes", mainLineId: "main-one", sourceAvailable: true,
  quantityMilliUnits: 125000, uomCode: "sq-ft", originalTargetDate: "2026-10-20", tracking: "tracked", legacyStatus: "in_progress", version: 4, executionRound: 1,
  status: "in_progress", progress: 40, latestNote: "Frame installed", latestReportAt: "2026-10-08T07:00:00Z", acknowledgedAt: "2026-10-06T06:00:00Z",
  latestVendorReport: { eventId: "report-one", executionRound: 1, reportedAt: "2026-10-08T07:00:00Z", note: "Frame installed", reason: null, nextAction: null, progress: 40, status: "in_progress" },
  proposedSchedule: null, schedule: { startDate: "2026-10-07", finishDate: "2026-10-18", revision: 1, confirmedAt: "2026-10-06T08:00:00Z", confirmedById: "site-one" },
  reportingStartsOn: "2026-10-07", hold: null, submission: null, verification: null, evidenceExemption: null, imageIds: [], canSubmitToClient: false,
  daily: { localDate: "2026-10-08", dueAt: "2026-10-08T12:30:00Z", state: "due", reportedAt: null }, flags: [], nextOwner: "vendor", allowedActions: ["report","propose_schedule"]
};
export const executionCountsFixture: ExecutionCounts = { total: 1, open: 1, reported: 0, verified: 0, clientAccepted: 0, missing: 0, blocked: 0, overdue: 0, awaitingVerification: 0, setupRequired: 0 };
export function executionPageFixture(items: ExecutionWork[] = [executionFixture]): ExecutionPage {
  return { project: { id: "project-one", name: "Oak residence", status: "active", completionAuthority: "vendor_client" }, projectCounts: executionCountsFixture, items, total: items.length, limit: 25, offset: 0, counts: executionCountsFixture, policy: { projectId: "project-one", version: 2, timezone: "Asia/Kolkata", reminderTime: "09:00", deadlineTime: "18:00", escalationTime: "19:00", effectiveDate: "2026-10-08" }, canManagePolicy: false };
}
