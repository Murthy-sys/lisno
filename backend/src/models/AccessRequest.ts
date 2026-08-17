import {
  REQUESTABLE_PROJECT_MODULES
} from "../domain/authorization.js";
import { model, models, Schema } from "./mongoose.js";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DECISION_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const accessRequestSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    requesterId: { type: String, ref: "User", required: true, immutable: true },
    projectId: {
      type: String,
      required: true,
      immutable: true,
      match: PROJECT_ID_PATTERN
    },
    module: {
      type: String,
      enum: REQUESTABLE_PROJECT_MODULES,
      required: true,
      immutable: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1000,
      immutable: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      required: true,
      default: "pending"
    },
    reviewerId: { type: String, ref: "User", default: null },
    decisionReason: { type: String, trim: true, maxlength: 1000, default: null },
    decisionFingerprint: {
      type: String,
      match: DECISION_FINGERPRINT_PATTERN,
      default: null
    },
    approvedGrantId: {
      type: String,
      ref: "ProjectAccessGrant",
      default: null
    },
    reviewedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true
  }
);

accessRequestSchema.pre("validate", function validateDecisionState() {
  const status = this.get("status");
  const reviewerId = this.get("reviewerId");
  const decisionReason = this.get("decisionReason");
  const decisionFingerprint = this.get("decisionFingerprint");
  const approvedGrantId = this.get("approvedGrantId");
  const reviewedAt = this.get("reviewedAt");
  if (status === "approved") {
    if (
      typeof reviewerId !== "string" ||
      decisionReason !== null ||
      typeof decisionFingerprint !== "string" ||
      typeof approvedGrantId !== "string" ||
      !(reviewedAt instanceof Date)
    ) {
      this.invalidate(
        "approvedGrantId",
        "Approved requests require reviewer, fingerprint, approvedGrantId, and reviewedAt only."
      );
    }
    return;
  }
  if (status === "rejected") {
    if (
      typeof reviewerId !== "string" ||
      typeof decisionReason !== "string" ||
      decisionReason.length === 0 ||
      typeof decisionFingerprint !== "string" ||
      approvedGrantId !== null ||
      !(reviewedAt instanceof Date)
    ) {
      this.invalidate(
        "approvedGrantId",
        "Rejected requests require reviewer, decision reason, fingerprint, and reviewedAt without approvedGrantId."
      );
    }
    return;
  }
  if (
    reviewerId !== null ||
    decisionReason !== null ||
    decisionFingerprint !== null ||
    approvedGrantId !== null ||
    reviewedAt !== null
  ) {
    this.invalidate(
      "approvedGrantId",
      "Pending and cancelled requests cannot contain review decision metadata."
    );
  }
});

accessRequestSchema.index(
  { requesterId: 1, projectId: 1, module: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
accessRequestSchema.index({ requesterId: 1, createdAt: -1, _id: -1 });
accessRequestSchema.index({ status: 1, createdAt: -1, _id: -1 });
accessRequestSchema.index({ projectId: 1, status: 1, createdAt: -1, _id: -1 });

export const AccessRequestModel =
  models.AccessRequest ?? model("AccessRequest", accessRequestSchema);
