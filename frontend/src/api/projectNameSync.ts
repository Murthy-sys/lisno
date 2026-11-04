import type { QueryClient } from "@tanstack/react-query";
import { adminProjectKeys } from "../features/admin/adminProjectsApi";
import { dashboardKeys } from "../features/admin/dashboard/superAdminDashboardApi";
import { clientKeys } from "../features/client/clientApi";
import { designerKeys } from "../features/designer/designerApi";
import { projectFinanceKeys } from "../features/finance/projectFinanceApi";
import { projectWorkflowKeys } from "../features/workflow/projectWorkflowApi";
import { projectReadKeys } from "../features/projects/projectReadQueries";

/** Refresh live project identity after a committed name or number change. */
export async function invalidateProjectIdentityQueries(client: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: [...adminProjectKeys.all, "page"] }),
    client.invalidateQueries({ queryKey: adminProjectKeys.detail(projectId) }),
    client.invalidateQueries({ queryKey: dashboardKeys.all }),
    client.invalidateQueries({ queryKey: clientKeys.projects }),
    client.invalidateQueries({ queryKey: designerKeys.projects() }),
    client.invalidateQueries({ queryKey: [...projectReadKeys.all, "list"] }),
    client.invalidateQueries({ queryKey: [...projectReadKeys.all, "detail", projectId] }),
    client.invalidateQueries({ queryKey: projectFinanceKeys.projects }),
    client.invalidateQueries({ queryKey: projectFinanceKeys.bucket(projectId) }),
    client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
    client.invalidateQueries({ queryKey: ["management"] }),
    client.invalidateQueries({ queryKey: ["access-requests"] }),
    client.invalidateQueries({ queryKey: ["quotation", projectId, "detail"] }),
    client.invalidateQueries({ queryKey: ["estimate-tiers", projectId] }),
    client.invalidateQueries({ queryKey: ["procurement", "projects"] }),
    client.invalidateQueries({ queryKey: ["procurement", "suggestion-projects"] }),
    client.invalidateQueries({ queryKey: ["procurement", "vendor-suggestions", projectId] }),
    client.invalidateQueries({ queryKey: ["project-manager"], predicate: query =>
      query.queryKey[1] === "estimations" && query.queryKey[3] === projectId || query.queryKey.some(part => typeof part === "string" &&
        (part.startsWith("/project-manager/projects") || part.startsWith(`/projects/${encodeURIComponent(projectId)}/pm/`))) }),
    client.invalidateQueries({ queryKey: ["execution"], predicate: query => {
      const kind = query.queryKey[1];
      return kind === "projects" || kind === "mine" || kind === "project" && query.queryKey[2] === projectId ||
        kind === "detail" && (query.state.data as { projectId?: string } | undefined)?.projectId === projectId;
    } }),
    client.invalidateQueries({ queryKey: ["project-chat"], predicate: query =>
      query.queryKey[2] === "conversations" || query.queryKey[2] === "project" &&
      query.queryKey[3] === projectId && query.queryKey[4] === "summary" })
  ]);
}

export const invalidateProjectNameQueries = invalidateProjectIdentityQueries;
