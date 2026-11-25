import { ROLE_LABELS } from "../../api/authorization-contract";
import type { ProjectStatusSummary } from "../../api/types";

/** Present backend order and ownership without reconstructing workflow decisions. */
export function presentProjectStatus(summary: ProjectStatusSummary) {
  const simple = (label: string) => ({ label, owner: null, additional: null, description: label });
  if (summary.state === "unavailable") return simple("Status needs review");
  if (summary.state === "completed") return simple("Completed");
  if (summary.state === "no_pending") return simple("No pending tasks");
  const action = summary.currentStage && summary.pendingActions.find(item => item.stageKey === summary.currentStage!.key);
  if (!action) return simple(summary.state === "paused" ? "On hold" : "Status needs review");
  const state = summary.state === "paused" ? "On hold" : action.state === "blocked" ? "Blocked" : action.state === "scheduled" || summary.state === "scheduled" ? "Scheduled" : null;
  const label = [state, summary.currentStage!.label].filter(Boolean).join(" · ");
  const owner = action.people.length
    ? `Owner: ${action.people[0]!.name}${action.people.length > 1 ? ` +${action.people.length - 1}` : ""}`
    : `Unassigned · ${ROLE_LABELS[action.responsibleRole]}`;
  const others = Math.max(0, summary.pendingActions.length - 1);
  const additional = others ? `+${others} ${others === 1 ? "task" : "tasks"}` : null;
  const allOwners = action.people.length ? `Owners: ${action.people.map(person => `${person.name} (${ROLE_LABELS[person.role]})`).join(", ")}` : owner;
  return { label, owner, additional, description: [label, allOwners, action.action, additional].filter(Boolean).join(". ") };
}

