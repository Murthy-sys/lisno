import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { ExecutionWork } from "../execution/executionApi";
import { executionTime } from "../execution/executionPresentation";
import { getVendorWorkDetail, vendorWorkKeys, type VendorWorkTask } from "./vendorWorkApi";

function matchesAssignment(task: VendorWorkTask, work: ExecutionWork) {
  return task.id === work.id && task.projectId === work.projectId && task.vendorId === work.vendorId &&
    task.orderId === work.orderId && task.orderRevision === work.orderRevision && task.lineId === work.lineId &&
    task.sourceLineItemKey === work.sourceLineItemKey;
}

export function VendorReviewContext({ work }: { work: ExecutionWork }) {
  const relevant = work.status !== "superseded" && ["submitted_for_client", "client_approved", "changes_requested"].includes(work.legacyStatus);
  const query = useQuery({ queryKey: vendorWorkKeys.detail(work.id), queryFn: () => getVendorWorkDetail(work.id), enabled: relevant });
  if (!relevant) return null;

  const unavailable = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const task = query.isError ? undefined : query.data;
  const identityMatches = task && matchesAssignment(task, work);
  const statusMatches = identityMatches && task.status === work.legacyStatus;

  return <section className="vendor-review" aria-label="Client review details">
    <h3>Client review details</h3>
    {query.isPending ? <p role="status">Loading Client review details…</p> : query.isError ? <InlineMessage tone={unavailable ? "warning" : "error"}>
      {unavailable ? "Client review details are unavailable for this assignment." : "Client review details could not be refreshed. Previous details are hidden until they can be checked."}
      <Button variant="quiet" size="compact" busy={query.isFetching} onClick={() => void query.refetch()}>Retry Client review details</Button>
    </InlineMessage> : !identityMatches ? <InlineMessage tone="warning">Client review details could not be matched to this issued assignment.</InlineMessage> : !statusMatches ? <InlineMessage tone="warning">Client review status changed. Refresh the assignment to see the latest workflow.</InlineMessage> : <>
      <p>{task.status === "client_approved" ? "The Client accepted this assignment." : task.status === "submitted_for_client" ? "The Client's decision is pending." : "The Client requested changes to the previous submission."}</p>
      {task.status === "changes_requested" ? <p>{task.requestedChangeReason ? `Requested changes: ${task.requestedChangeReason}` : "The saved change request reason is unavailable."}</p> : null}
      <dl className="vendor-review__facts">
        <div><dt>{task.status === "changes_requested" ? "Previous Client submission" : "Submitted to Client"}</dt><dd>{task.submittedAt ? <time dateTime={task.submittedAt}>{executionTime(task.submittedAt, work.timezone)}</time> : "Submission date unavailable"}</dd></div>
        {task.status === "client_approved" ? <div><dt>Accepted by Client</dt><dd>{task.acceptedAt ? <time dateTime={task.acceptedAt}>{executionTime(task.acceptedAt, work.timezone)}</time> : "Acceptance date unavailable"}</dd></div> : null}
      </dl>
    </>}
  </section>;
}
