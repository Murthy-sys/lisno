import { ProcurementVendorInvitationIntentModel } from "./ProcurementVendorInvitationIntent.js";
import { projectAssistantModels } from "./ProjectChatAssistant.js";
import { ExecutionReportingPolicyModel, ExecutionReportingPolicyHeadModel } from "./ExecutionReportingPolicy.js";
import { ExecutionDailyObligationModel, ExecutionReportingCursorModel } from "./ExecutionDailyObligation.js";
import { ExecutionNotificationModel, ExecutionNotificationAssignmentModel, ExecutionSchedulerLeaseModel } from "./ExecutionNotification.js";
import { VendorAccessIntentModel } from "./VendorAccessIntent.js";
import { VendorExecutionStateModel } from "./VendorExecutionState.js";
import { VendorExecutionEventModel } from "./VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "./VendorExecutionReview.js";
import { ExecutionChangeEventModel } from "./ExecutionChangeEvent.js";
import { ProcurementVendorCertificateUploadModel, ProcurementVendorCertificateCleanupModel } from "./ProcurementVendorCertificateUpload.js";
import { ProcurementVendorSaveCommandModel } from "./ProcurementVendorSaveCommand.js";
import { ProcurementVendorCityModel } from "./ProcurementVendorCity.js";
import { ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketInvitationModel,
  ProcurementBasketWhatsAppAccessModel,
  ProcurementBasketBidModel, ProcurementBasketCounterofferModel, ProcurementBasketInvitationBatchModel, ProcurementBasketAwardModel,
  ProcurementBasketAwardRevisionModel, ProcurementBasketAwardApprovalModel } from "./ProcurementBasketTender.js";
import { ProcurementBasketInvoiceAssessmentModel,
  ProcurementBasketInvoiceAssessmentRevisionModel } from "./ProcurementBasketInvoiceAssessment.js";
import { ProcurementBasketBaseRateModel, ProcurementBasketBaseRateReceiptModel } from "./ProcurementBasketBaseRate.js";
import { ProjectProcurementItemModel } from "./ProjectProcurementItem.js";
import { ChatNotificationModel } from "./ChatNotification.js";
import { prepareEstimateClientReviewIndexes } from "./EstimateClientReviewRound.js";
import { DesignPlanResponseProofModel } from "./DesignPlanResponseProof.js";
import { DesignPlanReviewRoundModel } from "./DesignPlanReviewRound.js";
import { ProjectWorkflowTaskModel } from "./ProjectWorkflowTask.js";
import { DailyCriticalTaskReceiptModel } from "./DailyCriticalTaskReceipt.js";
import { DailyCriticalScheduleStateModel } from "./DailyCriticalScheduleState.js";
import { ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatReadStateModel, ProjectChatParticipantAssignmentModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel } from "./ProjectChat.js";
import { ProjectChatAttachmentModel } from "./ProjectChatAttachment.js";
import { ProjectFinanceBucketModel } from "./ProjectFinanceBucket.js";
import { FinanceLedgerEntryModel } from "./FinanceLedgerEntry.js";
import { FinanceEntryDocumentModel } from "./FinanceEntryDocument.js";
import { ProcurementReceiptCleanupJobModel } from "./ProcurementReceiptCleanupJob.js";
import { ProcurementReceiptReconciliationJobModel } from "./ProcurementReceiptReconciliationJob.js";
import { UserModel } from "./User.js";
import { UserInvitationModel } from "./UserInvitation.js";
import { PasswordResetRequestModel } from "./PasswordResetRequest.js";
import { AiEstimatorKnowledgeSubBasketModel } from "./AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeBasketModel } from "./AiEstimatorKnowledgeBasket.js";
import { VendorBasketRequestModel } from "./VendorBasketRequest.js";
import { AiEstimatorKnowledgeMainLineModel } from "./AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "./AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "./AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgePriorityModel } from "./AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeQualityControlOptionModel } from "./AiEstimatorKnowledgeQualityControlOption.js";
import { AiEstimatorKnowledgeRevisionModel } from "./AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "./AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "./AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "./AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "./AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "./AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "./AiEstimatorKnowledgeVendor.js";
import { VendorKpiAssessmentModel } from "./VendorKpiAssessment.js";
import { VendorKpiRequestModel } from "./VendorKpiRequest.js";
import { VendorInductionDraftModel, VendorInductionQuestionnaireModel, VendorInductionRequestModel, VendorInductionSubmissionModel, VendorInductionReviewModel } from "./VendorInduction.js";

