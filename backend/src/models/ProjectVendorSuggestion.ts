import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, required: true, immutable: true, ref: "Estimate" },
  estimateVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  designPlanVersion: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  scope: { type: String, enum: ["project", "main_line"], default: "project", immutable: true },
  sourcePhase: { type: String, enum: ["pre", "post", "legacy", null], default: null, immutable: true },
  sourceSnapshotId: { type: String, default: null, immutable: true },
  sourceDigest: { type: String, default: null, immutable: true, match: /^[a-f0-9]{64}$/ },
  mainLineId: { type: String, default: null, immutable: true },
  mainLineNameSnapshot: { type: String, default: null, immutable: true },
  mainBasketId: { type: String, default: null, immutable: true },
  mainBasketNameSnapshot: { type: String, default: null, immutable: true },
  scopeDigest: { type: String, default: null, immutable: true, match: /^[a-f0-9]{64}$/ },
  scopeOccurrences: { type: [new Schema({ sourceLineItemKey: { type: String, required: true },
    sectionId: { type: String, required: true }, roomId: { type: String, default: null },
    roomName: { type: String, required: true } }, { _id: false, versionKey: false, strict: "throw" })], default: undefined, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  vendorCodeSnapshot: { type: String, required: true, immutable: true },
  vendorNameSnapshot: { type: String, required: true, immutable: true },
  note: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["suggested", "withdrawn"], required: true },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 120 },
  requestHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  createdById: { type: String, required: true, immutable: true, ref: "User" },
  createdByName: { type: String, required: true, immutable: true },
  updatedById: { type: String, required: true, ref: "User" },
  updatedByName: { type: String, required: true }
}, { collection: "projectVendorSuggestions", timestamps: true, versionKey: false, strict: "throw", autoIndex: false });
schema.pre("validate", function () {
  if (this.scope === "main_line") {
    if (!this.mainLineId?.trim() || !this.mainBasketId?.trim() || !this.mainLineNameSnapshot?.trim() ||
      !this.estimateReviewRoundId?.trim() || !this.sourcePhase || !this.scopeDigest || !this.scopeOccurrences?.length) {
      this.invalidate("scope", "Main Line suggestions require verified approved source and included line scope.");
    }
  } else if (this.mainLineId != null) this.invalidate("mainLineId", "Project-wide suggestions cannot specify a Main Line.");
  if (this.designPlanVersion === 0 && (this.scope !== "main_line" || !["pre", "post"].includes(this.sourcePhase ?? "") ||
    !this.estimateReviewRoundId || !this.sourceSnapshotId || !this.sourceDigest)) {
    this.invalidate("designPlanVersion", "Zero Design version requires a verified collaborative approved source.");
  }
});
// Scope indexes are migration-owned. Never recreate the obsolete global source index at startup.
schema.index({ createdById: 1, idempotencyKey: 1 }, { unique: true, name: "project_vendor_suggestion_request_unique" });
schema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, designPlanVersion: 1, createdAt: -1, _id: 1 });
export const ProjectVendorSuggestionModel = models.ProjectVendorSuggestion ?? model("ProjectVendorSuggestion", schema);
