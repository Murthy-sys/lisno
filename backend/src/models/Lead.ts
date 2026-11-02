import { NATIVE_PLACE_MAX_LENGTH, TENTATIVE_BUDGET_MAX_LENGTH, PROJECT_CATEGORIES, PROJECT_LANGUAGES, isProjectCalendarDate } from "../contracts/project-initiation.js";
import { model, models, Schema } from "./mongoose.js";
import { confirmedCity } from "../domain/procurement-city.js";
import { parseProjectNumber } from "../domain/project-number.js";

const leadSchema = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, ref: "Project", default: null }, ownerId: { type: String, ref: "User", required: true },
  projectNumber: { type: String, default: null, immutable: true, validate: (value: string | null) => { parseProjectNumber(value); return true; } },
  clientName: { type: String, required: true }, clientEmail: { type: String, required: true }, clientMobile: { type: String, required: true },
  projectName: { type: String, required: true }, location: { type: String, default: "" },
  cityName: { type: String, trim: true, maxlength: 120, default: null }, cityKey: { type: String, trim: true, maxlength: 120, default: null },
  propertyType: { type: String, required: true },
  nativePlace: { type: String, trim: true, maxlength: NATIVE_PLACE_MAX_LENGTH, default: null },
  tentativeBudget: { type: String, trim: true, maxlength: TENTATIVE_BUDGET_MAX_LENGTH, default: null },
  closureTentativeDate: { type: String, default: null, validate: (value: string | null) => value === null || isProjectCalendarDate(value) },
  category: { type: String, enum: [...PROJECT_CATEGORIES, null], default: null },
  languagesKnown: { type: [{ type: String, enum: PROJECT_LANGUAGES }], default: [], validate: (values: string[]) => values.length <= PROJECT_LANGUAGES.length && new Set(values).size === values.length },
  preferredLanguage: { type: String, enum: [...PROJECT_LANGUAGES, null], default: null },
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
leadSchema.index({ projectNumber: 1 }, { unique: true, partialFilterExpression: { projectNumber: { $type: "string" } } });
leadSchema.index({ ownerId: 1, stage: 1, updatedAt: -1 });
leadSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { projectId: { $type: "string" } } }
);
export const LeadModel = models.Lead ?? model("Lead", leadSchema);
