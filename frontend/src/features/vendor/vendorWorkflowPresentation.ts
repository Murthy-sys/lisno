import type { ExecutionWork } from "../execution/executionApi";
import { executionActionLabels, executionDate, executionStatusLabels } from "../execution/executionPresentation";

export type VendorExecutionAction = "acknowledge" | "propose_schedule" | "report" | "submit";
export type VendorPrimaryAction =
  | { kind: "execution"; action: VendorExecutionAction; label: string }
  | { kind: "client_submission"; label: "Send to Client" };

export interface VendorWorkflowPresentation {
  stageLabel: string;
  guidance: string;
  reviewLabel: string | null;
  primaryAction: VendorPrimaryAction | null;
}

export function currentVendorReport(work: ExecutionWork) {
  return work.latestVendorReport?.executionRound === work.executionRound ? work.latestVendorReport : null;
}

function primaryAction(work: ExecutionWork): VendorPrimaryAction | null {
  if (!work.sourceAvailable || work.tracking !== "tracked" || work.hold || ["superseded", "client_approved", "awaiting_client", "awaiting_verification"].includes(work.status)) return null;
  if (work.canSubmitToClient) return { kind: "client_submission", label: "Send to Client" };
  const priority: VendorExecutionAction[] = work.schedule
    ? ["acknowledge", "submit", "report", "propose_schedule"]
    : ["acknowledge", "propose_schedule", "submit", "report"];
  const action = priority.find(candidate => work.allowedActions.includes(candidate));
  if (!action) return null;
  const label = action === "report" ? work.status === "not_started" && work.progress === 0 ? "Started working" : "Update progress"
    : action === "submit" ? "Completed" : executionActionLabels[action];
  return { kind: "execution", action, label };
}

function nextStep(work: ExecutionWork, action: VendorPrimaryAction | null): string {
  if (action?.kind === "client_submission") return "Send the verified work to the Client for their separate review.";
  if (action?.kind === "execution") {
    switch (action.action) {
      case "acknowledge": return "Acknowledge this work, then propose your start and finish dates.";
      case "propose_schedule": return work.schedule
        ? "Your confirmed dates remain in effect until the Project Manager confirms a schedule change."
        : work.proposedSchedule
          ? "Your proposed dates are awaiting Project Manager confirmation. They are not yet a confirmed commitment."
          : "Choose start and finish dates for Project Manager confirmation before work updates begin.";
      case "submit": return "Send completed work and photos for Project Manager verification. Client acceptance is a separate decision.";
      case "report": return "Update your work below. In progress needs photos; On hold needs a reason.";
    }
  }
  return "No vendor action is currently available. Check the saved status and project notices.";
}

/** Presentation only. Command permissions and approval transitions remain backend-owned. */
export function vendorWorkflowPresentation(work: ExecutionWork): VendorWorkflowPresentation {
  const action = primaryAction(work);
  const report = currentVendorReport(work);
  const justStarted = report?.updateType === "started" || (!report?.updateType && work.progress === 0);
  const result: VendorWorkflowPresentation = {
    stageLabel: work.status === "in_progress" && justStarted ? "Started working"
      : work.status === "blocked" ? "On hold"
      : work.status === "awaiting_verification" ? "Completed by vendor" : executionStatusLabels[work.status],
    guidance: nextStep(work, action),
    reviewLabel: null,
    primaryAction: action
  };

  if (work.status === "superseded") return { ...result, guidance: "This issued assignment was superseded. Its history remains available; further work updates are closed." };
  if (work.tracking === "legacy_review") return {
    ...result,
    stageLabel: work.status === "awaiting_client" ? "With Client (existing review)" : result.stageLabel,
    reviewLabel: work.status === "awaiting_client" ? "Awaiting Client acceptance" : null,
    guidance: work.status === "client_approved" ? "The Client accepted this assignment through its existing review."
      : "This assignment retains its existing Client review. Earlier work updates are unavailable."
  };
  if (work.tracking === "setup_required") return { ...result, stageLabel: "Tracking setup required", guidance: "The project team must enable tracking before you can acknowledge or update this work." };
  if (work.hold) return { ...result, stageLabel: "On hold", guidance: `${work.hold.reason} The Project Manager will review the hold on ${executionDate(work.hold.reviewDate)}.` };
  if (!work.sourceAvailable) return { ...result, guidance: "The issued source is unavailable. Contact the project team before updating this assignment." };
  if (work.status === "client_approved") return { ...result, guidance: "The Client has accepted this assignment. Project closure is tracked separately." };
  if (work.status === "awaiting_client") return { ...result, reviewLabel: "Awaiting Client acceptance", guidance: "Your work is waiting for the Client's decision. No further submission is needed during this review." };
  if (work.status === "awaiting_verification") return { ...result, reviewLabel: "Awaiting Project Manager verification", guidance: "You marked this work completed. The Project Manager must verify this round before Client review." };
  if (work.status === "site_verified") return { ...result,
    reviewLabel: action?.kind === "client_submission" ? "Ready to send to Client" : "Project Manager verification recorded",
    guidance: action?.kind === "client_submission" ? "The Project Manager verified this work. Send it to the Client for their separate review."
      : "The Project Manager verified this work. Further review details are not available here."
  };
  if (work.status === "changes_requested") return { ...result, reviewLabel: "Fresh verification required",
    guidance: `Review the requested changes. ${currentVendorReport(work) ? "Update this round before submitting again." : "No vendor report is available for this round."} Completion requires fresh Project Manager verification.` };
  if (work.status === "blocked") return { ...result, guidance: "You reported a hold. Keep the reason current and add an update when work can continue; the saved reporting deadline still applies." };
  if (work.status === "awaiting_schedule" && !action && work.proposedSchedule) return { ...result, guidance: "Your proposed dates are awaiting Project Manager confirmation. Work updates open after confirmation." };
  return result;
}
