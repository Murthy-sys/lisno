import { ProjectId } from "../../components/projects/ProjectId";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { ClientEstimateDecision, PreEstimateComparison, clientEstimateMoney } from "../estimates/ClientPublishedEstimate";
import { EstimateBuilderArea } from "../estimates/EstimateBuilderArea";
import { SubmittedEstimateBuilder } from "../estimates/SubmittedEstimateBuilder";
import { downloadClientEstimatePdf, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { ClientQuotationOptions } from "./ClientQuotationOptions";

export function ClientQuotationSubmittedView({ estimate, workspace, projectNumber, canDecide, refreshing, onEdit, onRefresh }: {
  estimate: EstimateQueueItem; workspace: boolean; projectNumber?: string | null; canDecide: boolean; refreshing: boolean;
  onEdit: () => void; onRefresh: () => Promise<boolean>;
}) {
  const section = useRef<HTMLElement>(null);
  const [pdfNeedsRefresh, setPdfNeedsRefresh] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  const review = estimate.publishedReview!;
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
  return <section ref={section} tabIndex={-1} className={`client-quotation estimate-workspace estimator-dashboard estimate-workspace--item-view${workspace ? " client-quotation--workspace" : ""}`} aria-label="Submitted estimate">
    <header className="client-quotation__header"><div className="client-quotation__identity"><h2>{review.phase === "post" ? "Post-design quotation review" : "Pre-design quotation review"}</h2>
      {workspace ? <ProjectId projectNumber={projectNumber} /> : null}<p>Submitted version {review.estimateVersion} · Submission {review.sendGeneration} · Read-only</p></div>
      <dl><dt>Submitted total including GST</dt><dd>{clientEstimateMoney(review.snapshot.totalPaise === undefined ? review.snapshot.total : review.snapshot.totalPaise / 100)}</dd></dl></header>
    <div className="client-quotation__navigation"><Button variant="secondary" onClick={onEdit}>Back to estimate</Button>
      <ClientQuotationOptions context={`${review.id}:${review.version}`}><DownloadButton className="button button--secondary" label={`Download PDF · Version ${review.estimateVersion}`} loadingLabel="Preparing PDF…" errorMessage="The submitted PDF could not be verified. Refresh the estimate before trying again."
        fallbackFilename={`lisno-estimate-v${review.estimateVersion}.pdf`} getFile={async () => {
          try { return await downloadClientEstimatePdf(estimate.id, review.id); }
          catch (error) { setPdfNeedsRefresh(true); throw error; }
        }} /></ClientQuotationOptions></div>
    {pdfNeedsRefresh || !canDecide && review.status === "pending" ? <div role="status"><p>{pdfNeedsRefresh ? "Refresh the submitted version before making a decision." : "This submission is not available for approval. Refresh to check the latest confirmed version."}</p><Button variant="secondary" disabled={refreshing} onClick={() => void refresh()}>Refresh estimate</Button></div> : null}
    {review.phase === "post" ? <PreEstimateComparison estimate={estimate} /> : null}
    <EstimateBuilderArea documentFlow={!bounded} className={`client-quotation__builder${bounded ? "" : " client-quotation__builder--embedded"}`}>{builder}</EstimateBuilderArea>
    <footer className="estimate-workspace__footer client-quotation__footer client-quotation__review-footer">
      <dl className="client-quotation__submitted-taxes"><div><dt>Submitted subtotal</dt><dd>{clientEstimateMoney(review.snapshot.subtotalPaise === undefined ? review.snapshot.subtotal : review.snapshot.subtotalPaise / 100)}</dd></div><div><dt>GST</dt><dd>{clientEstimateMoney(review.snapshot.gstPaise === undefined ? review.snapshot.gst : review.snapshot.gstPaise / 100)}</dd></div>{review.snapshot.roundOffPaise !== undefined && review.snapshot.roundOffPaise !== 0 ? <div><dt>Round off</dt><dd>{review.snapshot.roundOffPaise < 0 ? "−" : "+"}{clientEstimateMoney(Math.abs(review.snapshot.roundOffPaise) / 100)}</dd></div> : null}</dl>
      <ClientEstimateDecision key={`${review.id}:${review.version}`} estimate={estimate} review={review} decisionBlocked={!canDecide || pdfNeedsRefresh} fallbackRef={section} approvalLabel="Approve quotation" />
    </footer>
  </section>;
}
