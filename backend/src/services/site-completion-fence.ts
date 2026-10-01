import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";

export async function assertCompletionReviewAllowsOrderChanges(projectId: string, session: ClientSession): Promise<void> {
  // Both order writes and Site Manager submission write this project in their transactions.
  // A concurrent attempt must retry against the winning review/order snapshot.
  const fence = await ProjectModel.updateOne({ _id: projectId, status: "active" },
    { $inc: { siteCompletionFenceEpoch: 1 } }, { session, timestamps: false });
  if (fence.matchedCount !== 1) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE",
    "Completed or paused projects cannot change purchase orders.");
  const inReview = await SiteCompletionStateModel.exists({ _id: projectId,
    status: { $in: ["pending_client", "client_approved"] } }).session(session);
  if (inReview) throw new ApiError(409, "SITE_COMPLETION_IN_REVIEW",
    "The Client completion review must be returned to the Site Manager before purchase orders can change.");
}
