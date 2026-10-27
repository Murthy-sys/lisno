import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, enum: ["procurement", "selection"], immutable: true },
  sourceId: { type: String, required: true, immutable: true }, sourceToken: { type: String, required: true, immutable: true },
  sourceLineItemKey: { type: String, required: true, immutable: true }, sourceSectionId: { type: String, default: null, immutable: true },
  estimateId: { type: String, default: null, immutable: true }, estimateVersion: { type: Number, default: null, immutable: true },
  quantityMilliUnits: { type: Number, default: null, immutable: true }, unit: { type: String, default: null, immutable: true },
  title: { type: String, required: true, immutable: true }, reason: { type: String, required: true, immutable: true },
  ownerId: { type: String, required: true }, status: { type: String, required: true, enum: ["open", "acknowledged", "fulfilled", "rejected"] },
  version: { type: Number, required: true, min: 1 }, dueAt: { type: Date, default: null, immutable: true },
  artifact: { type: new Schema({ kind: String, id: String, lineId: String }, { _id: false }), default: null },
  createdById: { type: String, required: true, immutable: true }, updatedById: { type: String, required: true }
}, { timestamps: true, versionKey: false, strict: "throw" });
schema.index({ projectId: 1, kind: 1, sourceId: 1, sourceToken: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["open", "acknowledged"] } } });
schema.index({ projectId: 1, kind: 1, createdAt: -1 });
export const ProjectManagerRequestModel = models.ProjectManagerRequest ?? model("ProjectManagerRequest", schema);
