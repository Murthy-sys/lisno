import { downloadQuotationDraftPdf, QuotationPdfAction } from "../estimates/QuotationPdfViewer";
import { downloadCustomerRevisionPdf, downloadSavedSalesQuotationPdf, type EstimateRevisionDetail } from "./estimateRevisionsApi";
import type { EstimateDraft } from "./leadsApi";

export function SalesQuotationPdfAction({ estimate, selectedRevision, draftEditable, unsaved }: {
  estimate: EstimateDraft;
  selectedRevision?: EstimateRevisionDetail;
  draftEditable: boolean;
  unsaved: boolean;
}) {
  const lifecycle = estimate.estimation;
  const status = lifecycle?.status ?? estimate.status;

  const internalReview = lifecycle?.workflowVersion !== 3 &&
    ["pending_manager_assignment", "pending_designer_approval", "ready_for_client"].includes(status);
  if (!selectedRevision && (draftEditable || internalReview)) {
    const { projectId, id, version } = estimate;
    if (version === undefined || !Number.isSafeInteger(version) || version < 1) return null;
    return <QuotationPdfAction documentKey={JSON.stringify([status, projectId, id, version])}
      title={`${internalReview ? "Quotation in internal review" : "Draft quotation"} · Version ${version}`}
      note={unsaved ? `The PDF shows saved version ${version}. Your current edits are unsaved.` : undefined}
      getFile={signal => lifecycle?.workflowVersion === 3 && projectId
        ? downloadQuotationDraftPdf(projectId, id, version, signal)
        : downloadSavedSalesQuotationPdf(id, version, signal, internalReview ? "internal-review" : undefined)} />;
  }

  const submittedId = selectedRevision?.id ?? (status === "sent_to_client"
    ? lifecycle?.pendingReviewRoundId ?? estimate.clientReview?.id
    : status === "client_approved" ? estimate.currentQuotationApproval?.reviewRoundId ?? estimate.clientReview?.id : undefined);
  if (!submittedId) return null;
  const submittedVersion = selectedRevision?.estimateVersion ?? (estimate.clientReview?.id === submittedId
    ? estimate.clientReview.estimateVersion : estimate.currentQuotationApproval?.reviewRoundId === submittedId
      ? estimate.currentQuotationApproval.estimateVersion : undefined);
  return <QuotationPdfAction documentKey={JSON.stringify(["submitted", estimate.id, submittedId])}
    title={submittedVersion ? `Submitted quotation · Version ${submittedVersion}` : "Submitted quotation"}
    getFile={signal => downloadCustomerRevisionPdf(estimate.id, submittedId, signal)} />;
}
