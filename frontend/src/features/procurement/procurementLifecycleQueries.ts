import type { QueryClient } from "@tanstack/react-query";
export async function refreshProcurementLifecycle(client: QueryClient) {
  await Promise.all([
    ["procurement"], ["work-order-approvals"], ["admin", "purchase-orders"], ["admin", "purchase-order-requests"],
    ["super-admin-dashboard"], ["project-workflow"], ["project-finance"],
    ["vendor", "work"], ["vendor", "purchase-order"], ["execution"], ["vendor-work"]
  ].map((queryKey) => client.invalidateQueries({ queryKey })));
}
