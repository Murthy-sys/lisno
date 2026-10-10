import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";

/** Read-only rollout inventory. Output deliberately contains counts, never identities/contact details. */
export async function vendorExecutionInventory() {
  const counts = { assignments: 0, open: 0, pendingClientReview: 0, clientAccepted: 0,
    tracked: 0, setupRequired: 0, missingIssuedSource: 0, missingVendorContact: 0, missingSiteManager: 0 };
  const cursor = VendorWorkAssignmentModel.find({ status: { $ne: "superseded" } }).lean().cursor();
  for await (const row of cursor) {
    counts.assignments++;
    if (row.status === "submitted_for_client") counts.pendingClientReview++;
    else if (row.status === "client_approved") counts.clientAccepted++;
    else counts.open++;
    const [state, order, revision, vendor, owners] = await Promise.all([
      VendorExecutionStateModel.exists({ _id: row._id }),
      ProjectPurchaseOrderModel.exists({ _id: row.orderId, projectId: row.projectId, vendorId: row.vendorId, approvedRevision: row.orderRevision, cancelledAt: null, status: { $ne: "cancelled" } }),
      ProjectPurchaseOrderRevisionModel.exists({ orderId: row.orderId, projectId: row.projectId, vendorId: row.vendorId, revision: row.orderRevision, "lines.id": row.lineId }),
      AiEstimatorKnowledgeVendorModel.findById(row.vendorId).select({ procurementProfile: 1 }).lean(),
      ProjectWorkflowTaskModel.countDocuments({ projectId: row.projectId, kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: { $nin: [null, ""] } })
    ]);
    if (state) counts.tracked++;
    else if (!["submitted_for_client", "client_approved"].includes(row.status)) counts.setupRequired++;
    if (!order || !revision) counts.missingIssuedSource++;
    if (!vendor?.procurementProfile?.email || !vendor.procurementProfile.phoneNumber) counts.missingVendorContact++;
    if (owners !== 1) counts.missingSiteManager++;
  }
  return counts;
}
