import type { ChatActor } from "./project-chat.js";
import type { Role } from "../domain/roles.js";
import type { UserResponsibilityCounts } from "../repositories/types.js";

export type UserResponsibilityCategory = keyof UserResponsibilityCounts;
export interface UserResponsibilityQuery {
  destinationRole?: Role;
  limit: number;
  offset: number;
}
export interface UserResponsibilityProject {
  id: string;
  projectNumber: string | null;
  name: string;
  status: string;
  currentStage: { key: string; label: string } | null;
  stageState: "available" | "unavailable";
}
export interface UserResponsibilityRow {
  id: string;
  category: UserResponsibilityCategory;
  sourceType: "lead" | "estimate" | "project" | "task" | "user" | "project_access_grant" | "workflow_task";
  sourceId: string;
  label: string;
  workStatus: string | null;
  workStage: { key: string; label: string } | null;
  projectId: string | null;
  project: UserResponsibilityProject | null;
  contextState: "available" | "unlinked" | "unavailable" | "not_applicable";
  relatedUser: { id: string; name: string } | null;
  blocksRoleChange: boolean;
}
export interface UserResponsibilitiesPage {
  user: { id: string; role: Role; version: number };
  destinationRole: Role | null;
  readAt: string;
  counts: UserResponsibilityCounts;
  blockingCount: number;
  items: UserResponsibilityRow[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}
/** Internal administration read; the implementation validates the actor and enumerates the target's page itself. */
export type UserResponsibilityReader = (actor: ChatActor, userId: string, query: UserResponsibilityQuery) => Promise<UserResponsibilitiesPage>;
