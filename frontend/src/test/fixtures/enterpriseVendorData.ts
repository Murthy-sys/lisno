import type { ExecutionHistoryEvent, ExecutionWork } from "../../features/execution/executionApi";
import { executionFixture } from "../../features/execution/executionTestFixtures";
import type { VendorWorkTask } from "../../features/vendor/vendorWorkApi";

/** Synthetic vendor states used by the local enterprise QA page only. */
export function enterpriseVendorWork(route: string): ExecutionWork {
  const state = new URLSearchParams(route.split("?")[1]).get("qaVendorState");
  const work = structuredClone(executionFixture);
  const verification = { id: "verification-one", verifiedAt: "2026-10-09T10:00:00Z", verifiedById: "manager-one", executionRound: 1 };
  const submission = { id: "submission-one", submittedAt: "2026-10-09T08:00:00Z", note: "Issued scope completed and ready for checking.", imageIds: [], version: 5 };
  const completed = { ...work, progress: 100, latestReportAt: "2026-10-09T07:00:00Z", latestNote: submission.note,
    latestVendorReport: { ...work.latestVendorReport!, progress: 100, reportedAt: "2026-10-09T07:00:00Z", note: submission.note } };
  const notDue = { ...work.daily, state: "not_due" as const, dueAt: null };
  switch (state) {
    case "setup": return { ...work, tracking: "setup_required", status: "assigned", progress: 0, acknowledgedAt: null, schedule: null, latestVendorReport: null, latestReportAt: null, latestNote: "", daily: notDue, allowedActions: [], nextOwner: "site_manager", flags: ["setup_required"] };
    case "acknowledge": return { ...work, status: "assigned", progress: 0, acknowledgedAt: null, schedule: null, latestVendorReport: null, latestReportAt: null, latestNote: "", daily: notDue, allowedActions: ["acknowledge"] };
    case "schedule": return { ...work, status: "awaiting_schedule", progress: 0, schedule: null, proposedSchedule: { startDate: "2026-10-10", finishDate: "2026-10-20", reason: null }, latestVendorReport: null, latestReportAt: null, latestNote: "", daily: notDue, allowedActions: ["propose_schedule"], nextOwner: "site_manager" };
    case "blocked": return { ...work, status: "blocked", latestNote: "Project Manager is arranging access.", latestVendorReport: { ...work.latestVendorReport!, status: "blocked", note: "Unable to continue installation.", reason: "The work area is not accessible.", nextAction: "Project Manager to arrange access." }, flags: ["blocked"] };
    case "hold": return { ...work, hold: { reason: "Waiting for site clearance.", startedAt: "2026-10-09T09:00:00Z", reviewDate: "2026-10-12" }, daily: { ...notDue, state: "exempt" }, allowedActions: [], nextOwner: "site_manager" };
    case "reported": return { ...completed, allowedActions: ["report", "submit"], evidenceExemption: { reason: "Site photography is restricted.", grantedById: "manager-one" } };
    case "verification": return { ...completed, status: "awaiting_verification", submission, daily: notDue, allowedActions: [], nextOwner: "site_manager" };
    case "verified": return { ...completed, status: "site_verified", submission, verification, daily: notDue, allowedActions: [], canSubmitToClient: true, nextOwner: "client" };
    case "handoff": return { ...completed, status: "site_verified", submission, verification, daily: notDue, allowedActions: [], nextOwner: "client" };
    case "client": return { ...completed, status: "awaiting_client", legacyStatus: "submitted_for_client", submission, verification, daily: notDue, allowedActions: [] };
    case "accepted": return { ...completed, status: "client_approved", legacyStatus: "client_approved", submission, verification, daily: notDue, allowedActions: [], nextOwner: "none" };
    case "changes": return { ...work, status: "changes_requested", legacyStatus: "changes_requested", executionRound: 2, progress: 100, latestVendorReport: null, latestReportAt: null, latestNote: "Please correct the corner alignment.", allowedActions: ["report", "propose_schedule"] };
    case "legacy": return { ...work, tracking: "legacy_review", status: "awaiting_client", legacyStatus: "submitted_for_client", progress: 100, acknowledgedAt: null, schedule: null, latestVendorReport: null, latestReportAt: null, daily: notDue, allowedActions: [], nextOwner: "client" };
    case "superseded": return { ...work, status: "superseded", legacyStatus: "superseded", daily: notDue, allowedActions: [], nextOwner: "none" };
    default: return work;
  }
}

