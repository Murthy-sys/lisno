import type { Role } from "../domain/roles.js";

export interface ProjectStatusPerson {
  id: string;
  name: string;
  role: Role;
}

export interface ProjectPendingAction {
  id: string;
  stageKey: string;
  stageLabel: string;
  action: string;
  state: "pending" | "scheduled" | "blocked" | "unassigned";
  responsibleRole: Role;
  people: ProjectStatusPerson[];
  scheduledAt: string | null;
  deadlineAt: string | null;
  blocker: string | null;
}

/** A participant-safe projection; never include source records or commercial values. */
export interface ProjectStatusSummary {
  projectId: string;
  projectName: string;
  projectStatus: string;
  serverNow: string;
  state: "active" | "scheduled" | "paused" | "completed" | "no_pending" | "unavailable";
  currentStage: { key: string; label: string } | null;
  pendingActions: ProjectPendingAction[];
  issue: string | null;
}
