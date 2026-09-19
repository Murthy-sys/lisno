import type { QueryClient } from "@tanstack/react-query";

import {
  invalidationPrefixes,
  purgePrefixes,
  type InvalidationEvent
} from "./invalidationRegistry";

export async function applyInvalidationEvent(
  client: QueryClient,
  scope: { readonly environmentId: string; readonly userId: string },
  event: InvalidationEvent
): Promise<void> {
  const purge = purgePrefixes(scope, event);
  await Promise.all(purge.map((queryKey) => client.cancelQueries({ queryKey })));
  for (const queryKey of purge) client.removeQueries({ queryKey });

  const purgedFamilies = new Set(purge.map((queryKey) => queryKey[2]));
  const refresh = invalidationPrefixes(scope, event).filter(
    (queryKey) => !purgedFamilies.has(queryKey[2])
  );
  await Promise.all(refresh.map((queryKey) => client.invalidateQueries({ queryKey })));
}
