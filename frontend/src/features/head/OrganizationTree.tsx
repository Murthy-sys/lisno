import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { OrganizationManager } from "../../api/types";
import { DesignerCard } from "../../components/ui/DesignerCard";
import { EvaluationForm } from "../../components/ui/EvaluationForm";
import { getEvaluations, managementKeys } from "../manager/managerApi";
import { KpiTrend } from "../../components/kpi/KpiTrend";

export function OrganizationTree({ managers }: { managers: OrganizationManager[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const histories = useQueries({ queries: managers.map((manager) => ({ queryKey: managementKeys.evaluations(manager.id), queryFn: () => getEvaluations(manager.id), enabled: open.has(manager.id) })) });
  return <div className="organization-tree">{managers.map((manager) => {
    const expanded = open.has(manager.id);
    const panelId = `manager-${manager.id}`;
    const history = histories[managers.indexOf(manager)];
    return <article key={manager.id} className="manager-card"><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen((current) => { const next = new Set(current); next.has(manager.id) ? next.delete(manager.id) : next.add(manager.id); return next; })}><strong>{manager.name}</strong><span>Team KPI {manager.summary.teamKpi.score} · {manager.summary.workload}h workload · {manager.summary.redCount} red · {manager.summary.yellowCount} yellow · {manager.summary.evaluationCoverage}% evaluated</span></button>{expanded ? <div id={panelId} className="designer-grid">{manager.designers.map((designer) => <DesignerCard key={designer.id} designer={{ user: designer, ...designer.summary }} to={`/head/designers/${designer.id}`} />)}{history?.isPending ? <p>Loading evaluation history…</p> : history?.isError ? <p role="alert">Evaluation history could not be loaded.</p> : <KpiTrend score={manager.summary.teamKpi.score} evaluations={history?.data?.items ?? []} />}<EvaluationForm subjectUserId={manager.id} queryKey={managementKeys.organization} revisionCandidates={history?.data?.items ?? []} /></div> : null}</article>;
  })}</div>;
}
