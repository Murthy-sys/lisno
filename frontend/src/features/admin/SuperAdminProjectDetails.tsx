import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import type { AdminProjectSummary } from "../../api/types";
import { ProjectId } from "../../components/projects/ProjectId";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ProjectChatNavigation } from "../messages";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { ProjectCompletionControl, ProjectFinancePanel, type ProjectFinanceExpectedSource } from "../finance/ProjectFinancePanel";
import { ProjectWorkflowSnapshot } from "../finance/FinanceProjectWorkflowControl";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import { VendorWorkProgressPanel } from "../workflow/VendorWorkProgressPanel";
import { canAssignProjectDesigner, formatWorkflowLabel, isDesignerAssignmentPending } from "./adminProjectPresentation";
import { ProjectClientPersona } from "./ProjectClientPersona";
import { ProjectPeopleAssignments, type ProjectAssignmentArea } from "./ProjectPeopleAssignments";
import { WorkerAssignmentPanel } from "./WorkerAssignmentPanel";
import { getProcurementProjectIdentity, procurementProjectIdentityKeys } from "./procurementProjectIdentityApi";

type View = "details" | "persona" | "assignments";
type Tool = "finance" | "design" | "vendors" | "workflow" | "response" | "trades";
const views: Array<{ id: View; label: string }> = [
  { id: "details", label: "Project details" }, { id: "persona", label: "Client persona" }, { id: "assignments", label: "Assignments" }
];
const assignmentAnchors = new Set(["#project-people-assignments", "#design-assignment-title"]);

interface Props {
  project: AdminProjectSummary;
  summary: {
    estimateLabel: string; estimateValue: string; createdLabel: string; initialBudget: string;
    nextAction: string | null; estimateStages: Array<{ label: string; value: string }>;
  };
  currentEstimateApproved: boolean;
  approvedFinanceSource: ProjectFinanceExpectedSource | null | undefined;
  permissions: {
    canAssignDesigner: boolean; canAssignWorkers: boolean; canManageProjectManager: boolean;
    canReadFinance: boolean; canReadClientResponses: boolean; canDecideCompletion: boolean;
    canReadWorkflow: boolean; canReadVendorWork: boolean;
  };
  onCompleted: () => void;
}

