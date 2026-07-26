import type { Evaluation } from "../../api/types";

export function KpiTrend({ score, evaluations }: { score: number; evaluations: Evaluation[] }) {
  const latest = evaluations[0];
  return (
    <div className="kpi-trend" aria-label="KPI trend">
      <strong>Calculated KPI: {score}</strong>
      <span>{latest ? `Latest evaluation: ${latest.score} · ${latest.evaluatorRole}` : "No evaluation recorded"}</span>
      {evaluations.length ? <ol>{evaluations.map((evaluation) => <li key={evaluation.id}>{evaluation.periodStartAt.slice(0, 10)} – {evaluation.periodEndAt.slice(0, 10)} · {evaluation.score} · {evaluation.comments}{evaluation.revisionOf ? " · revision" : ""}</li>)}</ol> : null}
    </div>
  );
}
