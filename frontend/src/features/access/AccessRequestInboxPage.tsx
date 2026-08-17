import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ROLE_LABELS } from "../../api/authorization-contract";
import type { PaginationInput, ReviewAccessRequest } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { AccessRequestDecisionDialog } from "./AccessRequestDecisionDialog";
import { GrantRevocationDialog } from "./GrantRevocationDialog";
import { getAccessRequestsForReview, reviewAccessRequestKeys } from "./accessRequestsApi";

const PAGE_SIZE = 20;
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});
const statusTone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

type SelectedAction = {
  request: ReviewAccessRequest;
  kind: "approved" | "rejected" | "revoke";
};

function statusLabel(status: ReviewAccessRequest["status"]) {
  return status[0].toUpperCase() + status.slice(1);
}

export function AccessRequestInboxPage() {
  const auth = useAuth();
  const [pagination, setPagination] = useState<PaginationInput>({ limit: PAGE_SIZE, offset: 0 });
  const [selected, setSelected] = useState<SelectedAction | null>(null);
  const reviewQuery = useQuery({
    queryKey: reviewAccessRequestKeys.page({}, pagination),
    queryFn: () => getAccessRequestsForReview({}, pagination),
    placeholderData: keepPreviousData
  });
  const page = reviewQuery.data;
  const currentRow = page?.items.find((item) => item.id === selected?.request.id);
  const dialogRequest = selected?.request;
  const decisionRowIsCurrent = Boolean(
    currentRow &&
      currentRow.status === "pending" &&
      currentRow.version === selected?.request.version
  );
  const selectedGrant = selected?.kind === "revoke"
    ? selected.request.activeGrant
    : null;
  const grantRowIsCurrent = Boolean(
    selectedGrant &&
      currentRow?.activeGrant?.id === selectedGrant.id &&
      currentRow.activeGrant.version === selectedGrant.version
  );

  const canDecide = hasFrontendPermission(auth.authorization, "access_request.review.decide");
  const canRevoke = hasFrontendPermission(auth.authorization, "project_access_grant.revoke");

  return (
    <section className="access-administration access-requests" aria-labelledby="access-request-inbox-title">
      <PageHeader id="access-request-inbox-title" eyebrow="Identity and access" title="Access requests" description="Review only the server-scoped project requests visible to you." />

      {reviewQuery.isPending ? (
        <PageState state="loading" message="Loading access requests…" />
      ) : reviewQuery.isError ? (
        <PageState state="error" message="We couldn't load access requests." action={{ label: "Try again", onAction: () => void reviewQuery.refetch() }} />
      ) : !page || page.items.length === 0 ? (
        <PageState state="empty" message={auth.user?.role === "admin" ? "There are no requests for projects you can review." : "There are no access requests to review."} />
      ) : (
        <Surface as="section" padding="compact" className="access-administration__directory" aria-label="Access request review inbox" aria-busy={reviewQuery.isFetching || undefined}>
          <div className="access-administration__table-scroll">
            <table className="access-administration__table access-requests__review-table">
              <thead><tr><th scope="col">Requester</th><th scope="col">Project</th><th scope="col">Module</th><th scope="col">Status</th><th scope="col">Request</th><th scope="col">Created</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {page.items.map((request) => (
                  <tr key={request.id}>
                    <td><span className="access-administration__identity"><strong>{request.requester.name}</strong><span>{request.requester.email}</span><small>{ROLE_LABELS[request.requester.role]}</small></span></td>
                    <td><span className="access-administration__identity">{request.project.resolved && request.project.name ? <strong>{request.project.name}</strong> : <><strong>{request.project.id}</strong><span>Unresolved project</span></>}</span></td>
                    <td>{request.module}</td>
                    <td><StatusBadge tone={statusTone[request.status]} label={statusLabel(request.status)} /></td>
                    <td><span className="access-administration__identity"><strong>{request.id}</strong><span>{request.reason}</span>{request.decisionReason ? <small>{request.decisionReason}</small> : null}<small>Version {request.version}</small></span></td>
                    <td><time dateTime={request.createdAt}>{dateTime.format(new Date(request.createdAt))}</time></td>
                    <td>
                      <div className="access-requests__row-actions">
                        {request.status === "pending" && canDecide ? <>
                          <Button size="compact" variant="secondary" onClick={() => setSelected({ request, kind: "approved" })}>Approve <span className="sr-only">request {request.id}</span></Button>
                          <Button size="compact" variant="quiet" onClick={() => setSelected({ request, kind: "rejected" })}>Reject <span className="sr-only">request {request.id}</span></Button>
                        </> : null}
                        {request.activeGrant && canRevoke ? <Button size="compact" variant="destructive" onClick={() => setSelected({ request, kind: "revoke" })}>Revoke <span className="sr-only">grant {request.activeGrant.id}</span></Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="access-administration__pagination" aria-label="Access request review pages">
            <p aria-live="polite">Showing {page.pagination.offset + 1}–{Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of {page.pagination.total}</p>
            <div>
              <Button size="compact" variant="quiet" disabled={pagination.offset === 0} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Previous page</Button>
              <Button size="compact" variant="secondary" disabled={!page.pagination.hasMore} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Next page</Button>
            </div>
          </nav>
        </Surface>
      )}

      {dialogRequest && (selected?.kind === "approved" || selected?.kind === "rejected") ? (
        <AccessRequestDecisionDialog request={dialogRequest} decision={selected.kind} isCurrentRow={decisionRowIsCurrent} onClose={() => setSelected(null)} />
      ) : dialogRequest && selected?.kind === "revoke" ? (
        <GrantRevocationDialog request={dialogRequest} isCurrentRow={grantRowIsCurrent} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}
