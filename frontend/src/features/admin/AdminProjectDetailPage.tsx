import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { adminProjectKeys, getAdminProject } from "./adminProjectsApi";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function label(value: string) {
  return value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

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
  const projectQuery = useQuery({
    queryKey: adminProjectKeys.detail(projectId),
    queryFn: () => getAdminProject(projectId),
    enabled: Boolean(projectId)
  });
  const project = projectQuery.data;

  if (projectQuery.isPending) return <PageState state="loading" message="Loading project details…" />;
  if (projectQuery.isError) {
    return <PageState state="error" message={errorMessage(projectQuery.error)} action={{ label: "Try again", onAction: () => void projectQuery.refetch() }} />;
  }
  if (!project) return <PageState state="empty" message="Project details are unavailable." />;

  return (
    <section className="access-administration admin-project-detail" aria-labelledby="admin-project-detail-title">
      <PageHeader
        id="admin-project-detail-title"
        eyebrow="Project administration"
        title={project.name}
        description="Read-only project and handoff details."
        breadcrumb={<Link to="/admin/projects">Back to My Projects</Link>}
        metadata={<StatusBadge tone="info" label={label(project.status)} />}
      />
      <Surface as="section" className="admin-project-detail__surface" aria-label="Project details">
        <div className="admin-project-detail__grid">
          <section><h2>Project</h2><dl><div><dt>Location</dt><dd>{project.location}</dd></div><div><dt>Property type</dt><dd>{project.propertyType ?? "Not captured"}</dd></div><div><dt>Budget</dt><dd>{project.budgetMin === null || project.budgetMax === null ? "Not captured" : `${money.format(project.budgetMin)} – ${money.format(project.budgetMax)}`}</dd></div></dl></section>
          <section><h2>Client</h2><dl><div><dt>Name</dt><dd>{project.client.name}</dd></div><div><dt>Email</dt><dd>{project.client.email}</dd></div><div><dt>Mobile</dt><dd>{project.client.mobile}</dd></div></dl></section>
          <section><h2>Estimator/Sales</h2><dl><div><dt>Assigned to</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>{project.estimator ? <div><dt>Email</dt><dd>{project.estimator.email}</dd></div> : null}</dl></section>
          <section><h2>Lead progress</h2>{project.lead ? <dl><div><dt>Stage</dt><dd>{label(project.lead.stage)}</dd></div><div><dt>Next action</dt><dd>{project.lead.nextAction}</dd></div><div><dt>Next action date</dt><dd><time dateTime={project.lead.nextActionAt}>{dateTime.format(new Date(project.lead.nextActionAt))}</time></dd></div></dl> : <p>Unassigned handoff</p>}</section>
          <section><h2>Estimate</h2>{project.estimate ? <dl><div><dt>Status</dt><dd>{label(project.estimate.status)}</dd></div><div><dt>Value</dt><dd>{money.format(project.estimate.total)}</dd></div></dl> : <p>No estimate yet</p>}</section>
        </div>
      </Surface>
      {project.estimate?.clientReview ? (
        <Surface
          as="section"
          className="admin-project-detail__surface admin-project-detail__client-response"
          aria-label="Client response"
        >
          <div>
            <h2>Client response</h2>
            <p>
              <StatusBadge
                tone={
                  project.estimate.clientReview.status === "approved"
                    ? "success"
                    : project.estimate.clientReview.status === "changes_requested"
                      ? "danger"
                      : "warning"
                }
                label={label(project.estimate.clientReview.status)}
              />
            </p>
            <p>{deliveryLabel(project.estimate.clientReview.deliveryStatus)}</p>
          </div>
          {project.estimate.hasPendingClientResponseTask ? (
            <Link
              to={`/admin/client-responses/${encodeURIComponent(project.estimate.clientReview.id)}`}
            >
              Review Client response
            </Link>
          ) : (
            <p>Read-only Client response history</p>
          )}
        </Surface>
      ) : null}
    </section>
  );
}
