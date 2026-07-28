import { model, models, Schema } from "./mongoose.js";

const projectSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    clientId: { type: String, ref: "User", default: null },
    clientName: { type: String, required: true, default: "" },
    clientEmail: { type: String, required: true, default: "" },
    clientEmailNormalized: { type: String, required: true, default: "" },
    clientMobile: { type: String, required: true, default: "" },
    clientAddress: { type: String, required: true, default: "" },
    initiatingDesignerId: { type: String, ref: "User", required: true },
    assignedDesignerIds: [{ type: String, ref: "User", required: true }],
    managerId: { type: String, ref: "User", required: true },
    status: {
      type: String,
      enum: ["planning", "active", "on_hold", "completed"],
      required: true
    },
    location: { type: String, required: true },
    plannedStartAt: { type: Date, required: true },
    plannedEndAt: { type: Date, required: true },
    actualStartAt: { type: Date, default: null },
    actualEndAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

projectSchema.index({ clientId: 1, name: 1 });
projectSchema.index({ clientEmailNormalized: 1, clientId: 1 });
projectSchema.index({ managerId: 1, status: 1 });
projectSchema.index({ assignedDesignerIds: 1, status: 1 });
projectSchema.index({ initiatingDesignerId: 1 });

export const ProjectModel = models.Project ?? model("Project", projectSchema);
