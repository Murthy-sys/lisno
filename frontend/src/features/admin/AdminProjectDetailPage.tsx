import { KeyCollectionHeader } from "../workflow/KeyCollectionHeader";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { ProjectId } from "../../components/projects/ProjectId";
import { ProjectChatNavigation } from "../messages";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileEdit, MessageSquare, User } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import projectInterior from "../../assets/projects-living-room.webp";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  adminEstimateStages,
  canAssignProjectCoordination,
  canAssignProjectDesigner,
  hasInitialEstimateApproval,
  adminProjectNextAction,
  adminProjectStatusLabel,
  formatWorkflowLabel,
  isDesignerAssignmentPending
} from "./adminProjectPresentation";
import { adminProjectKeys, getAdminProject } from "./adminProjectsApi";
import { AdminDetailSection } from "./AdminDetailSection";
import { ProjectPeopleAssignments, type ProjectAssignmentArea } from "./ProjectPeopleAssignments";
import { getAdminProjectWorkflowTasks, projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { ProjectCompletionControl, ProjectFinancePanel } from "../finance/ProjectFinancePanel";
import { ProjectWorkflowSnapshot } from "../finance/FinanceProjectWorkflowControl";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import { currentQuotationIsApproved } from "../estimates/quotationApproval";
import { SuperAdminProjectDetails } from "./SuperAdminProjectDetails";
import "./admin-project-detail.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

function deliveryLabel(value: string) {
  return value === "sent"
    ? "Email sent"
    : value === "failed"
      ? "Email delivery failed"
      : value === "disabled"
        ? "Email unavailable"
        : "Email queued";
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "We couldn't load this project.";
}

export function AdminProjectDetailPage() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const [assignmentSelection, setAssignmentSelection] = useState<{ projectId: string; area: ProjectAssignmentArea } | null>(null);
  const assignmentArea = assignmentSelection?.projectId === projectId ? assignmentSelection.area : null;
  const setAssignmentArea = (area: ProjectAssignmentArea) => setAssignmentSelection({ projectId, area });
  const projectQuery = useQuery({
    queryKey: adminProjectKeys.detail(projectId),
    queryFn: () => getAdminProject(projectId),
    enabled: Boolean(projectId)
  });
  const project = projectQuery.data;
  const canReadClientResponses = hasFrontendPermission(
    auth.authorization,
    "estimation.client_response_tasks.read"
  );
  const canAssignDesigner = hasFrontendPermission(
    auth.authorization,
    "design.plan_assignment.manage"
  );
  const canAssignWorkers = hasFrontendPermission(
    auth.authorization,
    "execution.worker_assignment.override"
  );
  const canReadFinance = hasFrontendPermission(
    auth.authorization,
    "finance.bucket.read"
  );
  const canManageProcurementIdentity = hasFrontendPermission(
    auth.authorization,
    "projects.procurement_identity.manage"
  );
  const canDecideCompletion = auth.user?.role === "super_admin" &&
    hasFrontendPermission(auth.authorization, "procurement.project_completion.decide");

  const coordination = useQuery({
    queryKey: projectWorkflowKeys.projectTasks(projectId),
    queryFn: () => getAdminProjectWorkflowTasks(projectId),
    enabled: auth.user?.role !== "super_admin" && canAssignWorkers && Boolean(project && canAssignProjectCoordination(project))
  });

  if (projectQuery.isPending) return <PageState state="loading" message="Loading project details…" />;
  if (projectQuery.isError) {
    return <PageState state="error" message={errorMessage(projectQuery.error)} action={{ label: "Try again", onAction: () => void projectQuery.refetch() }} />;
  }
  if (!project) return <PageState state="empty" message="Project details are unavailable." />;
  if (project.id !== projectId) return <PageState state="error" message="These details do not match the requested project." action={{ label: "Try again", onAction: () => void projectQuery.refetch() }} />;

  const nextAction = adminProjectNextAction(project);
  const assignmentPending = isDesignerAssignmentPending(project);
  const estimateApproved = hasInitialEstimateApproval(project);
  const currentEstimateApproved = project.estimationWorkflowVersion === 3
    ? currentQuotationIsApproved(project.estimate)
    : project.estimate?.status === "client_approved";
  const estimateStages = adminEstimateStages(project);
  const approvedBaseline = estimateApproved
    ? project.estimate?.approvedBaseline ?? null
    : null;
  const approvedFinanceSource = currentEstimateApproved && project.estimate
    ? approvedBaseline
      ? {
        projectId: project.estimate.resolvedProjectId,
        projectName: project.name,
        estimateId: project.estimate.id,
        estimateVersion: approvedBaseline.estimateVersion,
        approvedSubtotalPaise: rupeesToPaise(approvedBaseline.subtotal),
        approvedGstPaise: rupeesToPaise(approvedBaseline.gst),
        approvedContractTotalPaise: rupeesToPaise(approvedBaseline.total)
      }
      : null
    : undefined;
  const estimateLabel = estimateApproved ? "Client-approved value (incl. GST)" : "Current estimate value (incl. GST)";
  const estimateValue = estimateApproved
    ? approvedBaseline ? money.format(approvedBaseline.total) : "Approved baseline unavailable"
    : project.estimate ? money.format(project.estimate.total) : "No estimate yet";
  const createdDate = new Date(project.createdAt);
  const createdLabel = Number.isNaN(createdDate.getTime()) ? "Not captured" : date.format(createdDate);
  const initialBudget = project.budgetMin == null || project.budgetMax == null || !Number.isFinite(project.budgetMin) || !Number.isFinite(project.budgetMax)
    ? "Not captured" : `${money.format(project.budgetMin)} – ${money.format(project.budgetMax)}`;
  if (auth.user?.role === "super_admin") return <SuperAdminProjectDetails key={project.id}
    project={project}
    summary={{ estimateLabel, estimateValue, createdLabel, initialBudget, nextAction, estimateStages }}
    currentEstimateApproved={currentEstimateApproved}
    approvedFinanceSource={approvedFinanceSource}
    permissions={{ canAssignDesigner, canAssignWorkers, canManageProjectManager: canManageProcurementIdentity,
      canReadFinance, canReadClientResponses, canDecideCompletion,
      canReadWorkflow: hasFrontendPermission(auth.authorization, "projects.design_workflow.read"),
      canReadVendorWork: hasFrontendPermission(auth.authorization, "execution.tracker.read") }}
    onCompleted={() => void projectQuery.refetch()} />;
  const people = [
    ...(project.estimator ? [{ role: "Sales", name: project.estimator.name, email: project.estimator.email }] : []),
    ...(project.estimate?.designPlanDesigner ? [{ role: "Designer", name: project.estimate.designPlanDesigner.name, email: project.estimate.designPlanDesigner.email }] : []),
    ...(canAssignWorkers && canAssignProjectCoordination(project) ? ([{ kind: "procurement", role: "Procurement" }, { kind: "site_execution", role: "Project Manager" }] as const).map(({ kind, role }) => {
      const matches = coordination.data?.filter(task => task.projectId === project.id && task.estimateId === project.estimate?.id && task.kind === kind) ?? [];
      const task = matches.length === 1 ? matches[0] : undefined;
      return { role, name: !canAssignProjectCoordination(project) ? "Not available yet" : coordination.isPending ? "Loading assignment…"
        : coordination.isError || matches.length > 1 ? "Assignment unavailable" : task?.assignedWorker?.name ?? "Unassigned",
        email: canAssignProjectCoordination(project) && !coordination.isError ? task?.assignedWorker?.email ?? "" : "" };
    }) : []),
    { role: "Client", name: project.client.name, email: project.client.email }
  ];

  return (
    <section className="access-administration admin-project-detail admin-project-reference" aria-labelledby="admin-project-detail-title">
      <div className="admin-project-reference__hero">
      <PageHeader
        id="admin-project-detail-title"
        eyebrow="Project administration"
        title={project.name}
        description="Manage project people, review approvals and follow delivery progress."
        breadcrumb={<Link to="/admin/projects"><ArrowLeft aria-hidden="true" /> Back to My Projects</Link>}
        metadata={<>
          <ProjectId className="admin-project-reference__identifier" projectNumber={project.projectNumber} />
          <StatusBadge tone="info" label={adminProjectStatusLabel(project)} />
          <span className="admin-project-reference__identifier">System ID: {project.id}</span>
          <span>Created <time dateTime={project.createdAt}>{createdLabel}</time></span>
        </>}
        actions={<div className="project-status-header-actions">
          {canDecideCompletion && project.status === "active" ? <ProjectCompletionControl key={project.id}
            projectId={project.id} projectName={project.name} projectStatus={project.status}
            triggerLabel="Close project" onCompleted={() => void projectQuery.refetch()} /> : null}
          <a className="button button--secondary" href="#project-people-assignments" onClick={() => setAssignmentArea(canAssignWorkers ? "procurement" : "designer")}>Manage people</a>
          {assignmentPending && canAssignDesigner && canAssignProjectDesigner(project) ? <a className="button button--primary" href="#design-assignment-title" onClick={() => setAssignmentArea("designer")}>Assign Designer</a> : null}
          <KeyCollectionHeader projectId={project.id} projectName={project.name} /><ProjectStatusButton projectId={project.id} projectName={project.name} presentation="chip" />
        </div>}
      />
      </div>
      <ProjectChatNavigation projectId={projectId} overviewTo={`/admin/projects/${projectId}`} showStatus={false} />
      <div className="admin-project-reference__layout">
      <div className="admin-project-reference__main">
      <section className="admin-project-reference__facts" aria-label="Project summary">
        <dl>
          <div><dt>Client</dt><dd>{project.client.name}</dd></div>
          <div><dt>Location</dt><dd>{project.location}</dd></div>
          <div><dt>Property type</dt><dd>{project.propertyType ?? "Not captured"}</dd></div>
          <div><dt>Created</dt><dd><time dateTime={project.createdAt}>{createdLabel}</time></dd></div>
          <div><dt>{estimateLabel}</dt><dd>{estimateValue}{project.estimate && !estimateApproved && estimateStages.length === 0 ? <span className="admin-project-reference__estimate-status">{formatWorkflowLabel(project.estimate.status)}</span> : null}</dd></div>
        </dl>
      </section>
      <ProjectPeopleAssignments key={project.id} project={project} canAssignDesigner={canAssignDesigner} canAssignWorkers={canAssignWorkers}
        canManageProjectManager={canManageProcurementIdentity} area={assignmentArea} onAreaChange={setAssignmentArea} />
      <Surface as="section" className="admin-project-detail__surface" aria-label="Project details">
        <div className="admin-project-detail__sections">
          <AdminDetailSection
            icon={<FileEdit aria-hidden="true" />}
            tone="warm"
            title="Project information"
            subtitle="Client, property and budget details"
            defaultOpen
          >
            <div className="admin-project-reference__detail-groups">
            <div>
            <h3>Project</h3>
            <dl><div><dt>Location</dt><dd>{project.location}</dd></div><div><dt>Property type</dt><dd>{project.propertyType ?? "Not captured"}</dd></div><div><dt>Initial client budget range</dt><dd>{initialBudget}</dd></div></dl>
            </div>
            <div>
            <h3>Client</h3>
            <dl><div><dt>Name</dt><dd>{project.client.name}</dd></div><div><dt>Email</dt><dd>{project.client.email}</dd></div><div><dt>Mobile</dt><dd>{project.client.mobile}</dd></div></dl>
            </div>
            </div>
          </AdminDetailSection>
          <AdminDetailSection
            icon={<User aria-hidden="true" />}
            tone="cool"
            title="Assignment & progress"
            subtitle="Sales assignment and lead progress"
            defaultOpen
          >
            <div className="admin-project-reference__detail-groups">
            <div>
            <h3>Sales</h3>
            <dl><div><dt>Assigned to</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>{project.estimator ? <div><dt>Email</dt><dd>{project.estimator.email}</dd></div> : null}</dl>
            </div>
            <div>
            <h3>Lead progress</h3>
            {project.lead ? <dl><div><dt>Stage</dt><dd>{formatWorkflowLabel(project.lead.stage)}</dd></div><div><dt>Next action</dt><dd>{nextAction}</dd></div><div><dt>Next action date</dt><dd><time dateTime={project.lead.nextActionAt}>{dateTime.format(new Date(project.lead.nextActionAt))}</time></dd></div></dl> : <p>Unassigned handoff</p>}
            </div>
            <div className="admin-project-reference__estimate-group">
            <h3>Estimate</h3>
            {project.estimate ? <dl>{estimateStages.length > 0 ? estimateStages.map(stage => <div key={stage.label}><dt>{stage.label}</dt><dd>{stage.value}</dd></div>) : <div><dt>Status</dt><dd>{formatWorkflowLabel(project.estimate.status)}</dd></div>}<div><dt>{estimateLabel}</dt><dd>{estimateValue}</dd></div>{approvedBaseline ? <div><dt>Approved estimate baseline</dt><dd>Version {approvedBaseline.estimateVersion}</dd></div> : null}</dl> : <p>No estimate yet</p>}
            </div>
            </div>
          </AdminDetailSection>
        </div>
      </Surface>
      <ProjectWorkflowPanel showAppointmentTimer={false} projectId={project.id} />
      {canReadFinance ? (
        <ProjectFinancePanel
          projectId={project.id}
          enabled={currentEstimateApproved}
          title={`${project.name} finance`}
          expectedSource={approvedFinanceSource}
        />
      ) : null}
      {canAssignWorkers ? <ProjectWorkflowSnapshot project={project} /> : null}
      {project.estimate?.clientReview ? (
        <AdminDetailSection
          icon={<MessageSquare aria-hidden="true" />}
          tone="cool"
          title="Client response"
          subtitle="Delivery status and client decision"
          defaultOpen
        >
          <p>
            <StatusBadge
              tone={
                project.estimate.clientReview.status === "approved"
                  ? "success"
                  : project.estimate.clientReview.status === "changes_requested"
                    ? "danger"
                    : "warning"
              }
              label={formatWorkflowLabel(project.estimate.clientReview.status)}
            />
          </p>
          <p>{deliveryLabel(project.estimate.clientReview.deliveryStatus)}</p>
          {project.estimate.hasPendingClientResponseTask && canReadClientResponses ? (
            <Link
              to={`/admin/client-responses/${encodeURIComponent(project.estimate.clientReview.id)}`}
            >
              Review Client response
            </Link>
          ) : (
            <p>Read-only Client response history</p>
          )}
        </AdminDetailSection>
      ) : null}
      </div>
      <aside className="admin-project-reference__sidebar" aria-label="Project reference and people">
        <figure className="admin-project-reference__image" aria-label="Interior reference">
          <figcaption>Interior reference <span>Illustrative artwork</span></figcaption>
          <img src={projectInterior} alt="" width={2172} height={724} loading="lazy" decoding="async" />
        </figure>
        <section className="admin-project-reference__aside-section" aria-labelledby="admin-project-quick-summary-title">
          <h2 id="admin-project-quick-summary-title">Quick summary</h2>
          <dl>
            <div><dt>Project status</dt><dd>{adminProjectStatusLabel(project)}</dd></div>
            {estimateStages.length > 0 ? estimateStages.map(stage => <div key={stage.label}><dt>{stage.label}</dt><dd>{stage.value}</dd></div>) : <div><dt>Estimate status</dt><dd>{project.estimate ? formatWorkflowLabel(project.estimate.status) : "No estimate yet"}</dd></div>}
            <div><dt>{estimateLabel}</dt><dd>{estimateValue}</dd></div>
            <div><dt>Initial client budget range</dt><dd>{initialBudget}</dd></div>
          </dl>
        </section>
        <section className="admin-project-reference__aside-section" aria-labelledby="admin-project-people-title">
          <h2 id="admin-project-people-title">Team members</h2>
          <ul className="admin-project-reference__people">
            {people.map(person => <li key={person.role}>
              <span className="admin-project-reference__person-mark" aria-hidden="true">{person.name.trim().slice(0, 1).toUpperCase()}</span>
              <div><span className="admin-project-reference__person-role">{person.role}</span><strong>{person.name}</strong>{person.email ? <span>{person.email}</span> : null}</div>
            </li>)}
          </ul>
        </section>
      </aside>
      </div>
    </section>
  );
}

function rupeesToPaise(value: number): number {
  const paise = value * 100;
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : Number.NaN;
}
