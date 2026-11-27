import type { QueryClient } from "@tanstack/react-query";
export async function refreshProcurementLifecycle(client: QueryClient) {
  await Promise.all([
    ["procurement"], ["work-order-approvals"], ["admin", "purchase-orders"], ["admin", "purchase-order-requests"],
    ["super-admin-dashboard"], ["project-workflow"], ["project-finance"],
    ["vendor", "work"], ["vendor", "purchase-order"], ["execution"], ["vendor-work"],
    ["procurement-lifecycle"], ["procurement-lifecycle-notifications"], ["site-completion"], ["project-manager"],
    ["admin", "project-completion-tasks"], ["finance", "work-orders"], ["finance", "work-order-assessment"],
    ["assigned-projects"], ["project-status"]
  ].map((queryKey) => client.invalidateQueries({ queryKey })));
}
