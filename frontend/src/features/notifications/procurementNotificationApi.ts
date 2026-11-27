import { apiClient } from "../../api/client";
import type { ProcurementNotificationPage } from "../../../../shared/procurement/notifications";
export type * from "../../../../shared/procurement/notifications";
export const procurementNotificationKeys = {
  root: (scope: string) => ["procurement-lifecycle-notifications", scope] as const,
  page: (scope: string, offset = 0) => ["procurement-lifecycle-notifications", scope, offset] as const
};
export const procurementNotificationApi = {
  list: (offset = 0, signal?: AbortSignal) => apiClient.get<ProcurementNotificationPage>(`/procurement-lifecycle/notifications?limit=20&offset=${offset}`, { signal, showGlobalLoader: false }),
  read: (id: string, signal?: AbortSignal) => apiClient.post<{ id: string; readAt: string }>(`/procurement-lifecycle/notifications/${encodeURIComponent(id)}/read`, {}, { signal, showGlobalLoader: false })
};
