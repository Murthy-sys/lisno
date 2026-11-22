import { useRef, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { MarginCommitResult, MarginMatrix } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { getKnowledgeMarginMatrix } from "./knowledgeApi";
import { KnowledgeMarginDecisionPanel, type MarginComparison } from "./KnowledgeMarginDecisionPanel";
import { sharedTierDefaults } from "./knowledgeMarginFields";
import { syncKnowledgeSubBasketMargins } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

function MarginIcon({ name }: { name: KnowledgeModeTier | "bell" }) {
  const paths = {
    signature: "M3 7l4.7 3.1L12 4l4.3 6.1L21 7l-2.4 11H5.4L3 7Zm3.5 14h11",
    premium: "M2 9l4.5-5h11L22 9 12 21 2 9Zm0 0h20M10 4 7.5 9 12 21l4.5-12L14 4",
    functional: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
    bell: "M8.8 20a3.5 3.5 0 0 0 6.4 0M4 17h16l-2.2-3.2V10a5.8 5.8 0 0 0-11.6 0v3.8L4 17ZM12 3V2"
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

type ActivePanel = { view: "edit" | "exceptions"; tier: KnowledgeModeTier; matrix: MarginMatrix; iteration: number };

export function KnowledgeMarginMatrix({ basketId, subBasketId, name, enabled, readOnly, comparison, onCompare, onLeaveComparison }: {
  basketId: string; subBasketId: string; name: string; enabled: boolean; readOnly: boolean;
  comparison?: MarginComparison;
  onCompare: (tier: KnowledgeModeTier, allowRestore: boolean, onRestored: () => void) => void;
  onLeaveComparison: () => void;
}) {
  const client = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fallbackFocusRef = useRef<HTMLButtonElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<ActivePanel>();
  const [saved, setSaved] = useState("");
  const [refreshIds, setRefreshIds] = useState<readonly string[]>();
  const query = useQuery({
    queryKey: knowledgeQueryKeys.subBasketMarginMatrix(basketId, subBasketId),
    queryFn: async () => {
      const matrix = await getKnowledgeMarginMatrix(basketId, subBasketId);
      if (matrix.basketId !== basketId || matrix.subBasketId !== subBasketId) throw new Error("Could not verify the Sub-Basket margin summary.");
      if (!KNOWLEDGE_MODE_TIERS.every(tier => sharedTierDefaults(matrix.defaults, tier))) throw new Error("Could not load a shared default for every tier.");
      return matrix;
    },
    enabled
  });
  const matrix = query.isSuccess ? query.data : undefined;
  const available = enabled && !!matrix && !query.isFetching && !refreshIds && !refreshing;
  const open = (view: ActivePanel["view"], tier: KnowledgeModeTier, event: MouseEvent<HTMLButtonElement>) => {
    if (!matrix || !available) return;
    triggerRef.current = event.currentTarget;
    setActive({ view, tier, matrix, iteration: 0 });
  };
  function close() {
    onLeaveComparison();
    setActive(undefined);
  }
  async function refresh(ids: readonly string[]) {
    setRefreshing(true);
    const results = await Promise.allSettled([
      syncKnowledgeSubBasketMargins(client, ids, basketId),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketMargins(basketId, subBasketId) }, { throwOnError: true })
    ]);
    setRefreshing(false);
    setRefreshIds(results.every((entry) => entry.status === "fulfilled" && entry.value !== false) ? undefined : ids);
  }
  async function committed(result: MarginCommitResult, sourceLineId?: string) {
    setSaved(result.alreadyApplied ? "These margins were already applied." : `Margins saved. ${result.updatedMainLineIds.length} Main ${result.updatedMainLineIds.length === 1 ? "Line" : "Lines"} updated.`);

    const ids = new Set(result.updatedMainLineIds);
    if (sourceLineId) ids.add(sourceLineId);
    await refresh([...ids]);
    close();
  }
  async function reload() {
    const next = await query.refetch();
    if (next.isSuccess) setActive((old) => old && { ...old, matrix: next.data, iteration: old.iteration + 1 });
  }
  const count = matrix?.exceptions.length;
  const notificationLabel = count === undefined
    ? `Margin exception count ${query.isError ? "unavailable" : "loading"} for ${name}`
    : `Review exceptions (${count}) for ${name}`;

  return <div className="knowledge-margin-controls">
    <div className="knowledge-sub-margins__tiers" role="group" aria-label={`Margin tiers for ${name}`}>
      {KNOWLEDGE_MODE_TIERS.map((tier) => <button key={tier} type="button"
        ref={tier === "signature" ? fallbackFocusRef : undefined} className="knowledge-sub-margins__tier"
        data-tier={tier} disabled={!enabled || !matrix} aria-disabled={!available}
        aria-haspopup="dialog" aria-expanded={active?.view === "edit" && active.tier === tier}
        aria-label={`${KNOWLEDGE_MODE_TIER_LABELS[tier]} margins for ${name}`}
        onClick={(event) => open("edit", tier, event)}><MarginIcon name={tier} />{KNOWLEDGE_MODE_TIER_LABELS[tier]}</button>)}
      <button type="button" className="knowledge-sub-margins__bell" disabled={!enabled || !matrix} aria-disabled={!available}
        aria-haspopup="dialog" aria-expanded={active?.view === "exceptions"} aria-label={notificationLabel}
        title={notificationLabel} onClick={(event) => open("exceptions", "signature", event)}>
        <MarginIcon name="bell" />{count !== undefined && count > 0 && <span aria-hidden="true">{count}</span>}
      </button>
    </div>
    {enabled && query.isPending && <p role="status">Loading tier margins…</p>}
    {query.isError && <InlineMessage role="alert" tone="warning">Tier margins and exception count unavailable.{" "}
      <Button variant="quiet" size="compact" busy={query.isFetching} onClick={() => void query.refetch()}>Retry margins</Button></InlineMessage>}
    {!!saved && <p role="status">{saved}</p>}
    {refreshIds && !refreshing && !query.isFetching && <InlineMessage tone="warning" role="status">Some related views could not refresh.{" "}
      <Button variant="quiet" size="compact" onClick={() => void refresh(refreshIds)}>Retry refresh</Button></InlineMessage>}
    {active && enabled && <KnowledgeMarginDecisionPanel key={active.iteration} name={name} matrix={active.matrix}
      tier={active.tier} onTier={(tier) => setActive({ ...active, tier })} comparison={comparison}
      onCompare={(allowRestore) => onCompare(active.tier, allowRestore, close)} onLeaveComparison={onLeaveComparison}
      view={active.view} readOnly={readOnly} current={matrix?.versionToken === active.matrix.versionToken}
      loading={query.isFetching} triggerRef={triggerRef} fallbackFocusRef={fallbackFocusRef} onReload={reload} onCommitted={committed} onClose={close} />}
  </div>;
}
