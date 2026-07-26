import { useState } from "react";
import type { OrganizationManager } from "../../api/types";
import { DesignerCard } from "../../components/ui/DesignerCard";
import { EvaluationForm } from "../../components/ui/EvaluationForm";
import { managementKeys } from "../manager/managerApi";

export function OrganizationTree({ managers }: { managers: OrganizationManager[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  return <div className="organization-tree">{managers.map((manager) => {
    const expanded = open.has(manager.id);
    const panelId = `manager-${manager.id}`;
    return <article key={manager.id} className="manager-card"><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen((current) => { const next = new Set(current); next.has(manager.id) ? next.delete(manager.id) : next.add(manager.id); return next; })}><strong>{manager.name}</strong><span>Team KPI {manager.summary.teamKpi.score} · {manager.summary.workload}h workload · {manager.summary.redCount} red · {manager.summary.yellowCount} yellow · {manager.summary.evaluationCoverage}% evaluated</span></button>{expanded ? <div id={panelId} className="designer-grid">{manager.designers.map((designer) => <DesignerCard key={designer.id} designer={{ user: { ...designer, role: "designer" }, ...designer.summary }} to={`/manager/designers/${designer.id}`} />)}<EvaluationForm subjectUserId={manager.id} queryKey={managementKeys.organization} /></div> : null}</article>;
  })}</div>;
}
