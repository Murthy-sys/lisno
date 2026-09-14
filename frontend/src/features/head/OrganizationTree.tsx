import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { OrganizationManager } from "../../api/types";
import { EvaluationForm } from "../../components/ui/EvaluationForm";
import { getEvaluations, managementKeys } from "../manager/managerApi";
import { KpiTrend } from "../../components/kpi/KpiTrend";
import { DesignerQuickReview, DesignerRecord } from "../manager/DesignerQuickReview";

export function OrganizationTree({ managers }: { managers: OrganizationManager[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const histories = useQueries({ queries: managers.map((manager) => ({ queryKey: managementKeys.evaluations(manager.id), queryFn: () => getEvaluations(manager.id), enabled: open.has(manager.id) })) });
  const selectedDesigner = managers.flatMap((manager) => manager.designers).find((designer) => designer.id === selectedId);
  return (
    <div className="organization-tree">
      {managers.map((manager, index) => {
        const expanded = open.has(manager.id);
        const panelId = `manager-${manager.id}`;
        const history = histories[index];
        return (
          <article key={manager.id} className="management-team">
            <button className="management-team__toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen((current) => { const next = new Set(current); next.has(manager.id) ? next.delete(manager.id) : next.add(manager.id); return next; })}>
              <span><strong>{manager.name}</strong><span>Team KPI {manager.summary.teamKpi.score} · {manager.summary.workload}h workload · {manager.summary.redCount} red · {manager.summary.yellowCount} yellow · {manager.summary.evaluationCoverage}% evaluated</span></span>
              <ChevronDown aria-hidden="true" />
            </button>
            {expanded ? (
              <div id={panelId} className="management-team__body">
                <div className="management-designer-list">{manager.designers.map((designer) => (
                  <div key={designer.id} className="organization-designer">
                    <DesignerRecord designer={{ user: designer, ...designer.summary }} base="/head" onReview={() => setSelectedId(designer.id)} />
                    {designer.summary.projects.length ? <ul className="management-team__projects" aria-label={`${designer.name} projects`}>{designer.summary.projects.map((project) => <li key={project.id}><Link to={`/head/projects/${encodeURIComponent(project.id)}`}>{project.name}{project.progress === undefined ? "" : ` · ${project.progress}%`}</Link></li>)}</ul> : <p className="inline-empty">No assigned projects.</p>}
                  </div>
                ))}</div>
                <section className="management-evaluation" aria-label={`${manager.name} evaluation history`}>
                  <h3>Manager evaluation</h3>
                  {history?.isPending ? <p>Loading evaluation history…</p> : history?.isError ? <p role="alert">Evaluation history could not be loaded.</p> : <KpiTrend score={manager.summary.teamKpi.score} evaluations={history?.data?.items ?? []} />}
                  <EvaluationForm subjectUserId={manager.id} queryKey={managementKeys.organization} revisionCandidates={history?.data?.items ?? []} />
                </section>
              </div>
            ) : null}
          </article>
        );
      })}
      {selectedDesigner ? <DesignerQuickReview key={selectedDesigner.id} designer={{ user: selectedDesigner, ...selectedDesigner.summary }} base="/head" onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
