import { Link } from "react-router-dom";
import type { DesignerSummary, PublicUser } from "../../api/types";

type DesignerCardSummary = Omit<DesignerSummary, "user"> & { user: Pick<PublicUser, "id" | "name" | "email" | "avatar"> };

export function DesignerCard({ designer, to }: { designer: DesignerCardSummary; to: string }) {
  return <article className="designer-card" aria-label={designer.user.name}>
    <div><p className="eyebrow">Designer</p><h3>{designer.user.name}</h3><p>{designer.user.email}</p></div>
    <dl className="designer-card__facts">
      <div><dt>Calculated KPI</dt><dd>{designer.kpi.score}</dd></div>
      <div><dt>Active projects</dt><dd>{designer.activeProjectCount}</dd></div>
      <div><dt>Open workload</dt><dd>{designer.workload}h</dd></div>
      <div><dt>Project risk</dt><dd>{designer.overdueCount} red · {designer.yellowRiskCount} yellow</dd></div>
    </dl>
    <span>{designer.pendingEvaluation ? "Evaluation pending" : "Evaluation recorded"}</span>
    <Link to={to}>Review designer</Link>
  </article>;
}
