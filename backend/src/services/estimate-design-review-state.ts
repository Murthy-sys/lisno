import type { ClientSession } from "mongoose";

import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";

const reviewStates = [
  "estimator_review",
  "submitted",
  "changes_requested",
  "approved"
] as const;

/**
 * Keeps the upload/job aggregates aligned with a plan-wide review decision.
 * Both the original upload and any replacement upload that supplies a current
 * revision are included so a Designer can safely start the next revision.
 */
export async function synchronizeEstimateDesignReviewState(
  estimateId: string,
  status: "submitted" | "changes_requested" | "approved",
  session: ClientSession
) {
  const drawings = await EstimateDesignDrawingModel.find({
    estimateId,
    active: true
  }).session(session).lean();
  const uploadIds = new Set(drawings.map((drawing) => String(drawing.uploadId)));

  for (const drawing of drawings) {
    const revision = await EstimateDesignRevisionModel.findOne({
      drawingId: drawing._id
    }).sort({ revisionNumber: -1 }).session(session).lean();
    if (!revision) continue;
    const page = await EstimateDesignSourcePageModel.findById(
      revision.sourcePageId
    ).session(session).lean();
    if (page) uploadIds.add(String(page.uploadId));
  }

  if (uploadIds.size === 0) return;
  const ids = [...uploadIds];
  await EstimateDesignUploadModel.updateMany(
    {
      _id: { $in: ids },
      estimateId,
      extractionStatus: { $in: reviewStates }
    },
    { $set: { extractionStatus: status } },
    { session }
  );
  await EstimateDesignExtractionJobModel.updateMany(
    {
      uploadId: { $in: ids },
      status: { $in: reviewStates }
    },
    { $set: { status } },
    { session }
  );
}
