import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import type { AuditEvent, DesignVersion, PageData, ProjectHierarchy } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { AsyncState } from "../../components/ui/AsyncState";

const page = "limit=100&offset=0";

export function ManagementProjectWorkspace() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const base = auth.user?.role === "design_head" ? "/head" : "/manager";
  const project = useQuery({ queryKey: ["management", "project", projectId], queryFn: () => apiClient.get<ProjectHierarchy>(`/projects/${encodeURIComponent(projectId)}`), enabled: Boolean(projectId) });
  const versions = useQuery({ queryKey: ["management", "project", projectId, "versions"], queryFn: () => apiClient.get<PageData<DesignVersion>>(`/projects/${encodeURIComponent(projectId)}/design-versions?${page}`), enabled: Boolean(projectId) });
  const audit = useQuery({ queryKey: ["management", "project", projectId, "audit"], queryFn: () => apiClient.get<PageData<AuditEvent>>(`/audit?entityType=project&entityId=${encodeURIComponent(projectId)}&sort=desc&${page}`), enabled: Boolean(projectId) });

  if (project.isPending) return <AsyncState state="loading" message="Loading project inspection…" />;
  if (project.isError) return <AsyncState state="error" message="We couldn't load this project." actionLabel="Try again" onAction={() => void project.refetch()} />;
  const data = project.data;
  return <section className="designer-page" aria-labelledby="management-project-title">
    <Link className="back-link" to={base}>Back to workspace</Link>
    <header className="workspace-header"><div><p className="eyebrow">Project inspection</p><h1 id="management-project-title">{data.name}</h1><p>{data.location} · {data.status}</p></div></header>
    <section aria-labelledby="delivery-structure-title"><h2 id="delivery-structure-title">Delivery structure</h2>{data.floors.map((floor) => <article key={floor.id} className="floor-card"><h3>Floor {floor.number}: {floor.name} · {floor.progress}%</h3>{floor.stages.map((stage) => <section key={stage.id} className="stage-card"><h4>{stage.name}</h4>{stage.tasks.map((task) => <article key={task.id} className="risk-item"><strong>{task.title}</strong><span>{task.status} · {task.progress}% · deadline {new Date(task.currentDeadlineAt).toLocaleDateString()}</span><RiskBadge risk={task.risk} /></article>)}</section>)}</article>)}</section>
    <section aria-labelledby="version-timeline-title"><h2 id="version-timeline-title">Design-version timeline</h2>{versions.isPending ? <p>Loading versions…</p> : versions.isError ? <p role="alert">Versions could not be loaded.</p> : versions.data.items.length ? <ol className="activity-list">{versions.data.items.map((version) => <li key={version.id}><strong>v{version.versionNumber} · {version.originalFilename}</strong><span>{version.approvalStatus}{version.clientVisible ? " · client visible" : " · internal"}</span></li>)}</ol> : <p>No design versions yet.</p>}</section>
    <section aria-labelledby="project-audit-title"><h2 id="project-audit-title">Project audit</h2>{audit.isPending ? <p>Loading audit…</p> : audit.isError ? <p role="alert">Audit could not be loaded.</p> : audit.data.items.length ? <ol className="activity-list">{audit.data.items.map((event) => <li key={event.id}><strong>{event.action}</strong><span>{new Date(event.occurredAt).toLocaleString()}</span></li>)}</ol> : <p>No project audit events yet.</p>}</section>
  </section>;
}
