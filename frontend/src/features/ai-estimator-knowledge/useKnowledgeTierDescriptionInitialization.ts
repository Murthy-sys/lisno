import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeConfigurationScope } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError } from "../../api/client";
import { getKnowledgeItem, getKnowledgeSection, initializeKnowledgeTierDescriptions } from "./knowledgeApi";
import { knowledgeModeTierDataSource } from "./knowledgeModeTierDataSource";
import { invalidateKnowledgeSectionMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

// A shared request survives Strict Mode effect cleanup and rapid tier switching.
const inFlight = new WeakMap<QueryClient, Map<string, Promise<void>>>();

function initialize(client: QueryClient, mainLineId: string, revisionId: string): Promise<void> {
  const requests = inFlight.get(client) ?? new Map<string, Promise<void>>();
  inFlight.set(client, requests);
  const key = JSON.stringify([mainLineId, revisionId]);
  const pending = requests.get(key);
  if (pending) return pending;

  const operation = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const [item, section] = await Promise.all([
        getKnowledgeItem(mainLineId), getKnowledgeSection(mainLineId, revisionId, "advanced")
      ]);
      if (item.mainLineId !== mainLineId || item.draftRevision?.id !== revisionId || item.draftRevision.status !== "draft"
        || item.status === "archived" || !item.allowedActions.includes("update_section")
        || section.mainLineId !== mainLineId || section.revisionId !== revisionId || section.sectionKey !== "advanced"
        || (section.modeTier ?? "signature") !== "signature") {
        throw new Error("The editable draft changed. Reload this item before editing.");
      }
      try {
        const result = await initializeKnowledgeTierDescriptions(mainLineId, revisionId, {
          expectedVersion: section.version, expectedAggregateVersion: item.version
        });
        if (result.mainLineId !== mainLineId || result.revisionId !== revisionId) {
          throw new Error("The saved descriptions could not be verified. Try again.");
        }
        if (result.copiedTiers.length) await invalidateKnowledgeSectionMutation(client, mainLineId);
        // Refresh retained tier caches before mounting the editor. Unvisited scopes
        // have no stale payload to expose and use their normal initial read.
        const cachedTiers = KNOWLEDGE_MODE_TIERS.filter(tier => tier === "signature"
          || client.getQueryState(knowledgeModeTierDataSource(tier).sectionKey(mainLineId, revisionId, "advanced")));
        await Promise.all([
          client.cancelQueries({ queryKey: knowledgeQueryKeys.item(mainLineId), exact: true }),
          ...cachedTiers.map(tier => client.cancelQueries({
            queryKey: knowledgeModeTierDataSource(tier).sectionKey(mainLineId, revisionId, "advanced"), exact: true
          }))
        ]);
        const [latestItem, tiers] = await Promise.all([
          getKnowledgeItem(mainLineId),
          Promise.all(cachedTiers.map(async tier => ({ tier,
            section: await knowledgeModeTierDataSource(tier).getSection(mainLineId, revisionId, "advanced")
          })))
        ]);
        if (latestItem.mainLineId !== mainLineId || latestItem.draftRevision?.id !== revisionId
          || latestItem.version < result.aggregateVersion || tiers.some(value => value.section.version < result.version
            || value.section.version !== tiers[0]!.section.version)) {
          throw new Error("Configuration changed while descriptions refreshed. Try again.");
        }
        client.setQueryData(knowledgeQueryKeys.item(mainLineId), latestItem);
        for (const { tier, section: saved } of tiers) {
          client.setQueryData(knowledgeModeTierDataSource(tier).sectionKey(mainLineId, revisionId, "advanced"), saved);
        }
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof ApiError && error.code === "VERSION_CONFLICT") continue;
        throw error;
      }
    }
  })();
  requests.set(key, operation);
  void operation.finally(() => { if (requests.get(key) === operation) requests.delete(key); }).catch(() => undefined);
  return operation;
}

interface Input {
  readonly mainLineId: string;
  readonly revisionId: string | undefined;
  readonly modeTier: KnowledgeModeConfigurationScope | null;
  readonly overviewVersion: number | undefined;
  readonly enabled: boolean;
  readonly hasPendingWork: boolean;
}

/** Only the live editable workspace calls this; generic editor reads remain read-only. */
export function useKnowledgeTierDescriptionInitialization(input: Input) {
  const client = useQueryClient();
  const { mainLineId, revisionId, modeTier, overviewVersion, enabled, hasPendingWork } = input;
  const eligible = enabled && Boolean(revisionId) && modeTier !== null && modeTier !== "default";
  const entry = JSON.stringify([mainLineId, revisionId, modeTier, overviewVersion]);
  const [state, setState] = useState<{ entry: string; phase: "loading" | "ready" | "error"; error?: Error } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (!eligible) { setState(current => current === null ? current : null); return; }
    if (hasPendingWork || state?.entry === entry && state.phase !== "loading") return;
    let current = true;
    setState({ entry, phase: "loading" });
    void initialize(client, mainLineId, revisionId!).then(
      () => { if (current) setState({ entry, phase: "ready" }); },
      error => { if (current) setState({ entry, phase: "error", error: error instanceof Error ? error : new Error("Descriptions could not be loaded. Try again.") }); }
    );
    return () => { current = false; };
    // Result-state changes must not restart the entry operation or detach its observer.
  }, [client, eligible, entry, hasPendingWork, mainLineId, revisionId, retryAttempt]);

  return {
    pending: eligible && !hasPendingWork && (state?.entry !== entry || state.phase === "loading"),
    error: eligible && state?.entry === entry && state.phase === "error" ? state.error : undefined,
    retry: () => { setState(null); setRetryAttempt(current => current + 1); }
  };
}
