import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { applyInvalidationEvent } from "./applyInvalidation";
import type { InvalidationEvent } from "./invalidationRegistry";

export function useInvalidateEvent(): (event: InvalidationEvent) => Promise<void> {
  const client = useQueryClient();
  const context = useConfiguredRuntime();
  const userId = context.session.status === "authenticated"
    ? context.session.session?.user.id ?? null
    : null;

  return useCallback(async (event: InvalidationEvent) => {
    if (!userId) return;
    await applyInvalidationEvent(
      client,
      { environmentId: context.environment.environment.id, userId },
      event
    );
  }, [client, context.environment.environment.id, userId]);
}
