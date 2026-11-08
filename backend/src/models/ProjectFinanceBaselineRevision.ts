import { estimateTotalsReconcile } from "../domain/estimate-total-rounding.js";
import { model, models, Schema } from "./mongoose.js";
import { MAX_FINANCE_AMOUNT_PAISE, PROJECT_FINANCE_TARGET_MARGIN_BPS } from "../domain/project-finance.js";

const integer = { validator: Number.isSafeInteger, message: "{PATH} must be a safe integer." };
const money = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: integer };
export const financeBaselineSourceSchema = new Schema({
  revisionId: { type: String, required: true },
  phase: { type: String, enum: ["pre", "post"], required: true },
  estimateId: { type: String, required: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: integer },
  estimateReviewRoundId: { type: String, required: true },
  approvedSubtotalPaise: money,
  approvedGstPaise: money,
  approvedContractTotalPaise: money,
  approvedRoundOffPaise: { type: Number, min: -50, max: 49, validate: integer },
  targetMarginBps: { type: Number, required: true, enum: [PROJECT_FINANCE_TARGET_MARGIN_BPS] },
  targetProfitPaise: money,
  costBudgetPaise: money,
  approvedAt: { type: Date, required: true },
  approvedById: { type: String, required: true }
}, { _id: false, strict: "throw" });

financeBaselineSourceSchema.pre("validate", function validateApprovedMoney() {
  if (!estimateTotalsReconcile({
    subtotalPaise: this.get("approvedSubtotalPaise"),
    gstPaise: this.get("approvedGstPaise"),
    totalPaise: this.get("approvedContractTotalPaise"),
    roundOffPaise: this.get("approvedRoundOffPaise")
  })) this.invalidate("approvedContractTotalPaise", "Approved subtotal and GST must reconcile with the contract total and round-off.");
});

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  source: { type: financeBaselineSourceSchema, required: true, immutable: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ projectId: 1, "source.estimateReviewRoundId": 1 }, { unique: true });
export const ProjectFinanceBaselineRevisionModel = models.ProjectFinanceBaselineRevision ?? model("ProjectFinanceBaselineRevision", schema);
