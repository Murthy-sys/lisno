import { Sparkles } from "lucide-react";

export function KpiScore({ score }: { score: number }) {
  return (
    <div className="kpi-score" aria-label="Personal KPI score">
      <div className="kpi-score__icon">
        <Sparkles aria-hidden="true" />
      </div>
      <div>
        <p>Your performance score</p>
        <strong>{Math.round(score)}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}
