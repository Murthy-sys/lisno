import { model, models, Schema } from "./mongoose.js";

const estimateLineSchema = new Schema({
  catalogueId: { type: String, required: true }, roomName: { type: String, required: true }, specification: { type: String, required: true },
  unit: { type: String, required: true }, rate: { type: Number, required: true }, quantity: { type: Number, required: true }, included: { type: Boolean, required: true }, amount: { type: Number, required: true }
}, { _id: false });

const estimateReviewSchema = new Schema({
  actorId: { type: String, ref: "User", required: true },
  action: { type: String, required: true },
  note: { type: String, default: "" },
  occurredAt: { type: Date, required: true }
}, { _id: false });

const estimateNotificationSchema = new Schema({
  recipientEmail: { type: String, required: true },
  recipientRole: { type: String, required: true },
  event: { type: String, required: true },
  status: { type: String, enum: ["queued", "sent", "failed"], default: "queued" },
  queuedAt: { type: Date, required: true }
}, { _id: false });

const estimateSchema = new Schema({
  _id: { type: String, required: true }, leadId: { type: String, ref: "Lead", required: true, unique: true }, ownerId: { type: String, ref: "User", required: true },
  version: { type: Number, required: true, default: 1 },
  status: {
    type: String,
    enum: ["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested", "ready_for_client", "sent_to_client", "client_changes_requested", "client_approved"],
    required: true,
    default: "draft"
  },
  propertyType: { type: String, required: true },
  rooms: { type: [Schema.Types.Mixed], required: true, default: [] }, scopes: { type: [String], required: true, default: [] }, lineItems: { type: [estimateLineSchema], required: true, default: [] },
  subtotal: { type: Number, required: true, default: 0 }, gst: { type: Number, required: true, default: 0 }, total: { type: Number, required: true, default: 0 },
  approvalRequired: { type: Boolean, required: true, default: false },
  assignedManagerId: { type: String, ref: "User", default: null },
  assignedDesignerId: { type: String, ref: "User", default: null },
  submittedAt: { type: Date, default: null },
  sentToClientAt: { type: Date, default: null },
  clientDecisionAt: { type: Date, default: null },
  projectId: { type: String, ref: "Project", default: null },
  reviews: { type: [estimateReviewSchema], default: [] },
  notifications: { type: [estimateNotificationSchema], default: [] }
}, { timestamps: true, versionKey: false });
estimateSchema.index({ ownerId: 1, updatedAt: -1 });
estimateSchema.index({ status: 1, assignedManagerId: 1, assignedDesignerId: 1 });
export const EstimateModel = models.Estimate ?? model("Estimate", estimateSchema);
