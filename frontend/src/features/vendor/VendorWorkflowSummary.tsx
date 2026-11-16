import { Button } from "../../components/ui/Button";
import type { ExecutionWork } from "../execution/executionApi";
import { executionTime } from "../execution/executionPresentation";
import { currentVendorReport, vendorWorkflowPresentation } from "./vendorWorkflowPresentation";

export function VendorWorkflowSummary({ work, disabled, onAction }: {
  work: ExecutionWork;
  disabled: boolean;
  onAction: () => void;
}) {
  const workflow = vendorWorkflowPresentation(work);
  const report = currentVendorReport(work);
  return <section className="vendor-workflow" aria-label="Vendor workflow">
    <div className="vendor-workflow__heading">
      <div><h3>{workflow.stageLabel}</h3>
        {workflow.reviewLabel ? <p className="vendor-workflow__review">{workflow.reviewLabel}</p> : null}
        <p className="vendor-workflow__guidance">{workflow.guidance}</p>
      </div>
      {workflow.primaryAction ? <Button className="vendor-workflow__action-link" variant="secondary" size="compact" disabled={disabled} onClick={onAction}>Go to next action</Button> : null}
    </div>
    <section className="vendor-workflow__report" aria-label="Latest vendor report">
      <h3>Last update</h3>
      {report ? <>
        <p className="vendor-workflow__report-meta"><time dateTime={report.reportedAt}>{executionTime(report.reportedAt, work.timezone)}</time></p>
        <p>{report.note}</p>
        {report.reason ? <p>Reported reason: {report.reason}</p> : null}
        {report.nextAction ? <p>Reported next action: {report.nextAction}</p> : null}
      </> : <p className="execution__muted">No vendor report is available for this execution round.</p>}
    </section>
    {work.latestNote && work.latestNote !== report?.note ? <details className="vendor-workflow__activity">
      <summary>Latest workflow activity</summary>
      <section aria-label="Latest workflow activity"><p>{work.latestNote}</p></section>
    </details> : null}
  </section>;
}
