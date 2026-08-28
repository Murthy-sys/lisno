import { prepareEstimateClientReviewIndexes } from "./EstimateClientReviewRound.js";
import { DesignPlanResponseProofModel } from "./DesignPlanResponseProof.js";
import { DesignPlanReviewRoundModel } from "./DesignPlanReviewRound.js";
import { ProjectWorkflowTaskModel } from "./ProjectWorkflowTask.js";
import { ProjectFinanceBucketModel } from "./ProjectFinanceBucket.js";
import { FinanceLedgerEntryModel } from "./FinanceLedgerEntry.js";
import { FinanceEntryDocumentModel } from "./FinanceEntryDocument.js";
import { ProcurementReceiptCleanupJobModel } from "./ProcurementReceiptCleanupJob.js";
import { ProcurementReceiptReconciliationJobModel } from "./ProcurementReceiptReconciliationJob.js";
import { UserModel } from "./User.js";
import { UserInvitationModel } from "./UserInvitation.js";
import { PasswordResetRequestModel } from "./PasswordResetRequest.js";

export async function initializeApplicationIndexes(): Promise<void> {
  await UserModel.init();
  await UserInvitationModel.init();
  await PasswordResetRequestModel.init();
  await prepareEstimateClientReviewIndexes();
  await DesignPlanReviewRoundModel.init();
  await DesignPlanResponseProofModel.init();
  await ProjectWorkflowTaskModel.init();
  await ProjectFinanceBucketModel.init();
  await FinanceLedgerEntryModel.init();
  await FinanceEntryDocumentModel.init();
  await ProcurementReceiptCleanupJobModel.init();
  await ProcurementReceiptReconciliationJobModel.init();
}
