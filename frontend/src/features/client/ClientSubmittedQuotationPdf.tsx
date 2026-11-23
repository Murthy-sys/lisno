import { QuotationPdfAction } from "../estimates/QuotationPdfViewer";
import { downloadClientEstimatePdf, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";

export function ClientSubmittedQuotationPdf({ estimate, note, onVerificationError }: {
  estimate: EstimateQueueItem; note?: string; onVerificationError?: () => void;
}) {
  const review = estimate.publishedReview;
  if (!review) return null;
  return <QuotationPdfAction documentKey={JSON.stringify([estimate.id, review.id, review.version])}
    title={`Submitted quotation · Version ${review.estimateVersion}`} note={note}
    getFile={async signal => {
      try { return await downloadClientEstimatePdf(estimate.id, review.id, signal); }
      catch (error) { if (!signal.aborted) onVerificationError?.(); throw error; }
    }} />;
}
