import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  progress: { type: Number, required: true, min: 0, max: 100 },
  note: { type: String, default: "", maxlength: 2_000, validate: (value: unknown) => typeof value === "string" },
  status: { type: String, required: true, enum: ["draft", "pending_client", "changes_requested", "client_approved"] },
  currentRound: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  updatedById: { type: String, required: true },
  updatedAt: { type: Date, required: true },
  verifiedAssignmentIds: { type: [String], default: null },
  lastProgressKey: { type: String, default: null },
  lastProgressDigest: { type: String, default: null }
}, { collection: "siteCompletionStates", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ projectId: 1 }, { unique: true });
export const SiteCompletionStateModel = models.SiteCompletionState ?? model("SiteCompletionState", schema);
