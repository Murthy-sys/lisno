import { model, models, Schema } from "./mongoose.js";

// Only the fingerprint and public master response are retained, never private profile input.
const schema = new Schema({
  _id: { type: String, required: true }, fingerprint: { type: String, required: true },
  result: { type: Schema.Types.Mixed, required: true }
}, { collection: "procurementVendorSaveCommands", timestamps: true, versionKey: false, strict: "throw" });
export const ProcurementVendorSaveCommandModel = models.ProcurementVendorSaveCommand ?? model("ProcurementVendorSaveCommand", schema);
