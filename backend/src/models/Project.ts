import { DESIGN_STAGE_TYPES } from "../domain/design-workflow.js";
import { confirmedCity } from "../domain/procurement-city.js";
import { model, models, Schema } from "./mongoose.js";

const workflowStageSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, enum: DESIGN_STAGE_TYPES, required: true },
  name: { type: String, required: true },
  order: { type: Number, required: true, min: 0 }
}, { _id: false });

const projectSchema = new Schema(
  {
    _id: { type: String, required: true },
    designWorkflowStages: { type: [workflowStageSchema], default: undefined },
    name: { type: String, required: true, trim: true },
    nameVersion: { type: Number, min: 1, default: 1 },
    clientId: { type: String, ref: "User", default: null },
    clientName: { type: String, required: true, default: "" },
    clientEmail: { type: String, required: true, default: "" },
    clientEmailNormalized: { type: String, required: true, default: "" },
    clientMobile: { type: String, required: true, default: "" },
    clientAddress: { type: String, default: "" },
    initiatingDesignerId: { type: String, ref: "User", default: null },
    assignedEstimatorId: { type: String, ref: "User", default: null },
    assignedDesignerIds: { type: [String], ref: "User", default: [] },
    managerId: { type: String, ref: "User", default: null },
    programManagerId: { type: String, ref: "User", default: null },
    procurementIdentityVersion: { type: Number, min: 1, default: 1, validate: Number.isSafeInteger },
    status: {
      type: String,
      enum: ["planning", "active", "on_hold", "completed"],
      required: true
    },
    completionAuthority: {
      type: String,
      enum: ["legacy_staff", "vendor_client"],
      default: "vendor_client"
    },
    completionAuthorityVersion: { type: Number, min: 1, default: 1 },
    completionDecisionId: { type: String, default: null },
    purchaseOrderApprovalEpoch: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    siteCompletionFenceEpoch: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    location: { type: String, default: "" },
    cityName: { type: String, trim: true, maxlength: 120, default: null },
    cityKey: { type: String, trim: true, maxlength: 120, default: null },
    plannedStartAt: { type: Date, required: true },
    plannedEndAt: { type: Date, required: true },
    actualStartAt: { type: Date, default: null },
    actualEndAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

projectSchema.pre("validate", function validateConfirmedCity() {
  const name = this.get("cityName");
  const key = this.get("cityKey");
  try {
    const city = confirmedCity(name);
    if ((city?.key ?? null) !== (key ?? null)) this.invalidate("cityKey", "Confirmed city key must match its name.");
  } catch { this.invalidate("cityName", "Enter a valid confirmed city."); }
});

projectSchema.index({ clientId: 1, name: 1 });
projectSchema.index({ clientEmailNormalized: 1, clientId: 1 });
projectSchema.index({ managerId: 1, status: 1 });
projectSchema.index({ programManagerId: 1, status: 1 });
projectSchema.index({ assignedDesignerIds: 1, status: 1 });
projectSchema.index({ initiatingDesignerId: 1 });
projectSchema.index({ assignedEstimatorId: 1 });

export const ProjectModel = models.Project ?? model("Project", projectSchema);
