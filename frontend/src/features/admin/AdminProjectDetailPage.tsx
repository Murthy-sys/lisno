import { ProjectChatNavigation } from "../messages";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileEdit, MessageSquare, User } from "lucide-react";
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
  adminProjectNextAction,
  adminProjectStatusLabel,
  formatWorkflowLabel,
  isDesignerAssignmentPending
} from "./adminProjectPresentation";
import { adminProjectKeys, getAdminProject } from "./adminProjectsApi";
import { AdminDetailSection } from "./AdminDetailSection";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";
import { WorkerAssignmentPanel } from "./WorkerAssignmentPanel";
import { ProjectFinancePanel } from "../finance/ProjectFinancePanel";
import { ProjectWorkflowSnapshot } from "../finance/FinanceProjectWorkflowControl";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
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

  if (projectQuery.isPending) return <PageState state="loading" message="Loading project details…" />;
  if (projectQuery.isError) {
    return <PageState state="error" message={errorMessage(projectQuery.error)} action={{ label: "Try again", onAction: () => void projectQuery.refetch() }} />;
  }
  if (!project) return <PageState state="empty" message="Project details are unavailable." />;

  const nextAction = adminProjectNextAction(project);
  const assignmentPending = isDesignerAssignmentPending(project);
  const estimateApproved = project.estimate?.status === "client_approved";
  const approvedBaseline = estimateApproved
    ? project.estimate?.approvedBaseline ?? null
    : null;
  const approvedFinanceSource = estimateApproved && project.estimate
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
  const initialBudget = project.budgetMin === null || project.budgetMax === null
    ? "Not captured" : `${money.format(project.budgetMin)} – ${money.format(project.budgetMax)}`;
  const people = [
    ...(project.estimator ? [{ role: "Sales", name: project.estimator.name, email: project.estimator.email }] : []),
    ...(project.estimate?.designPlanDesigner ? [{ role: "Designer", name: project.estimate.designPlanDesigner.name, email: project.estimate.designPlanDesigner.email }] : []),
    { role: "Client", name: project.client.name, email: project.client.email }
  ];

  return (
    <section className="access-administration admin-project-detail admin-project-reference" aria-labelledby="admin-project-detail-title">
      <div className="admin-project-reference__hero">
      <PageHeader
        id="admin-project-detail-title"
        eyebrow="Project administration"
        title={project.name}
        description="Review the commercial handoff and assign approved design work."
        breadcrumb={<Link to="/admin/projects"><ArrowLeft aria-hidden="true" /> Back to {auth.user?.role === "super_admin" ? "All Projects" : "My Projects"}</Link>}
        metadata={<>
          <StatusBadge tone="info" label={adminProjectStatusLabel(project)} />
          <span className="admin-project-reference__identifier">Project ID: {project.id}</span>
          <span>Created <time dateTime={project.createdAt}>{createdLabel}</time></span>
        </>}
        actions={assignmentPending && canAssignDesigner ? (
          <a className="button button--primary" href="#design-assignment-title">
            Assign Designer
          </a>
        ) : undefined}
      />
      </div>
      <ProjectChatNavigation projectId={projectId} overviewTo={`/admin/projects/${projectId}`} />
      <div className="admin-project-reference__layout">
      <div className="admin-project-reference__main">
      <section className="admin-project-reference__facts" aria-label="Project summary">
        <dl>
          <div><dt>Client</dt><dd>{project.client.name}</dd></div>
          <div><dt>Location</dt><dd>{project.location}</dd></div>
          <div><dt>Property type</dt><dd>{project.propertyType ?? "Not captured"}</dd></div>
          <div><dt>Created</dt><dd><time dateTime={project.createdAt}>{createdLabel}</time></dd></div>
          <div><dt>{estimateLabel}</dt><dd>{estimateValue}{project.estimate && !estimateApproved ? <span className="admin-project-reference__estimate-status">{formatWorkflowLabel(project.estimate.status)}</span> : null}</dd></div>
        </dl>
      </section>
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
            {project.estimate ? <dl><div><dt>Status</dt><dd>{formatWorkflowLabel(project.estimate.status)}</dd></div><div><dt>{estimateLabel}</dt><dd>{estimateValue}</dd></div>{approvedBaseline ? <div><dt>Approved estimate baseline</dt><dd>Version {approvedBaseline.estimateVersion}</dd></div> : null}</dl> : <p>No estimate yet</p>}
            </div>
            </div>
          </AdminDetailSection>
        </div>
      </Surface>
      <ProjectWorkflowPanel projectId={project.id} />
      {canReadFinance ? (
        <ProjectFinancePanel
          projectId={project.id}
          enabled={estimateApproved}
          title={`${project.name} finance`}
          expectedSource={approvedFinanceSource}
        />
      ) : null}
      {canAssignWorkers ? <ProjectWorkflowSnapshot project={project} /> : null}
      <DesignAssignmentPanel project={project} />
      {canAssignWorkers ? <WorkerAssignmentPanel project={project} /> : null}
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
            <div><dt>Estimate status</dt><dd>{project.estimate ? formatWorkflowLabel(project.estimate.status) : "No estimate yet"}</dd></div>
            <div><dt>{estimateLabel}</dt><dd>{estimateValue}</dd></div>
            <div><dt>Initial client budget range</dt><dd>{initialBudget}</dd></div>
          </dl>
        </section>
        <section className="admin-project-reference__aside-section" aria-labelledby="admin-project-people-title">
          <h2 id="admin-project-people-title">Team members</h2>
          <ul className="admin-project-reference__people">
            {people.map(person => <li key={person.role}>
              <span className="admin-project-reference__person-mark" aria-hidden="true">{person.name.trim().slice(0, 1).toUpperCase()}</span>
              <div><span className="admin-project-reference__person-role">{person.role}</span><strong>{person.name}</strong><span>{person.email}</span></div>
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
