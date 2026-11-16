import type { ReactNode } from "react";
import { ProjectId } from "../../components/projects/ProjectId";
import { Button } from "../../components/ui/Button";
import type { ExecutionWork } from "../execution/executionApi";
import { executionDate, executionLabel, executionTime } from "../execution/executionPresentation";
import { currentVendorReport, vendorWorkflowPresentation } from "./vendorWorkflowPresentation";
import "./vendorWork.css";

interface VendorAssignmentListProps {
  items: ExecutionWork[];
  onOpen: (assignmentId: string) => void;
}

function AssignmentCell({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return <td role="cell" className={`vendor-assignments__${name}`} data-label={label}>
    <span className="vendor-assignments__label" aria-hidden="true">{label}</span>
    <div className="vendor-assignments__value">{children}</div>
  </td>;
}

function VendorAssignmentRow({ work, onOpen }: { work: ExecutionWork; onOpen: (assignmentId: string) => void }) {
  const workflow = vendorWorkflowPresentation(work);
  const report = currentVendorReport(work);
  const verification = work.verification?.executionRound === work.executionRound ? work.verification : null;
  const context = [work.itemName, work.orderNumber, work.roomName || work.vendorName, work.projectName, work.projectNumber].filter(Boolean).join(", ");

  return <tr role="row" className="vendor-assignments__row">
    <AssignmentCell label="Main Line / issued scope" name="scope">
      <strong>{work.itemName}</strong>
      <small>{[work.mainBasketName, work.subBasketName, work.roomName].filter(Boolean).join(" · ")}</small>
      <small>{work.orderNumber} · Revision {work.orderRevision}{work.quantityMilliUnits !== null && work.uomCode ? ` · ${work.quantityMilliUnits / 1000} ${work.uomCode}` : " · Issued quantity unavailable"}</small>
      {!work.sourceAvailable ? <small>Configuration link unavailable</small> : null}
    </AssignmentCell>
    <AssignmentCell label="Project" name="project">
      <span>{work.projectName}</span>
      <small><ProjectId projectNumber={work.projectNumber} /></small>
      <small>Workflow owner: {executionLabel(work.nextOwner)}</small>
    </AssignmentCell>
    <AssignmentCell label="Workflow" name="workflow">
      <span className="execution__status" data-status={work.status}>{workflow.stageLabel}</span>
      <small>{work.progress}% vendor reported</small>
      {verification ? <small>Site verified {executionDate(verification.verifiedAt)}</small> : null}
      {workflow.primaryAction ? <p className="vendor-assignments__next">Next step: {workflow.primaryAction.label}</p> : null}
      <p className="vendor-assignments__guidance">{workflow.guidance}</p>
      {work.flags.map(flag => <span className="execution__flag" key={flag}>{executionLabel(flag)}</span>)}
    </AssignmentCell>
    <AssignmentCell label="Daily update" name="daily">
      <span>{executionLabel(work.daily.state)}</span>
      <small>{work.daily.dueAt ? `Due ${executionTime(work.daily.dueAt, work.timezone)} (${work.timezone})` : "No daily report due"}</small>
      {report ? <div className="vendor-assignments__report">
        <small>Latest report: <time dateTime={report.reportedAt}>{executionTime(report.reportedAt, work.timezone)}</time></small>
        <p>{report.note}</p>
        {work.status === "blocked" && report.reason ? <small>Reason: {report.reason}</small> : null}
        {work.status === "blocked" && report.nextAction ? <small>Next action: {report.nextAction}</small> : null}
      </div> : <small>No current-round report</small>}
    </AssignmentCell>
    <AssignmentCell label="Commitment" name="commitment">
      <span>{work.schedule ? executionDate(work.schedule.finishDate) : "Schedule not confirmed"}</span>
      <small>Issued target: {work.originalTargetDate ? executionDate(work.originalTargetDate) : "Not set"}</small>
      {work.proposedSchedule ? <small>Proposed finish: {executionDate(work.proposedSchedule.finishDate)} · Awaiting confirmation</small> : null}
      {work.hold ? <small>Hold review: {executionDate(work.hold.reviewDate)}</small> : null}
    </AssignmentCell>
    <AssignmentCell label="Assignment details" name="open">
      <Button size="compact" variant="secondary" onClick={() => onOpen(work.id)} aria-label={`Open ${context}`}>Open</Button>
    </AssignmentCell>
  </tr>;
}

export function VendorAssignmentList({ items, onOpen }: VendorAssignmentListProps) {
  return <div className="execution__table-wrap vendor-assignments" role="region" aria-label="Main Line assignments" tabIndex={0}>
    <table className="execution__table vendor-assignments__table" role="table" aria-label="Vendor assignments">
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Main Line / issued scope</th>
        <th scope="col" role="columnheader">Project</th>
        <th scope="col" role="columnheader">Workflow</th>
        <th scope="col" role="columnheader">Daily update</th>
        <th scope="col" role="columnheader">Commitment</th>
        <th scope="col" role="columnheader"><span className="sr-only">Assignment details</span></th>
      </tr></thead>
      <tbody role="rowgroup">{items.map(work => <VendorAssignmentRow key={work.id} work={work} onOpen={onOpen} />)}</tbody>
    </table>
  </div>;
}