export function enterpriseVendorWorks(route: string): ExecutionWork[] {
  const work = enterpriseVendorWork(route);
  if (new URLSearchParams(route.split("?")[1]).get("qaVendorState") !== "identity") return [work];
  return [
    { ...work, projectNumber: "Lisno000011" },
    { ...work, id: "work-two", projectId: "project-two", projectNumber: "Lisno000027", orderId: "order-two", orderNumber: "PO-207", orderRevision: 3,
      lineId: "line-two", sourceLineItemKey: "source-two", roomName: "Upper floor guest bedroom and adjoining dressing area", quantityMilliUnits: 73000,
      schedule: { ...work.schedule!, finishDate: "2026-10-25" } }
  ];
}

export function enterpriseVendorReview(work: ExecutionWork): VendorWorkTask {
  return {
    id: work.id, projectId: work.projectId, vendorId: work.vendorId, orderId: work.orderId, orderRevision: work.orderRevision,
    lineId: work.lineId, sourceSectionId: "section-one", sourceLineItemKey: work.sourceLineItemKey, sectionLabel: "Carpentry",
    roomName: work.roomName, itemName: work.itemName, scopeType: "execution", description: work.description,
    targetDate: work.originalTargetDate, deliveryLocation: "Project site", status: work.legacyStatus as VendorWorkTask["status"],
    version: 9, progress: work.progress, displayProgress: work.progress, progressSource: "vendor", currentRound: 1,
    note: "Completed work for Client review.", requestedChangeReason: work.legacyStatus === "changes_requested" ? "Please correct the corner alignment." : null,
    imageCount: 0, submittedAt: ["submitted_for_client", "client_approved", "changes_requested"].includes(work.legacyStatus) ? "2026-10-09T11:00:00Z" : null,
    acceptedAt: work.legacyStatus === "client_approved" ? "2026-10-10T10:00:00Z" : null
  };
}

export function enterpriseVendorHistory(work: ExecutionWork) {
  const report = work.latestVendorReport;
  const items: ExecutionHistoryEvent[] = report ? [{
    id: report.eventId, assignmentId: work.id, action: "report", actorId: "vendor-user-one", occurredAt: report.reportedAt,
    executionRound: report.executionRound, localDate: "2026-10-08", note: report.note, reason: report.reason,
    nextAction: report.nextAction, startDate: null, finishDate: null, reviewDate: null, progress: report.progress, status: report.status
  }] : [];
  return { items, total: items.length, limit: 20, offset: 0 };
}

export function enterpriseVendorOrder(work: ExecutionWork) {
  return {
    id: work.orderId, orderNumber: work.orderNumber, projectId: work.projectId,
    vendor: { id: work.vendorId, code: "VEN-1", name: work.vendorName }, revision: work.orderRevision,
    approvedAt: "2026-10-01T00:00:00Z", terms: "Install at project site.",
    lines: [{ id: work.lineId, itemName: work.itemName, description: work.description, quantityMilliUnits: work.quantityMilliUnits,
      uomCode: work.uomCode, scopeType: work.scopeType, targetDate: work.originalTargetDate, deliveryLocation: "Project site", gstBasisPoints: 1800, totalPaise: 118000 }],
    totals: { netPaise: 100000, gstPaise: 18000, totalPaise: 118000 }
  };
}
