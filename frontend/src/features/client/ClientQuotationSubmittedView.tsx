import { ProjectId } from "../../components/projects/ProjectId";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ClientSubmittedQuotationPdf } from "./ClientSubmittedQuotationPdf";
import { ClientEstimateDecision, PreEstimateComparison } from "../estimates/ClientPublishedEstimate";
import { clientEstimateTotal } from "../estimates/estimatePmcPaymentPresentation";
import { EstimateBuilderArea } from "../estimates/EstimateBuilderArea";
import { SubmittedEstimateBuilder } from "../estimates/SubmittedEstimateBuilder";
import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";

export function ClientQuotationSubmittedView({ estimate, workspace, projectNumber, canDecide, refreshing, onEdit, onRefresh }: {
  estimate: EstimateQueueItem; workspace: boolean; projectNumber?: string | null; canDecide: boolean; refreshing: boolean;
  onEdit: () => void; onRefresh: () => Promise<boolean>;
}) {
  const section = useRef<HTMLElement>(null);
  const [pdfNeedsRefresh, setPdfNeedsRefresh] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  const review = estimate.publishedReview!;
  const total = clientEstimateTotal(review.snapshot);
  useEffect(() => {
    section.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView?.({ block: "start" });
  }, []);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const bounded = workspace && !narrow;
  const refresh = async () => { if (await onRefresh()) setPdfNeedsRefresh(false); };
  const builder = <SubmittedEstimateBuilder snapshot={review.snapshot} workspace={bounded} onRefresh={() => void refresh()} refreshing={refreshing} />;
  return <section ref={section} tabIndex={-1} className={`client-quotation client-quotation--submitted estimate-workspace estimator-dashboard estimate-workspace--item-view${workspace ? " client-quotation--workspace" : ""}`} aria-label="Submitted estimate">
    <header className="client-quotation__header"><div className="client-quotation__submitted-heading"><div className="client-quotation__identity"><h2>{review.phase === "post" ? "Post-design quotation review" : "Pre-design quotation review"}</h2>
      {workspace ? <ProjectId projectNumber={projectNumber} /> : null}</div><p>Submitted version {review.estimateVersion} · Submission {review.sendGeneration} · Read-only</p></div>
      <dl><dt>Submitted total including GST</dt><dd>{submittedMoney(total)}</dd></dl></header>
    <div className="client-quotation__navigation"><Button variant="secondary" onClick={onEdit}>Back to estimate</Button>
      <ClientSubmittedQuotationPdf estimate={estimate} onVerificationError={() => setPdfNeedsRefresh(true)} /></div>
    {pdfNeedsRefresh || !canDecide && review.status === "pending" ? <div role="status"><p>{pdfNeedsRefresh ? "Refresh the submitted version before making a decision." : "This submission is not available for approval. Refresh to check the latest confirmed version."}</p><Button variant="secondary" disabled={refreshing} onClick={() => void refresh()}>Refresh estimate</Button></div> : null}
    {review.phase === "post" ? <PreEstimateComparison estimate={estimate} /> : null}
    <EstimateBuilderArea documentFlow={!bounded} className={`client-quotation__builder${bounded ? "" : " client-quotation__builder--embedded"}`}>{builder}</EstimateBuilderArea>
    <footer className="estimate-workspace__footer client-quotation__footer client-quotation__review-footer">
      <section className="client-quotation__price-summary" aria-label="Price summary">
        <h3>Price summary</h3>
        <dl className="client-quotation__payable"><div><dt>Total payable inclusive of all charges</dt><dd>{submittedMoney(total)}</dd></div></dl>
      </section>
      <ClientEstimateDecision key={`${review.id}:${review.version}`} estimate={estimate} review={review} decisionBlocked={!canDecide || pdfNeedsRefresh} fallbackRef={section} approvalLabel="Approve quotation" />
    </footer>
  </section>;
}

const submittedCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function submittedMoney(value: number | null) {
  return value === null || !Number.isFinite(value) || value < 0 ? "Estimate unavailable" : submittedCurrency.format(value);
}
