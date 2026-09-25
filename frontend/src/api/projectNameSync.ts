import type { QueryClient } from "@tanstack/react-query";
import { adminProjectKeys } from "../features/admin/adminProjectsApi";
import { dashboardKeys } from "../features/admin/dashboard/superAdminDashboardApi";
import { clientKeys } from "../features/client/clientApi";
import { designerKeys } from "../features/designer/designerApi";
import { projectFinanceKeys } from "../features/finance/projectFinanceApi";
import { projectWorkflowKeys } from "../features/workflow/projectWorkflowApi";

/** Refresh live project presentations after a canonical rename, without editing snapshots. */
export async function invalidateProjectNameQueries(client: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: [...adminProjectKeys.all, "page"] }),
    client.invalidateQueries({ queryKey: adminProjectKeys.detail(projectId) }),
    client.invalidateQueries({ queryKey: dashboardKeys.all }),
    client.invalidateQueries({ queryKey: clientKeys.projects }),
    client.invalidateQueries({ queryKey: designerKeys.projects() }),
    client.invalidateQueries({ queryKey: projectFinanceKeys.projects }),
    client.invalidateQueries({ queryKey: projectFinanceKeys.bucket(projectId) }),
    client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
    client.invalidateQueries({ queryKey: ["management"] }),
    client.invalidateQueries({ queryKey: ["access-requests"] })
  ]);
}
