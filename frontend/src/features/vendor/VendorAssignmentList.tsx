import type { ReactNode } from "react";
import { ProjectId } from "../../components/projects/ProjectId";
import { Button } from "../../components/ui/Button";
import type { ExecutionWork } from "../execution/executionApi";
import { executionDate, executionTime } from "../execution/executionPresentation";
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
  const context = [work.itemName, work.orderNumber, work.roomName || work.vendorName, work.projectName, work.projectNumber].filter(Boolean).join(", ");
  const holdReason = work.hold?.reason ?? (work.status === "blocked" ? report?.reason : null);

  return <tr role="row" className="vendor-assignments__row">
    <AssignmentCell label="Work" name="scope">
      <strong>{work.itemName}</strong>
      <small>{work.projectName}{work.roomName ? ` · ${work.roomName}` : ""}</small>
      <small><ProjectId projectNumber={work.projectNumber} /></small>
      <small>{work.orderNumber} · Revision {work.orderRevision}{work.quantityMilliUnits !== null && work.uomCode ? ` · ${work.quantityMilliUnits / 1000} ${work.uomCode}` : " · Issued quantity unavailable"}</small>
      {!work.sourceAvailable ? <small className="vendor-assignments__notice">Configuration link unavailable</small> : null}
    </AssignmentCell>
    <AssignmentCell label="Status" name="status">
      <span className="execution__status" data-status={work.status}>{workflow.stageLabel}</span>
      {workflow.reviewLabel ? <small className="vendor-assignments__review">{workflow.reviewLabel}</small> : null}
      {holdReason ? <p className="vendor-assignments__note">Reason: {holdReason}</p> : null}
      {work.status === "blocked" && report?.nextAction ? <small>Next action: {report.nextAction}</small> : null}
    </AssignmentCell>
    <AssignmentCell label="Last update" name="update">
      {report ? <>
        <time dateTime={report.reportedAt}>{executionTime(report.reportedAt, work.timezone)}</time>
        <p className="vendor-assignments__note">{report.note}</p>
      </> : <span>No update this round</span>}
    </AssignmentCell>
    <AssignmentCell label="Due" name="due">
      <span>{work.schedule ? executionDate(work.schedule.finishDate) : "Schedule not confirmed"}</span>
      {work.proposedSchedule ? <small>Proposed finish: {executionDate(work.proposedSchedule.finishDate)} · Awaiting confirmation</small> : null}
      {work.daily.dueAt ? <small className="vendor-assignments__deadline" data-state={work.daily.state}>Update due {executionTime(work.daily.dueAt, work.timezone)} ({work.timezone})</small> : <small>No update due</small>}
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
        <th scope="col" role="columnheader">Work</th>
        <th scope="col" role="columnheader">Status</th>
        <th scope="col" role="columnheader">Last update</th>
        <th scope="col" role="columnheader">Due</th>
        <th scope="col" role="columnheader"><span className="sr-only">Assignment details</span></th>
      </tr></thead>
      <tbody role="rowgroup">{items.map(work => <VendorAssignmentRow key={work.id} work={work} onOpen={onOpen} />)}</tbody>
    </table>
  </div>;
}
