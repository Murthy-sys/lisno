import type { ExecutionWork } from "../execution/executionApi";
import { executionActionLabels, executionDate, executionStatusLabels } from "../execution/executionPresentation";

export type VendorExecutionAction = "acknowledge" | "propose_schedule" | "report" | "submit";
export type VendorPrimaryAction =
  | { kind: "execution"; action: VendorExecutionAction; label: string }
  | { kind: "client_submission"; label: "Send to Client" };

export interface VendorWorkflowMilestone {
  id: "acknowledgement" | "schedule" | "report" | "verification" | "client";
  label: string;
  state: "recorded" | "current" | "pending" | "unavailable";
}

export interface VendorWorkflowPresentation {
  stageLabel: string;
  guidance: string;
  primaryAction: VendorPrimaryAction | null;
  milestones: VendorWorkflowMilestone[];
}

export function currentVendorReport(work: ExecutionWork) {
  return work.latestVendorReport?.executionRound === work.executionRound ? work.latestVendorReport : null;
}

function primaryAction(work: ExecutionWork): VendorPrimaryAction | null {
  if (work.tracking !== "tracked" || work.hold || ["superseded", "client_approved", "awaiting_client", "awaiting_verification"].includes(work.status)) return null;
  if (work.canSubmitToClient) return { kind: "client_submission", label: "Send to Client" };
  const priority: VendorExecutionAction[] = work.schedule
    ? ["acknowledge", "submit", "report", "propose_schedule"]
    : ["acknowledge", "propose_schedule", "submit", "report"];
  const action = priority.find(candidate => work.allowedActions.includes(candidate));
  return action ? { kind: "execution", action, label: executionActionLabels[action] } : null;
}

function milestones(work: ExecutionWork): VendorWorkflowMilestone[] {
  const modern = work.tracking === "tracked";
  const current = modern && work.status !== "superseded";
  const report = currentVendorReport(work);
  const verified = work.verification?.executionRound === work.executionRound;
  const beyondReporting = ["site_verified", "awaiting_client", "client_approved"].includes(work.status);
  const missing: VendorWorkflowMilestone["state"] = current ? "pending" : "unavailable";
  return [
    { id: "acknowledgement", label: "Acknowledgement", state: modern && work.acknowledgedAt ? "recorded" : current && work.status === "assigned" ? "current" : beyondReporting ? "unavailable" : missing },
    { id: "schedule", label: "Confirmed schedule", state: modern && work.schedule ? "recorded" : current && work.status === "awaiting_schedule" ? "current" : beyondReporting ? "unavailable" : missing },
    { id: "report", label: "Work updates", state: modern && report ? "recorded" : current && ["not_started", "in_progress", "blocked", "changes_requested"].includes(work.status) ? "current" : beyondReporting ? "unavailable" : missing },
    { id: "verification", label: "Project Manager verification", state: modern && verified ? "recorded" : current && work.status === "awaiting_verification" ? "current" : beyondReporting ? "unavailable" : missing },
    { id: "client", label: "Client review", state: work.status === "client_approved" ? "recorded" : work.status === "awaiting_client" ? "current" : work.status === "site_verified" && !work.canSubmitToClient ? "unavailable" : missing }
  ];
}

function nextStep(work: ExecutionWork, action: VendorPrimaryAction | null): string {
  if (action?.kind === "client_submission") return "Send the verified work to the Client for their separate review.";
  if (action?.kind === "execution") {
    switch (action.action) {
      case "acknowledge": return "Acknowledge the issued scope, then propose your start and finish dates.";
      case "propose_schedule": return work.schedule
        ? "Propose a schedule change with a reason. The confirmed commitment remains in effect until the change is confirmed."
        : work.proposedSchedule
          ? "Your proposed dates are awaiting confirmation. You can revise the proposal; it is not yet a confirmed commitment."
          : "Propose start and finish dates for confirmation before daily work reporting begins.";
      case "submit": return "Submit completion with current-round evidence for Project Manager verification. Client acceptance is a separate decision.";
      case "report": return "Save a daily update with the work completed and any blocker. Follow the reporting obligation shown for this assignment.";
    }
  }
  return "No vendor action is currently available. Refer to the saved workflow status and project notices.";
}

/** Display guidance only. Command permissions and transitions remain backend-owned. */
export function vendorWorkflowPresentation(work: ExecutionWork): VendorWorkflowPresentation {
  const action = primaryAction(work);
  const result: VendorWorkflowPresentation = {
    stageLabel: executionStatusLabels[work.status],
    guidance: nextStep(work, action),
    primaryAction: action,
    milestones: milestones(work)
  };

  if (work.status === "superseded") {
    return { ...result, guidance: "This issued assignment has been superseded. Its saved history remains available; no further vendor updates can be made." };
  }
  if (work.tracking === "legacy_review") {
    return {
      ...result,
      stageLabel: work.status === "awaiting_client" ? "With Client (existing review)" : result.stageLabel,
      guidance: work.status === "client_approved"
        ? "The Client accepted this assignment through its existing review. Earlier tracking milestones are not available here."
        : "This assignment retains its existing Client review. Earlier tracking milestones are not available here."
    };
  }
  if (work.tracking === "setup_required") {
    return { ...result, stageLabel: "Tracking setup required", guidance: "The authorized project team must enable tracking before you can acknowledge or update this assignment." };
  }
  if (work.hold) {
    return { ...result, stageLabel: "On hold", guidance: `Work is on hold: ${work.hold.reason} Review date: ${executionDate(work.hold.reviewDate)}. Follow the saved reporting status shown for this assignment.` };
  }
  if (work.status === "client_approved") {
    return { ...result, guidance: "The Client has accepted this assignment. Project closure is tracked separately." };
  }
  if (work.status === "awaiting_client") {
    return { ...result, guidance: "Your submitted work is waiting for the Client's decision. No further vendor submission is needed while this review is pending." };
  }
  if (work.status === "awaiting_verification") {
    return { ...result, guidance: "Completion has been submitted. The Project Manager must verify this round before Client review." };
  }
  if (work.status === "site_verified") {
    return { ...result, guidance: action?.kind === "client_submission"
      ? "The assignment is site verified. Send the verified work to the Client for their separate review."
      : "The assignment is marked site verified. Further review details are not available here. " + nextStep(work, action) };
  }
  if (work.status === "changes_requested") {
    const freshReport = currentVendorReport(work);
    return { ...result, guidance: `Review the requested changes. ${freshReport ? "This round has a saved vendor report." : "No vendor report is available for this round."} ${nextStep(work, action)} Completion requires fresh Project Manager verification.` };
  }
  if (work.status === "blocked") {
    return { ...result, guidance: `Work is blocked. Keep the recorded reason and next action up to date. ${nextStep(work, action)}` };
  }
  if (work.status === "awaiting_schedule" && !action && work.proposedSchedule) {
    return { ...result, guidance: "Your proposed dates are awaiting confirmation. They are not yet a confirmed commitment, and no vendor action is currently available." };
  }
  if (work.progress === 100 && work.verification?.executionRound !== work.executionRound) {
    return { ...result, guidance: `A reported 100% is not verified completion. ${currentVendorReport(work) ? "" : "No vendor report is available for this round. "}${nextStep(work, action)}` };
  }
  return result;
}
