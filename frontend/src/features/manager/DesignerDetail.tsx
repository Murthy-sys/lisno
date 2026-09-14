import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { AsyncState } from "../../components/ui/AsyncState";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { EvaluationForm } from "../../components/ui/EvaluationForm";
import { KpiBreakdown } from "../../components/kpi/KpiBreakdown";
import { KpiTrend } from "../../components/kpi/KpiTrend";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { DeadlineRevisionDialog } from "./DeadlineRevisionDialog";
import { getDesignerAudit, getDesignerSummary, getEvaluations, managementKeys } from "./managerApi";
import { useAuth } from "../../auth/AuthProvider";
import "./managementWorkspace.css";

export function DesignerDetail() {
  const { designerId = "" } = useParams();
  const auth = useAuth();
  const base = auth.user?.role === "design_head" ? "/head" : "/manager";
  const [revisionTaskId, setRevisionTaskId] = useState<string | null>(null);
  const summary = useQuery({ queryKey: managementKeys.designer(designerId), queryFn: () => getDesignerSummary(designerId), enabled: Boolean(designerId) });
  const evaluations = useQuery({ queryKey: managementKeys.evaluations(designerId), queryFn: () => getEvaluations(designerId), enabled: Boolean(designerId) });
  const audit = useQuery({ queryKey: managementKeys.audit(designerId), queryFn: () => getDesignerAudit(designerId), enabled: Boolean(designerId) });
  if (summary.isPending || evaluations.isPending || audit.isPending) return <AsyncState state="loading" message="Loading designer detail…" />;
  if (summary.isError || evaluations.isError || audit.isError) return <AsyncState state="error" message="We couldn't load this designer." actionLabel="Try again" onAction={() => { void summary.refetch(); void evaluations.refetch(); void audit.refetch(); }} />;
  const designer = summary.data;
  const revisionTask = designer.tasks.find((task) => task.id === revisionTaskId);
  const riskTasks = designer.tasks.filter((task) => task.risk.level === "red" || task.risk.level === "yellow");
  return (
    <section className="designer-page management-workspace" aria-labelledby="designer-detail-title">
      <PageHeader id="designer-detail-title" eyebrow="Designer delivery record" title={designer.user.name} description="Calculated KPI remains separate from manager evaluation." breadcrumb={<Link to={base} className="back-link">Back to team</Link>} metadata={<strong>KPI {designer.kpi.score}</strong>} />
      <div className="management-performance"><KpiTrend score={designer.kpi.score} evaluations={evaluations.data.items} /><KpiBreakdown components={designer.kpi.components} /></div>
      <section className="management-section"><h2>Projects</h2>{designer.projects.length ? <ul className="management-review__list">{designer.projects.map((project) => <li key={project.id}><Link to={`${base}/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link>{project.progress !== undefined ? <span>{project.progress}% complete</span> : null}</li>)}</ul> : <p>No assigned projects.</p>}</section>
      <section className="management-section"><h2>Risk queue</h2>{riskTasks.length ? <div className="management-risk-list">{riskTasks.map((task) => <article key={task.id} className="management-risk-record"><div><strong>{task.title}</strong><p>{task.risk.reason}</p></div><RiskBadge risk={task.risk} /><Button variant="secondary" size="compact" onClick={() => setRevisionTaskId(task.id)}>Revise deadline</Button></article>)}</div> : <p>No red or yellow tasks.</p>}</section>
      <section className="management-section"><h2>Audit timeline</h2>{audit.data.items.length ? <ol className="activity-list">{audit.data.items.map((event) => <li key={event.id}>{event.action}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol> : <p>No audit events recorded.</p>}</section>
      <EvaluationForm subjectUserId={designerId} queryKey={managementKeys.evaluations(designerId)} revisionCandidates={evaluations.data.items} />
      {revisionTask ? <DeadlineRevisionDialog key={revisionTask.id} task={revisionTask} onClose={() => setRevisionTaskId(null)} onConflict={() => summary.refetch()} /> : null}
    </section>
  );
}
