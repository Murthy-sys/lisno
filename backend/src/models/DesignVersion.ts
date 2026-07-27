import { model, models, Schema } from "mongoose";

const designVersionSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, ref: "Project", required: true },
    floorId: { type: String, ref: "Floor", required: true },
    stageId: { type: String, ref: "DesignStage", required: true },
    taskId: { type: String, ref: "Task", default: null },
    versionNumber: { type: Number, required: true, min: 1 },
    originalFilename: { type: String, required: true },
    storedFileReference: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    uploaderId: { type: String, ref: "User", required: true },
    uploadedAt: { type: Date, required: true },
    approvalStatus: {
      type: String,
      enum: ["draft", "in_review", "approved", "rejected"],
      required: true
    },
    reviewerId: { type: String, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    clientVisible: { type: Boolean, required: true, default: false }
  },
  { timestamps: true, versionKey: false }
);

designVersionSchema.index(
  { projectId: 1, floorId: 1, stageId: 1, taskId: 1, versionNumber: 1 },
  { unique: true }
);
designVersionSchema.index({
  projectId: 1,
  approvalStatus: 1,
  clientVisible: 1,
  approvedAt: -1,
  uploadedAt: -1,
  _id: -1
});

export const DesignVersionModel =
  models.DesignVersion ?? model("DesignVersion", designVersionSchema);
