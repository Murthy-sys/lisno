import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileEdit, MessageSquare, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
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

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

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

  return (
    <section className="access-administration admin-project-detail" aria-labelledby="admin-project-detail-title">
      <PageHeader
        id="admin-project-detail-title"
        eyebrow="Project administration"
        title={project.name}
        description="Review the commercial handoff and assign approved design work."
        breadcrumb={<Link to="/admin/projects"><ArrowLeft aria-hidden="true" /> Back to {auth.user?.role === "super_admin" ? "All Projects" : "My Projects"}</Link>}
        metadata={<StatusBadge tone="info" label={adminProjectStatusLabel(project)} />}
        actions={assignmentPending && canAssignDesigner ? (
          <a className="button button--primary" href="#design-assignment-title">
            Assign Designer
          </a>
        ) : undefined}
      />
      <Surface as="section" className="admin-project-detail__surface" aria-label="Project details">
        <div className="admin-project-detail__sections">
          <AdminDetailSection
            icon={<FileEdit aria-hidden="true" />}
            tone="warm"
            title="Project information"
            subtitle="Client, property and budget details"
          >
            <h3>Project</h3>
            <dl><div><dt>Location</dt><dd>{project.location}</dd></div><div><dt>Property type</dt><dd>{project.propertyType ?? "Not captured"}</dd></div><div><dt>Initial client budget range</dt><dd>{project.budgetMin === null || project.budgetMax === null ? "Not captured" : `${money.format(project.budgetMin)} – ${money.format(project.budgetMax)}`}</dd></div></dl>
            <h3>Client</h3>
            <dl><div><dt>Name</dt><dd>{project.client.name}</dd></div><div><dt>Email</dt><dd>{project.client.email}</dd></div><div><dt>Mobile</dt><dd>{project.client.mobile}</dd></div></dl>
          </AdminDetailSection>
          <AdminDetailSection
            icon={<User aria-hidden="true" />}
            tone="cool"
            title="Assignment & progress"
            subtitle="Estimator/Sales assignment and lead progress"
          >
            <h3>Estimator/Sales</h3>
            <dl><div><dt>Assigned to</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>{project.estimator ? <div><dt>Email</dt><dd>{project.estimator.email}</dd></div> : null}</dl>
            <h3>Lead progress</h3>
            {project.lead ? <dl><div><dt>Stage</dt><dd>{formatWorkflowLabel(project.lead.stage)}</dd></div><div><dt>Next action</dt><dd>{nextAction}</dd></div><div><dt>Next action date</dt><dd><time dateTime={project.lead.nextActionAt}>{dateTime.format(new Date(project.lead.nextActionAt))}</time></dd></div></dl> : <p>Unassigned handoff</p>}
            <h3>Estimate</h3>
            {project.estimate ? <dl><div><dt>Status</dt><dd>{formatWorkflowLabel(project.estimate.status)}</dd></div><div><dt>{estimateApproved ? "Client-approved value (incl. GST)" : "Current estimate value (incl. GST)"}</dt><dd>{estimateApproved ? approvedBaseline ? money.format(approvedBaseline.total) : "Approved baseline unavailable" : money.format(project.estimate.total)}</dd></div>{approvedBaseline ? <div><dt>Approved estimate baseline</dt><dd>Version {approvedBaseline.estimateVersion}</dd></div> : null}</dl> : <p>No estimate yet</p>}
          </AdminDetailSection>
        </div>
      </Surface>
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
    </section>
  );
}

function rupeesToPaise(value: number): number {
  const paise = value * 100;
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : Number.NaN;
}
