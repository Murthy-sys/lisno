export function KpiScore({ score }: { score: number }) {
  return (
    <div className="kpi-score" aria-label="Personal KPI score">
      <div>
        <p>Your performance score</p>
        <strong>{Math.round(score)}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}
