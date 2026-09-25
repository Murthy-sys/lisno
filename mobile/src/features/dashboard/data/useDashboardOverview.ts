import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { AuthenticatedSession } from "../../../contracts/session";
import { canPerformOperation } from "../../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../../runtime/RuntimeProvider";
import { type DashboardPeriod, parseDashboardOverview } from "./contract";
import { dashboardEndpoint, dashboardQueryKey } from "./query";
import { buildDashboardViewModel, type DashboardViewModel } from "./viewModel";

export function useDashboardOverview(
  session: AuthenticatedSession,
  period: DashboardPeriod
): UseQueryResult<DashboardViewModel, Error> {
  const context = useConfiguredRuntime();
  const scope = {
    environmentId: context.environment.environment.id,
    userId: session.user.id
  };
  const authorized = canPerformOperation(session, "GET /admin/dashboard/overview");

  return useQuery({
    queryKey: dashboardQueryKey(scope, period),
    queryFn: async ({ signal }) => buildDashboardViewModel(parseDashboardOverview(
      await context.runtime.api.authenticated.get<unknown>(dashboardEndpoint(period), { signal })
    )),
    enabled: authorized,
    placeholderData: keepPreviousData
  });
}
