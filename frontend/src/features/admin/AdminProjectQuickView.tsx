import { Link } from "react-router-dom";

import type { AdminProjectSummary } from "../../api/types";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { adminProjectNextAction, adminProjectStatusLabel } from "./adminProjectPresentation";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Uses only the current, authorized collection row; full workspace data stays on its route. */
export function AdminProjectQuickView({ project, canOpenWorkspace, onClose }: {
  project: AdminProjectSummary | undefined;
  canOpenWorkspace: boolean;
  onClose: () => void;
}) {
  const approved = project?.estimate?.status === "client_approved";
  const value = approved ? project?.estimate?.approvedBaseline?.total : project?.estimate?.total;
  return (
    <ContextPanel
      title={project ? project.name : "Project quick view"}
      eyebrow="Project summary"
      className="administration-context-panel"
      onClose={onClose}
      metadata={project ? <StatusBadge label={adminProjectStatusLabel(project)} tone="info" /> : undefined}
      footer={project && canOpenWorkspace ? (
        <Link className="ui-button ui-button--primary" to={`/admin/projects/${encodeURIComponent(project.id)}`}>
          Open project workspace
        </Link>
      ) : undefined}
    >
      {project ? (
        <dl className="administration-summary">
          <div><dt>Client</dt><dd>{project.client.name}</dd></div>
          <div><dt>Email</dt><dd>{project.client.email}</dd></div>
          <div><dt>Mobile</dt><dd>{project.client.mobile}</dd></div>
          <div><dt>Property</dt><dd>{project.propertyType ?? "Property not captured"} · {project.location}</dd></div>
          <div><dt>Sales</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>
          <div><dt>Next action</dt><dd>{adminProjectNextAction(project) ?? "No action pending"}</dd></div>
          <div><dt>{approved ? "Client-approved value (incl. GST)" : "Estimate value"}</dt><dd>{value == null ? (approved ? "Approved baseline unavailable" : "No estimate yet") : money.format(value)}</dd></div>
          <div><dt>Project ID</dt><dd>{project.id}</dd></div>
        </dl>
      ) : <PageState state="empty" message="This project is no longer available in the current view. Close the summary and refresh the list." />}
    </ContextPanel>
  );
}
