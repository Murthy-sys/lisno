import { useQueryClient } from "@tanstack/react-query";

import { adminProjectKeys } from "../admin/adminProjectsApi";
import { clientKeys } from "../client/clientApi";
import { designerKeys } from "../designer/designerApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { estimateDesignKeys } from "../leads/estimateDesignApi";
import { projectWorkflowKeys } from "./projectWorkflowApi";
import { procurementKeys } from "../procurement/procurementApi";
import { projectFinanceKeys } from "../finance/projectFinanceApi";

export function useRefreshDesignWorkflow({ includeClientPlans = false }: { includeClientPlans?: boolean } = {}) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
    queryClient.invalidateQueries({ queryKey: designerKeys.all }),
    queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
    queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
    queryClient.invalidateQueries({ queryKey: estimateDesignKeys.all }),
    queryClient.invalidateQueries({ queryKey: procurementKeys.all }),
    queryClient.invalidateQueries({ queryKey: projectFinanceKeys.all }),
    ...(includeClientPlans ? [
      queryClient.invalidateQueries({ queryKey: clientKeys.latestVersions }),
      queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client })
    ] : [])
  ]);
}
