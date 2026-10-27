import type { QueryClient } from "@tanstack/react-query";

/** Both owner editors affect the same assignment and all of its scoped readers. */
export async function refreshProjectManagerAssignment(client: QueryClient) {
  await Promise.all([
    ["admin-projects"],
    ["project-workflow"],
    ["assigned-projects"],
    ["project-manager"],
    ["execution"],
    ["procurement"],
    ["site-completion"],
    ["project-chat"],
    ["super-admin-dashboard"],
    ["designer", "kpi"]
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}
