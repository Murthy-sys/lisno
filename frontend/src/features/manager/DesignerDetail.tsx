import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { AsyncState } from "../../components/ui/AsyncState";
import { EvaluationForm } from "../../components/ui/EvaluationForm";
import { KpiBreakdown } from "../../components/kpi/KpiBreakdown";
import { KpiTrend } from "../../components/kpi/KpiTrend";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { DeadlineRevisionDialog } from "./DeadlineRevisionDialog";
import { getDesignerAudit, getDesignerSummary, getEvaluations, managementKeys } from "./managerApi";
import { useAuth } from "../../auth/AuthProvider";

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
  return <section className="designer-page" aria-labelledby="designer-detail-title"><Link to={base} className="back-link">Back to team</Link><header className="workspace-header"><div><p className="eyebrow">Designer delivery record</p><h1 id="designer-detail-title">{designer.user.name}</h1><p>Calculated KPI remains separate from manager evaluation.</p></div><strong>KPI {designer.kpi.score}</strong></header>
    <KpiTrend score={designer.kpi.score} evaluations={evaluations.data.items} /><KpiBreakdown components={designer.kpi.components} />
    <section className="dashboard-section"><h2>Projects</h2>{designer.projects.map((project) => <Link key={project.id} to={`${base}/projects/${project.id}`}>{project.name}</Link>)}</section>
    <section className="dashboard-section"><h2>Risk queue</h2>{designer.tasks.filter((task) => task.risk.level === "red" || task.risk.level === "yellow").map((task) => <article key={task.id} className="risk-item"><strong>{task.title}</strong><RiskBadge risk={task.risk} /><p>{task.risk.reason}</p><button type="button" onClick={() => setRevisionTaskId(task.id)}>Revise deadline</button></article>)}</section>
    <section className="dashboard-section"><h2>Audit timeline</h2><ol>{audit.data.items.map((event) => <li key={event.id}>{event.action}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></section>
    <EvaluationForm subjectUserId={designerId} queryKey={managementKeys.evaluations(designerId)} revisionCandidates={evaluations.data.items} />
    {revisionTask ? <DeadlineRevisionDialog task={revisionTask} onClose={() => setRevisionTaskId(null)} onConflict={() => summary.refetch()} /> : null}
  </section>;
}