export async function initializeApplicationIndexes(): Promise<void> {
  await ProjectProcurementItemModel.init();
  await ChatNotificationModel.init();
  await ProjectChatAttachmentModel.init();
  for (const model of [ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatReadStateModel, ProjectChatParticipantAssignmentModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel]) await model.init();
  for (const model of projectAssistantModels) await model.init();
  await UserModel.init();
  await UserInvitationModel.init();
  await VendorAccessIntentModel.init();
  await ProcurementVendorInvitationIntentModel.init();
  await VendorExecutionStateModel.init();
  await VendorExecutionEventModel.init();
  await VendorExecutionReviewModel.init();
  await ExecutionChangeEventModel.init();
  for (const model of [ExecutionDailyObligationModel, ExecutionReportingCursorModel, ExecutionNotificationModel, ExecutionNotificationAssignmentModel,
    ExecutionSchedulerLeaseModel, ExecutionReportingPolicyHeadModel, ExecutionReportingPolicyModel]) await model.init();
  await PasswordResetRequestModel.init();
  await prepareEstimateClientReviewIndexes();
  await DesignPlanReviewRoundModel.init();
  await DesignPlanResponseProofModel.init();
  await ProjectWorkflowTaskModel.init();
  await DailyCriticalTaskReceiptModel.init();
  await DailyCriticalScheduleStateModel.init();
  await ProjectFinanceBucketModel.init();
  await FinanceLedgerEntryModel.init();
  await FinanceEntryDocumentModel.init();
  await ProcurementReceiptCleanupJobModel.init();
  await ProcurementReceiptReconciliationJobModel.init();
  await AiEstimatorKnowledgeBasketModel.init();
  await VendorBasketRequestModel.init();
  await AiEstimatorKnowledgeSubBasketModel.init();
  await AiEstimatorKnowledgeMainLineModel.init();
  await AiEstimatorKnowledgeRevisionModel.init();
  await AiEstimatorKnowledgeSectionModel.init();
  await AiEstimatorKnowledgePriceVersionModel.init();
  await AiEstimatorKnowledgeUomModel.init();
  await AiEstimatorKnowledgeVendorModel.init();
  await VendorKpiAssessmentModel.init();
  await VendorKpiRequestModel.init();
  await VendorInductionDraftModel.init();
  await VendorInductionQuestionnaireModel.init();
  await VendorInductionRequestModel.init();
  await VendorInductionSubmissionModel.init();
  await VendorInductionReviewModel.init();
  await ProcurementVendorCertificateUploadModel.init();
  await ProcurementVendorCertificateCleanupModel.init();
  await ProcurementVendorSaveCommandModel.init();
  await ProcurementVendorCityModel.init();
  await ProcurementBasketBaseRateModel.init();
  await ProcurementBasketBaseRateReceiptModel.init();
  for (const model of [ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketInvitationModel,
    ProcurementBasketWhatsAppAccessModel,
    ProcurementBasketBidModel, ProcurementBasketCounterofferModel, ProcurementBasketInvitationBatchModel, ProcurementBasketAwardModel,
    ProcurementBasketAwardRevisionModel, ProcurementBasketAwardApprovalModel,
    ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel]) await model.init();
  await AiEstimatorKnowledgeTaxRuleModel.init();
  await AiEstimatorKnowledgeTaxVersionModel.init();
  await AiEstimatorKnowledgePriorityModel.init();
  await AiEstimatorKnowledgeQualityControlOptionModel.init();
  await AiEstimatorKnowledgeSurfaceModel.init();
  await AiEstimatorKnowledgeModeModel.init();
}
