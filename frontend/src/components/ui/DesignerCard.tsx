import { Link } from "react-router-dom";
import type { DesignerSummary, PublicUser } from "../../api/types";

type DesignerCardSummary = Omit<DesignerSummary, "user"> & { user: Pick<PublicUser, "id" | "name" | "email" | "avatar"> };

export function DesignerCard({ designer, to }: { designer: DesignerCardSummary; to: string }) {
  return <article className="designer-card" aria-label={designer.user.name}>
    <div><p className="eyebrow">Designer</p><h3>{designer.user.name}</h3><p>{designer.user.email}</p></div>
    <strong>KPI {designer.kpi.score}</strong>
    <p>{designer.activeProjectCount} active projects</p>
    <p>{designer.workload}h open workload</p>
    <p>{designer.overdueCount} red · {designer.yellowRiskCount} yellow</p>
    <span>{designer.pendingEvaluation ? "Evaluation pending" : "Evaluation recorded"}</span>
    <Link to={to}>Review designer</Link>
  </article>;
}
