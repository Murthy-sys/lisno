import { model, models, Schema } from "./mongoose.js";
import { annotationDocumentSchema } from "../domain/estimate-design.js";

const pointSchema = new Schema({
  x: { type: Number, required: true, min: 0, max: 1 },
  y: { type: Number, required: true, min: 0, max: 1 }
}, { _id: false, strict: "throw" });

const baseElement = {
  id: { type: String, required: true, maxlength: 128 },
  type: { type: String, required: true, enum: ["ellipse", "rectangle", "arrow", "freehand", "text"] },
  color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
  strokeWidth: { type: Number, required: true, min: 1, max: 24 }
};
const annotationElementSchema = new Schema(baseElement, {
  _id: false,
  discriminatorKey: "type",
  strict: "throw"
});

annotationElementSchema.discriminator("ellipse", new Schema({
  x: { type: Number, min: 0, max: 1 },
  y: { type: Number, min: 0, max: 1 },
  width: { type: Number, min: 0, max: 1 },
  height: { type: Number, min: 0, max: 1 }
}, { _id: false, strict: "throw" }));
annotationElementSchema.discriminator("rectangle", new Schema({
  x: { type: Number, min: 0, max: 1 },
  y: { type: Number, min: 0, max: 1 },
  width: { type: Number, min: 0, max: 1 },
  height: { type: Number, min: 0, max: 1 }
}, { _id: false, strict: "throw" }));
annotationElementSchema.discriminator("arrow", new Schema({
  x1: { type: Number, min: 0, max: 1 },
  y1: { type: Number, min: 0, max: 1 },
  x2: { type: Number, min: 0, max: 1 },
  y2: { type: Number, min: 0, max: 1 }
}, { _id: false, strict: "throw" }));
annotationElementSchema.discriminator("freehand", new Schema({
  points: { type: [pointSchema], default: undefined },
}, { _id: false, strict: "throw" }));
annotationElementSchema.discriminator("text", new Schema({
  x: { type: Number, min: 0, max: 1 },
  y: { type: Number, min: 0, max: 1 },
  text: { type: String, maxlength: 500 }
}, { _id: false, strict: "throw" }));

export const estimateDesignAnnotationDraftSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  revisionId: { type: String, ref: "EstimateDesignRevision", required: true, immutable: true },
  clientId: { type: String, ref: "User", required: true, immutable: true },
  version: { type: Number, required: true, enum: [1], default: 1 },
  elements: { type: [annotationElementSchema], required: true, default: [], validate: [(value: unknown[]) => value.length <= 200, "Use at most 200 annotation elements."] }
}, { timestamps: true, versionKey: false, strict: "throw" });

estimateDesignAnnotationDraftSchema.pre("validate", function validateAnnotation() {
  const document = annotationDocumentSchema.safeParse({
    version: this.get("version"),
    elements: this.get("elements")
  });
  if (!document.success) {
    throw document.error;
  }
});
estimateDesignAnnotationDraftSchema.index({ revisionId: 1, clientId: 1 }, { unique: true });

export const EstimateDesignAnnotationDraftModel = models.EstimateDesignAnnotationDraft ?? model("EstimateDesignAnnotationDraft", estimateDesignAnnotationDraftSchema);
