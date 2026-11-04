import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ClientProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";
import { clientEstimateWorkflowVersion } from "../estimates/clientEstimateWorkflow";
import {
  currentQuotationApprovalState,
  currentQuotationIsApproved,
  quotationApprovalNeedsClient
} from "../estimates/quotationApproval";
import { estimateWorkflowKeys, getClientEstimates, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";

interface ClientEstimateSummaryProps {
  projects: readonly Pick<ClientProjectSummary, "id" | "name">[];
  projectsFresh: boolean;
  selectedEstimateId?: string;
}

/** Dashboard navigation only. All estimate editing and decisions stay in the project workspace. */
export function ClientEstimateSummary({ projects, projectsFresh, selectedEstimateId }: ClientEstimateSummaryProps) {
  const query = useQuery({ queryKey: estimateWorkflowKeys.client, queryFn: getClientEstimates, retry: false });
  if (query.isPending) return <section className="client-estimate-summary" aria-label="Estimation"><h2>Estimation</h2><p role="status">Loading your estimates…</p></section>;
  // Do not retain actionable project links after a failed or denied estimate refresh.
  if (query.isError) return <section className="client-estimate-summary" aria-label="Estimation"><h2>Estimation</h2><p role="alert">Your estimates could not be refreshed. Retry before opening an estimation workspace.</p><Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry estimates</Button></section>;

  const estimates = query.data;
  const current = estimates.filter(estimate => clientEstimateWorkflowVersion(estimate) === 3);
  const legacy = estimates.filter(estimate => clientEstimateWorkflowVersion(estimate) !== 3);
  const selected = selectedEstimateId ? estimates.filter(estimate => estimate.id === selectedEstimateId) : [];
  const verifiedProject = (estimate: EstimateQueueItem) => {
    if (!estimate.projectId || estimates.filter(candidate => candidate.id === estimate.id).length !== 1 ||
      estimates.filter(candidate => candidate.projectId === estimate.projectId).length !== 1) return undefined;
    const matches = projects.filter(project => project.id === estimate.projectId);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const selectedUnavailable = Boolean(selectedEstimateId && (selected.length !== 1 ||
    clientEstimateWorkflowVersion(selected[0]!) === 3 && !verifiedProject(selected[0]!)));
  const fresh = projectsFresh && !query.isFetching;

  return <>
    {selectedUnavailable ? <p className="client-estimate-summary__notice" role="status">The estimate in this link is unavailable or could not be linked to a verified project. Open an available estimate below or contact your Sales team.</p> : null}
    {current.length || !legacy.length ? <section className="client-estimate-summary" aria-labelledby="client-estimation-summary-title">
      <header><h2 id="client-estimation-summary-title">Estimation</h2><p>Edit permitted items and review your team's confirmed quotation in the project workspace.</p></header>
      {!fresh ? <p role="status">{query.isFetching ? "Refreshing estimation status…" : "Refresh your project list before opening an estimation workspace."}</p> : null}
      {current.length ? <ul className="client-estimate-summary__list" aria-label="Project estimates">
        {current.map((estimate, index) => {
          const project = verifiedProject(estimate);
          const state = estimateSummaryState(estimate);
          const selectedEntry = selected.length === 1 && estimate.id === selectedEstimateId;
          return <li key={`${estimate.id}:${index}`} className="client-estimate-summary__row">
            <div><h3>{project?.name ?? estimate.lead.projectName}</h3><p>{project ? state.message : "The project for this estimate could not be verified. Contact your Sales team."}</p>
              {selectedEntry && project ? <span className="client-estimate-summary__selected">Estimate from your link</span> : null}
            </div>
            {project && fresh ? <Link className="button button--secondary" to={`/projects/${encodeURIComponent(project.id)}/quotation`} aria-label={`${state.reviewReady ? "Review estimate" : "Open estimation"}: ${project.name}`}>{state.reviewReady ? "Review estimate" : "Open estimation"}</Link> : null}
          </li>;
        })}
      </ul> : <p>No estimates are available yet. Your team will share them here when ready.</p>}
    </section> : null}
    {legacy.length ? <EstimateReviewPanel workflowFilter="legacy" refetchOnMount={false} selectedEstimateId={selected.length === 1 && clientEstimateWorkflowVersion(selected[0]!) !== 3 ? selectedEstimateId : undefined} /> : null}
  </>;
}

function estimateSummaryState(estimate: EstimateQueueItem): { message: string; reviewReady: boolean } {
  const review = estimate.publishedReview;
  const phase = estimate.estimation?.phase ?? review?.phase;
  if (estimate.reviewSourceIssue) return { message: "The submitted version needs to be refreshed in your estimation workspace.", reviewReady: false };
  if (clientEstimateWorkflowVersion(estimate) === 3 && phase === "post") {
    const approvalState = currentQuotationApprovalState(estimate);
    if (approvalState === "initial_current" && currentQuotationIsApproved(estimate)) {
      return { message: "Initial estimate approved. Design can continue while the quotation remains unchanged.", reviewReady: false };
    }
    if (approvalState === "revision_draft") return { message: "Your Designer is preparing a revised quotation.", reviewReady: false };
    if (approvalState === "revision_pending_client") {
      const reviewReady = quotationApprovalNeedsClient(estimate) && review?.canDecide === true &&
        review.status === "pending" && estimate.status === "sent_to_client" &&
        estimate.version === review.estimateVersion && estimate.estimation?.phase === review.phase;
      return { message: reviewReady ? "Ready for your revised quotation approval" : "A revised quotation is awaiting your review.", reviewReady };
    }
    if (approvalState === "revision_changes_requested") return { message: "Changes requested. Your Designer is revising the quotation.", reviewReady: false };
    if (approvalState === "revision_current" && currentQuotationIsApproved(estimate)) return { message: "Revised quotation approved", reviewReady: false };
    return { message: "The current quotation approval could not be verified. Refresh your estimation workspace.", reviewReady: false };
  }
  if (review?.canDecide && review.status === "pending" && estimate.status === "sent_to_client" &&
    estimate.version === review.estimateVersion && (!estimate.estimation || estimate.estimation.phase === review.phase)) {
    return { message: phase === "post" ? "Ready for your post-design approval" : phase === "pre" ? "Ready for your pre-design approval" : "Ready for your review", reviewReady: true };
  }
  if (review?.status === "pending") return { message: "Open your estimation workspace to check the latest review status.", reviewReady: false };
  if (estimate.estimation?.editClosedAt || review?.status === "approved" && review.phase === "post") return { message: "Post-design quotation approved", reviewReady: false };
  if (review?.status === "changes_requested") return { message: "Changes requested. Your team is revising the quotation.", reviewReady: false };
  if (phase === "post") return { message: "Your team is preparing the final estimate.", reviewReady: false };
  if (review?.status === "approved") return { message: "Pre-design approval recorded", reviewReady: false };
  if (review?.status === "superseded" || estimate.status === "draft") return { message: "Waiting for Sales confirmation", reviewReady: false };
  return { message: "Your team is preparing the quotation for your review.", reviewReady: false };
}
