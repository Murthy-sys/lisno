import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { PenTool } from "lucide-react";
import { ApiError } from "../../api/client";
import type { AdminProjectSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { PROJECT_LANGUAGE_OPTIONS } from "../../../../shared/projects/projectInitiation";
import { projectReadDenied } from "../projects/projectReadQueries";
import { AdminDetailSection } from "./AdminDetailSection";
import { canAssignProjectDesigner, hasInitialEstimateApproval } from "./adminProjectPresentation";
import {
  assignmentPageSize, cancelDesignerAssignmentRequest, createDesignerAssignmentRequest,
  designerAssignmentKeys, getDesignerSuggestions, refreshDesignerAssignment
} from "../designer/designerAssignmentApi";
import "../designer/designerHandoff.css";

const languageLabel = (value: string | null) => PROJECT_LANGUAGE_OPTIONS.find(option => option.value === value)?.label ?? "Not provided";
const languageMatches = { preferred: "Preferred language matches project", known: "Speaks the project’s preferred language", none: "No language match", unknown: "Language match unavailable" };
const locationMatches = { same_location: "Same area/location", city_text: "City text match", none: "No location match", unknown: "Location match unavailable" };
type AssignmentAction = { kind: "request"; designerId: string; revision: string } | { kind: "cancel"; requestId: string; designerId: string; version: number };
type DesignAssignmentPanelProps = { project: AdminProjectSummary; canManage?: boolean };

export function DesignAssignmentPanel(props: DesignAssignmentPanelProps) {
  const { user, reviewSession } = useAuth();
  const actor = `${user?.id}:${user?.role}:${reviewSession?.id ?? ""}`;
  return <ProjectDesignerAssignment key={`${props.project.id}:${actor}`} {...props} actor={actor} />;
}

function ProjectDesignerAssignment({ project, canManage = false, actor }: DesignAssignmentPanelProps & { actor: string }) {
  const client = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const keys = useRef(new Map<string, { action: AssignmentAction; key: string }>());
  const focusedCandidate = useRef<HTMLElement | null>(null);
  const assignedSummary = useRef<HTMLDivElement>(null);
  const eligible = canManage && canAssignProjectDesigner(project);
  const designers = useQuery({
    queryKey: designerAssignmentKeys.suggestions(project.id, actor, search, offset),
    queryFn: () => getDesignerSuggestions(project.id, search, offset), enabled: eligible, refetchInterval: 60_000
  });
  const assignment = useMutation({
    mutationFn: (action: AssignmentAction) => {
      // The pending card proves creation committed, even if that response was lost.
      if (action.kind === "cancel") {
        for (const [signature, entry] of keys.current) {
          if (entry.action.kind === "request" && entry.action.designerId === action.designerId) keys.current.delete(signature);
        }
      }
      const signature = JSON.stringify(action);
      const idempotencyKey = keys.current.get(signature)?.key ?? crypto.randomUUID();
      keys.current.set(signature, { action, key: idempotencyKey });
      return action.kind === "request"
        ? createDesignerAssignmentRequest(project.id, { designerId: action.designerId, expectedSourceRevision: action.revision, idempotencyKey })
        : cancelDesignerAssignmentRequest(project.id, action.requestId, { expectedVersion: action.version, idempotencyKey });
    },
    onSuccess: async (_result, action) => {
      keys.current.delete(JSON.stringify(action));
      await refreshDesignerAssignment(client, project.id);
    }
  });
  const data = eligible && !projectReadDenied(designers.error) && designers.data?.projectId === project.id ? designers.data : undefined;
  // Preserve the last authorized response, including an explicit null, during transient errors.
  const assignedDesigner = data ? data.currentDesigner : project.estimate?.designPlanDesigner;
  useLayoutEffect(() => {
    // Removing a focused candidate control sends focus to body; keep it in this panel.
    if (assignedDesigner && focusedCandidate.current && !focusedCandidate.current.isConnected && document.activeElement === document.body) {
      assignedSummary.current?.focus();
    }
    if (assignedDesigner || !eligible) focusedCandidate.current = null;
  }, [assignedDesigner, eligible]);
  const conflict = assignment.error instanceof ApiError && assignment.error.status === 409;
  const busy = designers.isFetching || designers.isError || assignment.isPending || conflict;
  const blockedReason = !canManage ? "You do not have permission to assign a Designer."
    : project.estimate?.designerAssignmentBlockedReason ?? (project.estimationWorkflowVersion === 3 && project.estimate?.canAssignDesigner === undefined
      ? "Assignment availability is unavailable. Refresh the project to try again."
      : "Initial Client approval is required before assigning a Designer.");
  const refresh = async () => {
    await refreshDesignerAssignment(client, project.id);
    assignment.reset();
  };
  const pendingByDesigner = new Map(data?.pendingRequests.map(request => [request.designer.id, request]));
  return <AdminDetailSection icon={<PenTool aria-hidden="true" />} tone="warm" title="Design plan assignment" subtitle={assignedDesigner ? "Assigned project Designer" : "Send requests and track Designer acceptance"} id="design-assignment-title" defaultOpen>
    {assignedDesigner ? <div ref={assignedSummary} tabIndex={-1}>
      <h3>Assigned Designer</h3>
      <p>{`This project is assigned to ${assignedDesigner.name}.`}</p>
      {eligible && designers.isError ? <div role="alert">
        <p>Assignment details could not be refreshed.</p>
        <Button variant="secondary" disabled={designers.isFetching} onClick={() => void designers.refetch()}>Retry assignment</Button>
      </div> : null}
    </div> : !project.estimate || !hasInitialEstimateApproval(project) || !eligible ? <p>{blockedReason}</p> : <div className="designer-suggestions"
      onFocusCapture={event => { focusedCandidate.current = event.target; }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) focusedCandidate.current = null; }}>
      <p>Suggested by projects handling, project language, then saved location. Every active Designer remains available for review.</p>
      {data ? <>
        <p>Project language: {languageLabel(data.projectPreferredLanguage)} · Location: {data.projectLocation || data.projectCity || "Not provided"}</p>
        <p>No accepted Designer assignment yet.</p>
        <p>The first Designer to accept will be assigned. Other pending requests will close automatically.</p>
        {data.pendingRequests.length > 0 ? <div className="designer-suggestions__pending">
          <details>
            <summary>{data.pendingRequests.length} pending assignment {data.pendingRequests.length === 1 ? "request" : "requests"}</summary>
            <ul aria-label="Pending Designer requests">{data.pendingRequests.map(request => <li key={request.id}>
              <span>{request.designer.name}</span>
              <Button type="button" variant="secondary" disabled={busy} aria-label={`Cancel assignment request to ${request.designer.name}`} onClick={() => assignment.mutate({ kind: "cancel", requestId: request.id, designerId: request.designer.id, version: request.version })}>Cancel request</Button>
            </li>)}</ul>
          </details>
        </div> : null}
        {data.blockedReason ? <p role="status">{data.blockedReason}</p> : null}
      </> : null}
      <form className="designer-suggestions__search" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setOffset(0); }}>
        <Field id={`designer-search-${project.id}`} label="Search Designers by name">{props => <Input {...props} value={searchInput} onChange={event => setSearchInput(event.target.value)} />}</Field>
        <Button variant="secondary" type="submit" disabled={assignment.isPending}>Search</Button>
      </form>
      {designers.isPending ? <p role="status">Loading active Designers…</p> : null}
      {designers.isError ? <div role="alert"><p>Active Designers could not be loaded. Refresh before sending a request.</p><Button variant="secondary" onClick={() => void designers.refetch()}>Retry Designers</Button></div> : null}
      {assignment.isError ? <div role="alert"><p>{assignment.error instanceof ApiError ? assignment.error.message : "The assignment request could not be saved."}</p>{conflict ? <Button variant="secondary" onClick={() => void refresh()}>Refresh assignment</Button> : null}</div> : null}
      {assignment.isSuccess ? <p role="status">{assignment.variables.kind === "cancel" ? "Assignment request cancelled." : assignment.data.status === "pending" ? "Assignment request sent. Waiting for the Designer to accept." : "This assignment request has already been resolved. The assignment details have been refreshed."}</p> : null}
      {data?.items.length === 0 ? <p>No active Designers match this search.</p> : null}
      {data ? <><ol className="designer-suggestions__list" aria-label="Designer suggestions">{data.items.map(designer => {
        const pending = pendingByDesigner.get(designer.id);
        return <li className="designer-suggestion" key={designer.id}>
        <h3>{designer.name}</h3>
        <dl><div><dt>Projects handling</dt><dd>{designer.activeProjectCount}</dd></div>
          <div><dt>Preferred language</dt><dd>{languageLabel(designer.preferredLanguage)}</dd></div>
          <div><dt>Known languages</dt><dd>{designer.languagesKnown.length ? designer.languagesKnown.map(languageLabel).join(", ") : "Not provided"}</dd></div>
          <div><dt>Location</dt><dd>{designer.location || "Not provided"}</dd></div></dl>
        <p className="designer-suggestion__match">{languageMatches[designer.languageMatch]} · {locationMatches[designer.locationMatch]}</p>
        {designer.blockedReason ? <p>{designer.blockedReason}</p> : null}
        <div className="designer-assignment-actions">
          {pending ? <>
            <p className="designer-suggestion__state">Request sent</p>
            <Button type="button" variant="secondary" disabled={busy} aria-label={`Cancel assignment request to ${designer.name}`} onClick={() => assignment.mutate({ kind: "cancel", requestId: pending.id, designerId: designer.id, version: pending.version })}>Cancel request</Button>
          </> : <Button type="button" disabled={busy || !data.canRequest || !data.sourceRevision || !designer.eligible} aria-label={`Send assignment request to ${designer.name}`} onClick={() => {
            if (data.sourceRevision) assignment.mutate({ kind: "request", designerId: designer.id, revision: data.sourceRevision });
          }}>Send assignment request</Button>}
        </div>
      </li>; })}</ol>
        <nav className="designer-assignment-pagination" aria-label="Designer suggestions pages"><Button variant="secondary" disabled={offset === 0 || designers.isFetching || assignment.isPending} onClick={() => setOffset(Math.max(0, offset - assignmentPageSize))}>Previous Designers</Button><span>{data.pagination.total} active Designers</span><Button variant="secondary" disabled={!data.pagination.hasMore || designers.isFetching || assignment.isPending} onClick={() => setOffset(offset + assignmentPageSize)}>Next Designers</Button></nav>
      </> : null}
    </div>}
  </AdminDetailSection>;
}
