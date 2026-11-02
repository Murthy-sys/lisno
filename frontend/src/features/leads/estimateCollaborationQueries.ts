import type { QueryClient } from "@tanstack/react-query";

/** Commercial changes also alter client reviews, design scope and procurement sources. */
export async function refreshEstimateCollaboration(queryClient: QueryClient, options: { includeRevision?: boolean } = {}) {
  await Promise.all([
    ["leads"], ["estimates"], ["client"], ["estimate-requirements"], ["estimate-tiers"], ["estimate-collaboration"],
    ["estimate-designs"], ["estimate-plan-change-requests"], ["project-workflow"],
    ["procurement"], ["project-finance"], ["projects"], ["designer"], ["admin-projects"], ["assigned-projects"],
    ["admin", "purchase-orders"], ["admin", "purchase-order-requests"]
  ].map((queryKey) => queryClient.invalidateQueries({ queryKey })).concat([
    queryClient.invalidateQueries({ queryKey: ["quotation"], predicate: query => options.includeRevision !== false || query.queryKey[2] !== "revision" })
  ]));
}
