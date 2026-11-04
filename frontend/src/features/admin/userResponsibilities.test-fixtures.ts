import { http, HttpResponse } from "msw";
import type { UserDirectoryItem, UserResponsibilitiesPage, UserResponsibilityCounts, UserResponsibilityRow } from "../../api/types";

export const emptyResponsibilityCounts: UserResponsibilityCounts = {
  ownedActiveLeads: 0, ownedActiveEstimates: 0, initiatedActiveProjects: 0, assignedActiveProjects: 0,
  managedActiveProjects: 0, ownedActiveTasks: 0, directReports: 0, linkedClientProjects: 0,
  adminInitiatorGrants: 0, assignedExecutionProjects: 0, assignedWorkflowTasks: 0
};

export const responsibilityUser = { id: "designer-a", role: "designer" as const, version: 3 };

export function responsibilityRow(overrides: Partial<UserResponsibilityRow> = {}): UserResponsibilityRow {
  return {
    id: "ownedActiveTasks:task-a", category: "ownedActiveTasks", sourceType: "task", sourceId: "task-a",
    label: "Prepare kitchen drawings", workStatus: "in_progress", workStage: { key: "drawings", label: "Working drawings" },
    projectId: "project-a", project: { id: "project-a", projectNumber: "Lisno000121", name: "North Residence", status: "active",
      currentStage: { key: "space_planning", label: "Space planning" }, stageState: "available" },
    contextState: "available", relatedUser: null, blocksRoleChange: false, ...overrides
  };
}

export function responsibilityPage(overrides: Partial<UserResponsibilitiesPage> = {}): UserResponsibilitiesPage {
  return {
    user: responsibilityUser, destinationRole: "designer", readAt: "2026-11-04T10:00:00.000Z",
    counts: { ...emptyResponsibilityCounts, ownedActiveTasks: 1 }, blockingCount: 0,
    items: [responsibilityRow()], pagination: { limit: 20, offset: 0, total: 1, hasMore: false }, ...overrides
  };
}

export function emptyResponsibilitiesHandler(users: readonly Pick<UserDirectoryItem, "id" | "role" | "version">[]) {
  return http.get("/api/v1/admin/users/:userId/responsibilities", ({ params, request }) => {
    const user = users.find(candidate => candidate.id === params.userId);
    if (!user) return HttpResponse.json({ error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
    const query = new URL(request.url).searchParams;
    return HttpResponse.json({ data: responsibilityPage({ user, destinationRole: query.get("destinationRole") as UserResponsibilitiesPage["destinationRole"],
      counts: emptyResponsibilityCounts, items: [], pagination: { limit: Number(query.get("limit") ?? 20), offset: Number(query.get("offset") ?? 0), total: 0, hasMore: false } }) });
  });
}
