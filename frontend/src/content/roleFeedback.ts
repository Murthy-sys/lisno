import type { Role } from "../api/types";

export type RoleFeedbackRequest =
  | { situation: "workspaceLoading" | "clearState" | "conflict" }
  | { situation: "requestedChanges" | "replacementReady"; count: number };

type CountForms = {
  zero: string;
  singular: string;
  plural: (count: number) => string;
};

type RoleFeedbackContent = {
  workspaceLoading: string;
  clearState: string;
  conflict: string;
  requestedChanges: CountForms;
  replacementReady: CountForms;
};

const roleFeedback: Record<Role, RoleFeedbackContent> = {
  designer: {
    workspaceLoading: "Loading your projects, priorities, and client feedback…",
    clearState: "You’re clear—no urgent tasks need attention.",
    conflict: "A newer version is available. Review the refreshed values before saving again.",
    requestedChanges: {
      zero: "No client-requested section updates are open. Approved sections remain locked.",
      singular: "Client requested an update to 1 section. Approved sections remain locked.",
      plural: (count) => `Client requested updates to ${count} sections. Approved sections remain locked.`,
    },
    replacementReady: {
      zero: "No updated sections are ready to submit.",
      singular: "1 updated section is ready to submit.",
      plural: (count) => `${count} updated sections are ready to submit.`,
    },
  },
  design_manager: {
    workspaceLoading: "Loading your team, workload, and approval queue…",
    clearState: "No team actions need attention right now.",
    conflict: "The record changed. Review the latest details before trying again.",
    requestedChanges: {
      zero: "No revised sections are waiting for review.",
      singular: "Review is waiting for 1 revised section.",
      plural: (count) => `Review is waiting for ${count} revised sections.`,
    },
    replacementReady: {
      zero: "No revised sections are ready for delivery review.",
      singular: "1 revised section is ready for delivery review.",
      plural: (count) => `${count} revised sections are ready for delivery review.`,
    },
  },
  design_head: {
    workspaceLoading: "Loading managers, team health, and evaluation coverage…",
    clearState: "All teams are currently within delivery thresholds.",
    conflict: "This inspection changed while it was open. Refresh to continue.",
    requestedChanges: {
      zero: "No requested revisions are affecting delivery health.",
      singular: "1 requested revision is affecting delivery health.",
      plural: (count) => `${count} requested revisions are affecting delivery health.`,
    },
    replacementReady: {
      zero: "No updated sections are moving through approval.",
      singular: "1 updated section is moving back through approval.",
      plural: (count) => `${count} updated sections are moving back through approval.`,
    },
  },
  estimator_sales: {
    workspaceLoading: "Loading leads, estimates, and client feedback…",
    clearState: "No client feedback needs action.",
    conflict: "The request changed. Review the latest targets before resubmitting.",
    requestedChanges: {
      zero: "No client feedback needs section updates.",
      singular: "Client feedback to resolve in 1 section.",
      plural: (count) => `Client feedback to resolve in ${count} sections.`,
    },
    replacementReady: {
      zero: "No replacements are ready to send.",
      singular: "1 replacement is ready to send.",
      plural: (count) => `${count} replacements are ready to send.`,
    },
  },
  client: {
    workspaceLoading: "Loading your projects and items for review…",
    clearState: "Nothing needs your review right now.",
    conflict: "This item was updated. We’ve refreshed the latest version for you.",
    requestedChanges: {
      zero: "No image changes are awaiting an update.",
      singular: "Changes sent for 1 section. We’ll notify you when the updated image is ready.",
      plural: (count) => `Changes sent for ${count} sections. We’ll notify you when the updated images are ready.`,
    },
    replacementReady: {
      zero: "No updated images are waiting for review.",
      singular: "Image updated — please review and approve.",
      plural: (count) => `${count} images updated — please review and approve.`,
    },
  },
};

function resolveCount(count: number, forms: CountForms): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Feedback counts must be non-negative integers.");
  }

  if (count === 0) return forms.zero;
  if (count === 1) return forms.singular;
  return forms.plural(count);
}

export function getRoleFeedback(role: Role, request: RoleFeedbackRequest): string {
  const content = roleFeedback[role];

  if (request.situation === "requestedChanges" || request.situation === "replacementReady") {
    return resolveCount(request.count, content[request.situation]);
  }

  return content[request.situation];
}
