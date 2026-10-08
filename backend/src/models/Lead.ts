import { model, models, Schema } from "./mongoose.js";
import { confirmedCity } from "../domain/procurement-city.js";

const leadSchema = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, ref: "Project", default: null }, ownerId: { type: String, ref: "User", required: true },
  clientName: { type: String, required: true }, clientEmail: { type: String, required: true }, clientMobile: { type: String, required: true },
  projectName: { type: String, required: true }, location: { type: String, default: "" },
  cityName: { type: String, trim: true, maxlength: 120, default: null }, cityKey: { type: String, trim: true, maxlength: 120, default: null },
  propertyType: { type: String, required: true },
  budgetMin: { type: Number, default: null }, budgetMax: { type: Number, default: null }, source: { type: String, required: true },
  stage: { type: String, required: true }, nextAction: { type: String, required: true }, nextActionAt: { type: Date, required: true },
  builder: { type: String, default: null }, areaSqft: { type: Number, default: null }, targetHandoverAt: { type: Date, default: null },
  notes: { type: String, default: null }, latestActivityAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });
leadSchema.pre("validate", function validateConfirmedCity() {
  try {
    if ((confirmedCity(this.get("cityName"))?.key ?? null) !== (this.get("cityKey") ?? null)) this.invalidate("cityKey", "Confirmed city key must match its name.");
  } catch { this.invalidate("cityName", "Enter a valid confirmed city."); }
});
leadSchema.index({ ownerId: 1, updatedAt: -1 });
leadSchema.index({ ownerId: 1, stage: 1, updatedAt: -1 });
leadSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { projectId: { $type: "string" } } }
);
export const LeadModel = models.Lead ?? model("Lead", leadSchema);
