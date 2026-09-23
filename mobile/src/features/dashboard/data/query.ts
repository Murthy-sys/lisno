import type { RequestScope } from "../../../contracts/http";
import { privateQueryKey, type PrivateQueryKey } from "../../../core/query/queryClient";
import type { DashboardPeriod } from "./contract";

type DashboardQueryScope = Pick<RequestScope, "environmentId" | "userId">;

export function dashboardEndpoint(period: DashboardPeriod): string {
  return `/admin/dashboard/overview?periodDays=${period}`;
}

export function dashboardQueryKey(
  scope: DashboardQueryScope,
  period: DashboardPeriod
): PrivateQueryKey {
  return privateQueryKey(scope, "dashboard", "overview", period);
}
