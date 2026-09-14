import { Link } from "react-router-dom";
import type { DesignerSummary, PublicUser } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import "./managementWorkspace.css";

type ReviewSummary = Omit<DesignerSummary, "user"> & {
  user: Pick<PublicUser, "id" | "name" | "email" | "avatar">;
};

export function DesignerRecord({ designer, base, onReview }: { designer: ReviewSummary; base: "/manager" | "/head"; onReview: () => void }) {
  return (
    <article className="management-designer-record" aria-label={designer.user.name}>
      <div className="management-designer-record__identity"><h3>{designer.user.name}</h3><p>{designer.user.email}</p></div>
      <dl className="management-designer-record__metrics">
        <div><dt>Calculated KPI</dt><dd>KPI {designer.kpi.score}</dd></div>
        <div><dt>Delivery</dt><dd>{designer.activeProjectCount} active projects</dd></div>
        <div><dt>Workload</dt><dd>{designer.workload}h open workload</dd></div>
        <div><dt>Risk</dt><dd>{designer.overdueCount} red · {designer.yellowRiskCount} yellow</dd></div>
      </dl>
      <div className="management-designer-record__actions">
        <span>{designer.pendingEvaluation ? "Evaluation pending" : "Evaluation recorded"}</span>
        <Button variant="secondary" size="compact" onClick={onReview} aria-label={`Quick review ${designer.user.name}`}>Quick review</Button>
        <Link to={`${base}/designers/${encodeURIComponent(designer.user.id)}`}>Review designer</Link>
      </div>
    </article>
  );
}

/** Uses only the current authorized list record; opening a summary does not fetch staff detail. */
export function DesignerQuickReview({ designer, base, onClose }: { designer: ReviewSummary; base: "/manager" | "/head"; onClose: () => void }) {
  const riskTasks = designer.tasks.filter((task) => task.risk.level === "red" || task.risk.level === "yellow");
  return (
    <ContextPanel title={designer.user.name} eyebrow="Designer quick review" description={designer.user.email} onClose={onClose}
      footer={<Link className="ui-button ui-button--primary" to={`${base}/designers/${encodeURIComponent(designer.user.id)}`}>Open designer workspace</Link>}>
      <div className="management-review">
        <dl className="management-review__summary">
          <div><dt>Calculated KPI</dt><dd>{designer.kpi.score}</dd></div>
          <div><dt>Open workload</dt><dd>{designer.workload}h</dd></div>
          <div><dt>Delivery risk</dt><dd>{designer.overdueCount} red · {designer.yellowRiskCount} yellow</dd></div>
          <div><dt>Evaluation</dt><dd>{designer.pendingEvaluation ? "Pending" : "Recorded"}</dd></div>
        </dl>
        <section><h3>Assigned projects</h3>{designer.projects.length ? <ul className="management-review__list">{designer.projects.map((project) => <li key={project.id}><Link to={`${base}/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link>{project.progress !== undefined ? <span>{project.progress}% complete</span> : null}</li>)}</ul> : <p>No assigned projects.</p>}</section>
        <section><h3>Risk queue</h3>{riskTasks.length ? <ul className="management-review__list">{riskTasks.map((task) => <li key={task.id}><strong>{task.title}</strong><RiskBadge risk={task.risk} /><span>{task.risk.reason}</span></li>)}</ul> : <p>No red or yellow tasks in this delivery record.</p>}</section>
        <p className="management-review__note">Calculated KPI and manager or head evaluations are separate records. Open the workspace to review evaluation history and deadlines.</p>
      </div>
    </ContextPanel>
  );
}
