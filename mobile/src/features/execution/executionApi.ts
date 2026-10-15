import type { JsonApiClient } from "../../core/http/apiClient";
import type { ExecutionCommand, ExecutionHistoryPage, ExecutionNotificationPage, ExecutionPage, ExecutionPolicy, ExecutionPolicyInput, ExecutionPortfolio, ExecutionPortfolioQuery, ExecutionQuery, ExecutionWork } from "./executionTypes";
import type { VendorOrderAccessCommand, VendorOrderAccessPage } from "./vendorAccessTypes";

export function queryString(query: object = {}) {
  const values = Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return values.length ? `?${values.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}` : "";
}
export function createExecutionApi(http: JsonApiClient["authenticated"]) {
  const project = (id: string) => `/projects/${encodeURIComponent(id)}`;
  const work = (id: string) => `/execution/work/${encodeURIComponent(id)}`;
  return {
    mine: (query: ExecutionQuery, signal?: AbortSignal) => http.get<ExecutionPage>(`/vendor/work/execution${queryString(query)}`, { signal }),
    project: (id: string, query: ExecutionQuery, signal?: AbortSignal) => http.get<ExecutionPage>(`${project(id)}/execution${queryString(query)}`, { signal }),
    projects: (query: ExecutionPortfolioQuery, signal?: AbortSignal) => http.get<ExecutionPortfolio>(`/execution/projects${queryString(query)}`, { signal }),
    detail: (id: string, signal?: AbortSignal) => http.get<ExecutionWork>(work(id), { signal }),
    history: (id: string, query: ExecutionQuery, signal?: AbortSignal) => http.get<ExecutionHistoryPage>(`${work(id)}/history${queryString(query)}`, { signal }),
    command: (id: string, projectId: string, vendor: boolean, body: ExecutionCommand) => http.post<ExecutionWork>(vendor ? `/vendor/work/${encodeURIComponent(id)}/execution` : `${project(projectId)}/execution/${encodeURIComponent(id)}`, body),
    policy: (id: string, signal?: AbortSignal) => http.get<ExecutionPolicy>(`${project(id)}/execution-policy`, { signal }),
    savePolicy: (id: string, body: ExecutionPolicyInput) => http.put<ExecutionPolicy>(`${project(id)}/execution-policy`, body),
    notifications: (offset: number, signal?: AbortSignal) => http.get<ExecutionNotificationPage>(`/execution/notifications?limit=25&offset=${offset}`, { signal }),
    readNotification: (id: string) => http.post<{ readAt: string }>(`/execution/notifications/${encodeURIComponent(id)}/read`, {}),
    access: (id: string, signal?: AbortSignal) => http.get<VendorOrderAccessPage>(`${project(id)}/vendor-access`, { signal }),
    sendAccess: (id: string, orderId: string, body: VendorOrderAccessCommand) => http.post<VendorOrderAccessPage>(`${project(id)}/vendor-access/orders/${encodeURIComponent(orderId)}/send`, body),
    retryAccess: (id: string, intentId: string, body: { expectedVersion: number; idempotencyKey: string }) => http.post<VendorOrderAccessPage>(`${project(id)}/vendor-access/${encodeURIComponent(intentId)}/retry`, body)
  };
}
