import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { PROJECT_LANGUAGE_OPTIONS } from "../../../../shared/projects/projectInitiation";
import type { DesignerAssignmentInboxItem } from "../../../../shared/projects/designerAssignment";
import { projectReadDenied } from "../projects/projectReadQueries";
import { assignmentPageSize, decideDesignerAssignment, designerAssignmentKeys, getDesignerAssignmentInbox, refreshDesignerAssignment } from "./designerAssignmentApi";
import "./designerHandoff.css";

interface DesignerAssignmentInboxProps {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function DesignerAssignmentInbox(props: DesignerAssignmentInboxProps) {
  const { user, authorization, reviewSession } = useAuth();
  const canRead = user?.role === "designer" && hasFrontendPermission(authorization, "design.assignment_requests.read");
  if (!canRead) return null;
  const actor = `${user.id}:${user.role}:${reviewSession?.id ?? ""}`;
  return <AssignmentReminder key={actor} {...props} actor={actor}
    canDecide={hasFrontendPermission(authorization, "design.assignment_requests.decide")} />;
}

function AssignmentReminder({ actor, canDecide, fallbackFocusRef }: DesignerAssignmentInboxProps & { actor: string; canDecide: boolean }) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [knownTotal, setKnownTotal] = useState<number>();
  const [refreshingOnOpen, setRefreshingOnOpen] = useState(false);
  const [changedNotice, setChangedNotice] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousPage = useRef<{ offset: number; ids: string[] } | null>(null);
  const keys = useRef(new Map<string, string>());
  const requests = useQuery({
    queryKey: designerAssignmentKeys.inbox(actor, offset),
    queryFn: () => getDesignerAssignmentInbox(offset), refetchInterval: 60_000
  });
  const decision = useMutation({
    mutationFn: ({ request, choice }: { request: DesignerAssignmentInboxItem; choice: "accept" | "decline" }) => {
      const signature = `${request.id}:${request.version}:${choice}`;
      const idempotencyKey = keys.current.get(signature) ?? crypto.randomUUID();
      keys.current.set(signature, idempotencyKey);
      return decideDesignerAssignment(request.id, { expectedVersion: request.version, decision: choice, idempotencyKey });
    },
    onSuccess: async (_result, { request, choice }) => {
      keys.current.delete(`${request.id}:${request.version}:${choice}`);
      await refreshDesignerAssignment(queryClient, request.projectId);
    },
    onError: async (error, { request }) => {
      if (error instanceof ApiError && error.status === 409) await refreshDesignerAssignment(queryClient, request.projectId);
    }
  });
  const denied = projectReadDenied(requests.error);
  const data = !denied ? requests.data : undefined;
  const conflict = decision.error instanceof ApiError && decision.error.status === 409;
  useEffect(() => {
    if (denied) {
      setOpen(false);
      setKnownTotal(undefined);
      previousPage.current = null;
    }
  }, [denied]);
  useEffect(() => {
    if (!data || !requests.isSuccess || requests.isFetching) return;
    setKnownTotal(data.pagination.total);
    if (offset > 0 && offset >= data.pagination.total) {
      setOffset(Math.max(0, Math.ceil(data.pagination.total / assignmentPageSize) - 1) * assignmentPageSize);
    }
    const previous = previousPage.current;
    if (open && !decision.isPending && previous?.offset === offset &&
      previous.ids.some(id => !data.items.some(request => request.id === id))) {
      setChangedNotice(true);
    }
    previousPage.current = { offset, ids: data.items.map(request => request.id) };
  }, [data, requests.isSuccess, requests.isFetching, offset, open, decision.isPending]);

  const refresh = async () => {
    const result = await requests.refetch();
    if (result.isSuccess) decision.reset();
  };
  const showRequests = async () => {
    setOpen(true);
    setChangedNotice(false);
    setRefreshingOnOpen(true);
    try { await refresh(); } finally { setRefreshingOnOpen(false); }
  };
  if (denied) return null;
  const total = data?.pagination.total ?? knownTotal;
  return <>
    {requests.isError || (total !== undefined && total > 0) ? <button type="button"
      className="designer-assignment-reminder" ref={trigger} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => void showRequests()}>
      {requests.isError ? "Assignment requests · Retry" : `Assignment requests (${total})`}
    </button> : null}
    {open ? <Dialog title="Assignment requests" description="Review the project summary. Accept an assignment to open its design workflow."
      className="designer-assignment-dialog" busy={decision.isPending} onClose={() => setOpen(false)}
      returnFocusRef={trigger} fallbackFocusRef={fallbackFocusRef}>
    <div className="designer-request-inbox designer-request-inbox--dialog">
    {requests.isPending ? <p role="status">Loading assignment requests…</p> : null}
    {requests.isError ? <div role="alert"><p>Assignment requests could not be refreshed.</p><Button variant="secondary" onClick={() => void requests.refetch()}>Retry requests</Button></div> : null}
    {decision.isError ? <div role="alert"><p>{decision.error instanceof ApiError ? decision.error.message : "Your response could not be saved."}</p>{conflict ? <Button variant="secondary" onClick={() => void refresh()}>Refresh requests</Button> : null}</div> : null}
    {decision.isSuccess ? <p role="status">{decision.variables.choice === "accept" ? "Assignment accepted. Your project is now available in Assigned projects." : "Assignment declined."}</p> : null}
    {changedNotice && !decision.isSuccess && !decision.isError ? <p role="status">Some assignment requests have closed or changed. Review the current requests below.</p> : null}
    {data?.items.length === 0 ? <p>No pending assignment requests.</p> : null}
    <ul className="designer-request-inbox__list">{data?.items.map(request => <li className="designer-request" key={request.id}>
      <h3>{request.projectName}</h3>
      <dl><div><dt>Location</dt><dd>{request.projectLocation || "Not provided"}</dd></div>
        <div><dt>Project language</dt><dd>{PROJECT_LANGUAGE_OPTIONS.find(option => option.value === request.preferredLanguage)?.label ?? "Not provided"}</dd></div>
        <div><dt>Approved scope</dt><dd>{request.scopeSummary.itemCount} items · {request.scopeSummary.sectionCount} sections · {request.scopeSummary.roomCount} rooms</dd></div></dl>
      {request.closureReason === "assigned_elsewhere" ? <p>This assignment request has closed because the project has been assigned.</p> : request.blockedReason ? <p>{request.blockedReason}</p> : null}
      <div className="designer-assignment-actions">
        {(["accept", "decline"] as const).map(choice => <Button key={choice} variant={choice === "accept" ? "primary" : "secondary"}
          aria-label={`${choice === "accept" ? "Accept" : "Decline"} assignment for ${request.projectName}`}
          disabled={!canDecide || request.status !== "pending" || !request.canDecide || requests.isFetching || refreshingOnOpen || requests.isError || decision.isPending || conflict}
          onClick={() => decision.mutate({ request, choice })}>{choice === "accept" ? "Accept assignment" : "Decline"}</Button>)}
      </div>
    </li>)}</ul>
    {data && (offset > 0 || data.pagination.total > assignmentPageSize) ? <nav className="designer-assignment-pagination" aria-label="Assignment request pages">
      <Button variant="secondary" disabled={!offset || requests.isFetching || decision.isPending} onClick={() => setOffset(Math.max(0, offset - assignmentPageSize))}>Previous requests</Button>
      <Button variant="secondary" disabled={!data.pagination.hasMore || requests.isFetching || decision.isPending} onClick={() => setOffset(offset + assignmentPageSize)}>Next requests</Button>
    </nav> : null}
    </div>
    </Dialog> : null}
  </>;
}
