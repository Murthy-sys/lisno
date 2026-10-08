import { model, models, Schema } from "./mongoose.js";
import { confirmedCity } from "../domain/procurement-city.js";

/** Procurement-owned confirmed base city. This never writes the Configuration vendor master. */
const schema = new Schema({
  _id: { type: String, required: true, immutable: true, ref: "AiEstimatorKnowledgeVendor" },
  cityName: { type: String, trim: true, maxlength: 120, default: null },
  cityKey: { type: String, trim: true, maxlength: 120, default: null },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  confirmedById: { type: String, required: true, ref: "User" },
  confirmedAt: { type: Date, required: true }
}, { collection: "procurementVendorCities", timestamps: true, versionKey: false, strict: "throw" });

schema.pre("validate", function validateConfirmedCity() {
  const name = this.get("cityName");
  const key = this.get("cityKey");
  try {
    const city = confirmedCity(name);
    if ((city?.key ?? null) !== (key ?? null)) this.invalidate("cityKey", "Confirmed city key must match its name.");
  } catch { this.invalidate("cityName", "Enter a valid confirmed city."); }
});

schema.index({ cityKey: 1, _id: 1 });

export const ProcurementVendorCityModel = models.ProcurementVendorCity ?? model("ProcurementVendorCity", schema);
