import { Button } from "../../components/ui/Button";
import type { ExecutionWork } from "../execution/executionApi";
import { executionTime } from "../execution/executionPresentation";
import { currentVendorReport, vendorWorkflowPresentation } from "./vendorWorkflowPresentation";

const milestoneStateLabels = {
  recorded: "Recorded",
  current: "Current stage",
  pending: "Pending",
  unavailable: "Not available"
} as const;

export function VendorWorkflowSummary({ work, disabled, onAction }: {
  work: ExecutionWork;
  disabled: boolean;
  onAction: () => void;
}) {
  const workflow = vendorWorkflowPresentation(work);
  const report = currentVendorReport(work);
  return <section className="vendor-workflow" aria-label="Vendor workflow">
    <div className="vendor-workflow__heading">
      <div><h3>{workflow.stageLabel}</h3><p className="vendor-workflow__guidance">{workflow.guidance}</p></div>
      {workflow.primaryAction ? <Button className="vendor-workflow__action-link" variant="secondary" size="compact" disabled={disabled} onClick={onAction}>Go to next action</Button> : null}
    </div>
    <ol className="vendor-workflow__milestones" aria-label="Workflow stages">
      {workflow.milestones.map(milestone => <li className="vendor-workflow__milestone" key={milestone.id} data-state={milestone.state} aria-current={milestone.state === "current" ? "step" : undefined}>
        <span>{milestone.label}</span><small className="vendor-workflow__milestone-state">{milestoneStateLabels[milestone.state]}</small>
      </li>)}
    </ol>
    <section className="vendor-workflow__report" aria-label="Latest vendor report">
      <h3>Latest vendor report</h3>
      {report ? <>
        <p className="vendor-workflow__report-meta">{report.progress}% reported · <time dateTime={report.reportedAt}>{executionTime(report.reportedAt, work.timezone)}</time> · Round {report.executionRound}</p>
        <p>{report.note}</p>
        {report.reason ? <p>Reported reason: {report.reason}</p> : null}
        {report.nextAction ? <p>Reported next action: {report.nextAction}</p> : null}
      </> : <p className="execution__muted">No vendor report is available for this execution round.</p>}
    </section>
    {work.latestNote && work.latestNote !== report?.note ? <section className="vendor-workflow__activity" aria-label="Latest workflow activity"><h3>Latest workflow activity</h3><p>{work.latestNote}</p></section> : null}
  </section>;
}
