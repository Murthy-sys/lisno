import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  REQUESTABLE_MODULES_BY_ROLE,
  roleMayRequestModule,
  type RequestableProjectModule
} from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type { OwnAccessRequest, PaginationInput } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { AccessRequestDialog, opaqueProjectIdSchema } from "./AccessRequestDialog";
import {
  cancelAccessRequest,
  getOwnAccessRequests,
  ownAccessRequestKeys
} from "./accessRequestsApi";

const PAGE_SIZE = 20;
const date = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const statusTone = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral"
} as const;

function labelStatus(status: OwnAccessRequest["status"]) {
  return status[0].toUpperCase() + status.slice(1);
}

export function MyAccessRequestsPage() {
  const auth = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [pagination, setPagination] = useState<PaginationInput>({ limit: PAGE_SIZE, offset: 0 });
  const [dialogModule, setDialogModule] = useState<RequestableProjectModule | null>(null);
  const [initialProjectId, setInitialProjectId] = useState("");
  const prefillHandled = useRef(false);
  const role = auth.user?.role;
  const eligibleModules = role ? REQUESTABLE_MODULES_BY_ROLE[role] : [];
  const canCreate = Boolean(
    role &&
      eligibleModules.length === 1 &&
      hasFrontendPermission(auth.authorization, "access_request.create")
  );

  const ownQuery = useQuery({
    queryKey: ownAccessRequestKeys.page({}, pagination),
    queryFn: () => getOwnAccessRequests({}, pagination),
    placeholderData: keepPreviousData
  });

  useEffect(() => {
    if (prefillHandled.current || !role || !canCreate) return;
    prefillHandled.current = true;
    const projectId = searchParams.get("projectId");
    const requestedModule = searchParams.get("module");
    const module = eligibleModules[0];
    if (
      projectId &&
      requestedModule === module &&
      opaqueProjectIdSchema.safeParse(projectId).success &&
      roleMayRequestModule(role, module)
    ) {
      setInitialProjectId(projectId);
      setDialogModule(module);
    }
  }, [canCreate, eligibleModules, role, searchParams]);

  const cancelMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      cancelAccessRequest(id, version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all }),
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all });
        feedback.announce(
          "The access request changed elsewhere. Latest details are now shown."
        );
        return;
      }
      feedback.announce("The access request could not be cancelled.");
    }
  });

  const page = ownQuery.data;
  return (
    <section className="access-administration access-requests" aria-labelledby="my-access-requests-title">
      <PageHeader
        id="my-access-requests-title"
        eyebrow="Project access"
        title="My access requests"
        description="Review the opaque identifiers and decisions recorded for your requests."
        actions={canCreate && eligibleModules[0] ? (
          <Button onClick={() => setDialogModule(eligibleModules[0])}>Create request</Button>
        ) : undefined}
      />

      {ownQuery.isPending ? (
        <PageState state="loading" message="Loading your access requests…" />
      ) : ownQuery.isError ? (
        <PageState state="error" message="We couldn't load your access requests." action={{ label: "Try again", onAction: () => void ownQuery.refetch() }} />
      ) : !page || page.items.length === 0 ? (
        <PageState state="empty" message="You have no access requests." />
      ) : (
        <Surface as="section" padding="compact" className="access-administration__directory" aria-label="My access request history" aria-busy={ownQuery.isFetching || undefined}>
          <div className="access-administration__table-scroll">
            <table className="access-administration__table access-requests__table">
              <thead><tr><th scope="col">Project ID</th><th scope="col">Module</th><th scope="col">Status</th><th scope="col">Reason</th><th scope="col">Created</th><th scope="col">Updated</th><th scope="col">Reviewed</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {page.items.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.projectId}</strong><small className="access-requests__version">Version {request.version}</small></td>
                    <td>{request.module}</td>
                    <td><StatusBadge tone={statusTone[request.status]} label={labelStatus(request.status)} /></td>
                    <td><span className="access-requests__reason">{request.reason}</span>{request.decisionReason ? <small>{request.decisionReason}</small> : null}</td>
                    <td><time dateTime={request.createdAt}>{date.format(new Date(request.createdAt))}</time></td>
                    <td><time dateTime={request.updatedAt}>{date.format(new Date(request.updatedAt))}</time></td>
                    <td>{request.reviewedAt ? <time dateTime={request.reviewedAt}>{date.format(new Date(request.reviewedAt))}</time> : <span aria-label="Not reviewed">—</span>}</td>
                    <td>
                      {request.status === "pending" && role !== "super_admin" && hasFrontendPermission(auth.authorization, "access_request.self.cancel") ? (
                        <Button
                          size="compact"
                          variant="secondary"
                          busy={cancelMutation.isPending && cancelMutation.variables?.id === request.id}
                          busyLabel="Cancelling…"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate({ id: request.id, version: request.version })}
                        >Cancel request</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="access-administration__pagination" aria-label="My access request pages">
            <p aria-live="polite">Showing {page.pagination.offset + 1}–{Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of {page.pagination.total}</p>
            <div>
              <Button size="compact" variant="quiet" disabled={pagination.offset === 0} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Previous page</Button>
              <Button size="compact" variant="secondary" disabled={!page.pagination.hasMore} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Next page</Button>
            </div>
          </nav>
        </Surface>
      )}

      {dialogModule && role ? (
        <AccessRequestDialog role={role} module={dialogModule} initialProjectId={initialProjectId} onClose={() => { setDialogModule(null); setInitialProjectId(""); }} />
      ) : null}
    </section>
  );
}