/** Project-keyed by its parent: visited editors survive navigation, never a project switch. */
export function SuperAdminProjectDetails({ project, summary, permissions, currentEstimateApproved, approvedFinanceSource, onCompleted }: Props) {
  const { hash } = useLocation();
  const [view, setView] = useState<View>(assignmentAnchors.has(hash) ? "assignments" : "details");
  const [assignmentsVisited, setAssignmentsVisited] = useState(assignmentAnchors.has(hash));
  const [area, setArea] = useState<ProjectAssignmentArea | null>("designer");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [visitedTools, setVisitedTools] = useState<Tool[]>([]);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null);
  const recordedLocation = project.location?.trim();
  const cityIdentity = useQuery({
    queryKey: procurementProjectIdentityKeys.detail(project.id),
    queryFn: async ({ signal }) => {
      const identity = await getProcurementProjectIdentity(project.id, signal);
      if (identity.projectId !== project.id) throw new Error("Project city belongs to a different project.");
      return identity;
    },
    enabled: !recordedLocation && view === "details" && permissions.canManageProjectManager
  });
  const cityUnavailable = cityIdentity.isError || Boolean(cityIdentity.data && cityIdentity.data.projectId !== project.id);

  const openAssignments = useCallback((target: string) => {
    setView("assignments"); setAssignmentsVisited(true); setArea("designer"); setFocusTarget(target);
  }, []);
  useEffect(() => {
    if (assignmentAnchors.has(hash)) openAssignments(hash === "#design-assignment-title" ? "design-assignment-title" : "project-people-assignments-title");
  }, [hash, openAssignments]);
  useEffect(() => {
    if (!focusTarget || view !== "assignments") return;
    const target = container.current?.querySelector<HTMLElement>(`#${focusTarget}`);
    if (target) { target.focus(); target.scrollIntoView?.({ block: "nearest" }); setFocusTarget(null); }
  }, [focusTarget, view, area]);

  const toolOptions: Array<{ id: Tool; label: string; allowed: boolean }> = [
    { id: "finance", label: "Finance", allowed: permissions.canReadFinance },
    { id: "design", label: "Design workflow", allowed: permissions.canReadWorkflow },
    { id: "vendors", label: "Vendor work", allowed: permissions.canReadVendorWork },
    { id: "workflow", label: "Entire workflow", allowed: permissions.canAssignWorkers },
    { id: "response", label: "Client response", allowed: Boolean(project.estimate?.clientReview) },
    { id: "trades", label: "Trade teams", allowed: permissions.canAssignWorkers }
  ];
  const tools = toolOptions.filter(tool => tool.allowed);
  function selectView(next: View) {
    setView(next);
    if (next === "assignments") setAssignmentsVisited(true);
  }
  function selectTool(next: Tool) {
    setActiveTool(next);
    setVisitedTools(previous => previous.includes(next) ? previous : [...previous, next]);
  }

  return <section ref={container} className="admin-project-detail admin-project-simple" aria-labelledby="admin-project-detail-title">
    <PageHeader id="admin-project-detail-title" title={project.name}
      breadcrumb={<Link to="/admin/projects">Back to All Projects</Link>}
      metadata={<ProjectId projectNumber={project.projectNumber} />}
      actions={<div className="project-status-header-actions">
        <ProjectStatusButton projectId={project.id} projectName={project.name} presentation="chip" />
        {permissions.canDecideCompletion && project.status === "active" ? <ProjectCompletionControl
          projectId={project.id} projectName={project.name} projectStatus={project.status}
          triggerLabel="Close project" onCompleted={onCompleted} /> : null}
      </div>} />
    <ProjectChatNavigation projectId={project.id} overviewTo={`/admin/projects/${encodeURIComponent(project.id)}`} showStatus={false} />

    <div className="admin-project-simple__navigation">
      <div className="admin-project-simple__views" role="group" aria-label="Project views">
        {views.map(item => <Button key={item.id} variant="quiet" aria-pressed={view === item.id}
          aria-controls={`project-view-${item.id}`} onClick={() => selectView(item.id)}>{item.label}</Button>)}
      </div>
      <div className="admin-project-simple__shortcuts">
        <a href="#project-people-assignments" onClick={event => { event.preventDefault(); openAssignments("project-people-assignments-title"); }}>Manage people</a>
        {isDesignerAssignmentPending(project) && permissions.canAssignDesigner && canAssignProjectDesigner(project) ?
          <a href="#design-assignment-title" onClick={event => { event.preventDefault(); openAssignments("design-assignment-title"); }}>Assign Designer</a> : null}
      </div>
    </div>

    <div id="project-view-details" hidden={view !== "details"} inert={view !== "details"}>
      <section className="admin-project-simple__section" aria-labelledby="project-facts-title">
        <h2 id="project-facts-title">Project details</h2>
        <dl className="admin-project-simple__facts">
          <div><dt>{recordedLocation ? "Location" : "Project city"}</dt><dd>{recordedLocation || (
            !permissions.canManageProjectManager ? "Not available"
              : cityUnavailable ? <><span>Project city could not be loaded.</span>{" "}<Button variant="quiet" size="compact"
                onClick={() => void cityIdentity.refetch()}>Retry project city</Button></>
                : cityIdentity.isPending ? "Loading project city…"
                  : cityIdentity.data?.city?.name?.trim() || "Not captured"
          )}</dd></div>
          <div><dt>Property type</dt><dd>{project.propertyType || "Not captured"}</dd></div>
          <div><dt>Created</dt><dd>{summary.createdLabel === "Not captured" ? summary.createdLabel : <time dateTime={project.createdAt}>{summary.createdLabel}</time>}</dd></div>
          <div><dt>Initial client budget range</dt><dd>{summary.initialBudget}</dd></div>
          <div className="admin-project-simple__total"><dt>{summary.estimateLabel}</dt><dd>{summary.estimateValue}</dd></div>
          <div><dt>Next action</dt><dd>{summary.nextAction || "Not captured"}</dd></div>
          {summary.estimateStages.map(stage => <div key={stage.label}><dt>{stage.label}</dt><dd>{stage.value}</dd></div>)}
          <div><dt>Sales contact</dt><dd>{project.estimator?.name || "Unassigned"}{project.estimator?.email ? <span className="admin-project-simple__secondary">{project.estimator.email}</span> : null}</dd></div>
        </dl>
        <details className="admin-project-simple__technical"><summary>Technical details</summary><p>System ID: {project.id}</p></details>
      </section>
    </div>
    <div id="project-view-persona" hidden={view !== "persona"} inert={view !== "persona"}>
      {view === "persona" ? <ProjectClientPersona project={project} /> : null}
    </div>
    <div id="project-view-assignments" hidden={view !== "assignments"} inert={view !== "assignments"}>
      {assignmentsVisited ? <ProjectPeopleAssignments project={project} presentation="primary" area={area} onAreaChange={setArea}
        canAssignDesigner={permissions.canAssignDesigner} canAssignWorkers={permissions.canAssignWorkers}
        canManageProjectManager={permissions.canManageProjectManager} /> : null}
    </div>

    {tools.length ? <details className="admin-project-simple__tools" open={toolsOpen} onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary>More project tools</summary>
      <div role="group" aria-label="Project tools" className="admin-project-simple__tool-options">
        {tools.map(tool => <Button key={tool.id} variant="quiet" aria-pressed={activeTool === tool.id}
          aria-controls={`project-tool-${tool.id}`} onClick={() => selectTool(tool.id)}>{tool.label}</Button>)}
      </div>
      {activeTool === null ? <p className="admin-project-simple__hint">Choose a tool to view its details.</p> : null}
      {tools.map(tool => <div key={tool.id} id={`project-tool-${tool.id}`} hidden={!toolsOpen || activeTool !== tool.id}
        inert={!toolsOpen || activeTool !== tool.id}>
        {visitedTools.includes(tool.id) ? tool.id === "finance" ? <ProjectFinancePanel projectId={project.id} enabled={currentEstimateApproved}
          title={`${project.name} finance`} expectedSource={approvedFinanceSource} />
          : tool.id === "design" ? <ProjectWorkflowPanel projectId={project.id} />
          : tool.id === "vendors" ? <VendorWorkProgressPanel projectId={project.id} projectName={project.name} />
          : tool.id === "workflow" ? <ProjectWorkflowSnapshot project={project} />
          : tool.id === "trades" ? <WorkerAssignmentPanel project={project} assignmentArea="trades" defaultExpanded />
          : <ClientResponse project={project} canRead={permissions.canReadClientResponses} /> : null}
      </div>)}
    </details> : null}
  </section>;
}

function ClientResponse({ project, canRead }: { project: AdminProjectSummary; canRead: boolean }) {
  const review = project.estimate?.clientReview;
  if (!review) return null;
  const delivery = review.deliveryStatus === "sent" ? "Email sent" : review.deliveryStatus === "failed" ? "Email delivery failed"
    : review.deliveryStatus === "disabled" ? "Email unavailable" : "Email queued";
  return <section className="admin-project-simple__section" aria-label="Client response">
    <h2>Client response</h2>
    <StatusBadge tone={review.status === "approved" ? "success" : review.status === "changes_requested" ? "danger" : "warning"}
      label={formatWorkflowLabel(review.status)} />
    <p>{delivery}</p>
    {project.estimate?.hasPendingClientResponseTask && canRead ? <Link to={`/admin/client-responses/${encodeURIComponent(review.id)}`}>Review Client response</Link>
      : <p>Read-only Client response history</p>}
  </section>;
}
