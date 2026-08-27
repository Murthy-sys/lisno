import { PROJECT_MODULES } from "../domain/authorization.js";
import { model, models, Schema } from "./mongoose.js";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const projectAccessGrantSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    projectId: {
      type: String,
      required: true,
      immutable: true,
      match: PROJECT_ID_PATTERN
    },
    userId: { type: String, ref: "User", required: true, immutable: true },
    module: {
      type: String,
      enum: PROJECT_MODULES,
      required: true,
      immutable: true
    },
    source: {
      type: String,
      enum: ["access_request", "direct_assignment", "admin_initiator"],
      required: true,
      immutable: true
    },
    accessRequestId: {
      type: String,
      ref: "AccessRequest",
      default: null,
      immutable: true
    },
    grantedById: { type: String, ref: "User", required: true, immutable: true },
    active: { type: Boolean, required: true, default: true },
    grantedAt: { type: Date, required: true, immutable: true },
    revokedAt: { type: Date, default: null },
    revokedById: { type: String, ref: "User", default: null },
    revocationReason: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 1000,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true
  }
);

projectAccessGrantSchema.pre("validate", function validateGrantState() {
  const source = this.get("source");
  const accessRequestId = this.get("accessRequestId");
  if (
    (source === "access_request" && typeof accessRequestId !== "string") ||
    (source !== "access_request" && accessRequestId !== null)
  ) {
    this.invalidate(
      "accessRequestId",
      "accessRequestId is required only for access_request grants."
    );
  }
  const active = this.get("active");
  const revokedAt = this.get("revokedAt");
  const revokedById = this.get("revokedById");
  const revocationReason = this.get("revocationReason");
  const hasCompleteRevocation =
    revokedAt instanceof Date &&
    typeof revokedById === "string" &&
    typeof revocationReason === "string" &&
    revocationReason.length > 0;
  if (
    (active &&
      (revokedAt !== null || revokedById !== null || revocationReason !== null)) ||
    (!active && !hasCompleteRevocation)
  ) {
    this.invalidate(
      "revocationReason",
      "Inactive grants require complete revocation metadata; active grants require none."
    );
  }
});

projectAccessGrantSchema.index(
  { userId: 1, projectId: 1, module: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);
projectAccessGrantSchema.index(
  { accessRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { accessRequestId: { $type: "string" } }
  }
);
projectAccessGrantSchema.index({ userId: 1, module: 1, active: 1, projectId: 1 });
projectAccessGrantSchema.index({ projectId: 1, source: 1, active: 1, userId: 1 });

export const ProjectAccessGrantModel =
  models.ProjectAccessGrant ??
  model("ProjectAccessGrant", projectAccessGrantSchema);
