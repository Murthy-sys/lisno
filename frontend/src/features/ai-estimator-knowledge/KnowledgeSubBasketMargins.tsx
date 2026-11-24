import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginRange } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { applyKnowledgeSubBasketMargins, getKnowledgeSubBasketMargins } from "./knowledgeApi";
import { syncKnowledgeSubBasketMargins } from "./knowledgeMutationSync";
import { KnowledgeMarginMatrix } from "./KnowledgeMarginMatrix";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import "./knowledge-sub-basket-margins.css";

const MODES = ["pmc", "sub_vendor", "in_house"] as const;
const LABELS = { pmc: "PMC", sub_vendor: "Sub-vendor", in_house: "In-house" };
const percentage = (value: number | null) => value === null ? "Not configured" : `${value / 100}%`;

function MarginRanges({ ranges, mode, compact = false }: { ranges: readonly KnowledgeSubBasketMarginRange[]; mode: KnowledgeSubBasketMarginMode; compact?: boolean }) {
  if (!ranges.length || ranges.every((range) => range.minimumBps === null && range.maximumBps === null)) {
    return <span className="knowledge-sub-margins__empty">Not set</span>;
  }
  if (ranges.some(({ component }) => component)) {
    const groups = new Map<string, KnowledgeSubBasketMarginRange[]>();
    for (const range of ranges) {
      const key = JSON.stringify([range.component?.basketId, range.component?.subBasketId]);
      groups.set(key, [...(groups.get(key) ?? []), range]);
    }
    if (compact && groups.size > 1) return <span className="knowledge-sub-margins__value">{groups.size} component defaults</span>;
    return <span className="knowledge-sub-margins__component-ranges">{[...groups.entries()].map(([key, group]) => <span className="knowledge-sub-margins__component-range" key={key}>
      {!compact ? <strong>{group[0]?.component?.name ?? "In-house component"}</strong> : null}
      <MarginRanges ranges={group.map(({ component: _component, ...range }) => range)} mode={mode} compact={compact} />
    </span>)}</span>;
  }
  return <span className="knowledge-sub-margins__ranges" data-compact={compact || undefined}>{ranges.length ? ranges.map((range) => <span className="knowledge-sub-margins__range" key={range.key}>
    {range.key !== "margin" ? <span className="knowledge-sub-margins__scope">{range.key === "labor" ? "Labour" : "Material"} </span> : null}
    {range.minimumBps === null || range.maximumBps === null ? compact ? "Not set" : "Not configured"
      : compact && range.minimumBps === range.maximumBps
        ? <span className="knowledge-sub-margins__value"><span className="sr-only">{mode === "in_house" ? "Minimum and starting " : "Minimum and maximum "}</span>{percentage(range.minimumBps)}</span>
        : <span className="knowledge-sub-margins__value"><span className="sr-only">Min. </span>{percentage(range.minimumBps)}<span className="knowledge-sub-margins__separator"> / </span><span className="sr-only">{mode === "in_house" ? "Starting " : "Max. "}</span>{percentage(range.maximumBps)}</span>}
  </span>) : <span>Not configured</span>}</span>;
}

type MarginProps = {
  readonly basketId: string;
  readonly subBasketId: string;
  readonly subBasketName: string;
  readonly enabled: boolean;
  readonly readOnly: boolean;
};
type MarginSelection = { readonly tier: KnowledgeModeTier; readonly mode: KnowledgeSubBasketMarginMode; readonly allowRestore: boolean };

export function KnowledgeSubBasketMargins(props: MarginProps) {
  return <SubBasketTierMargins key={JSON.stringify([props.basketId, props.subBasketId])} {...props} />;
}

function SubBasketTierMargins({ basketId, subBasketId, subBasketName, enabled, readOnly }: MarginProps) {
  const client = useQueryClient();
  const signatureKey = knowledgeQueryKeys.subBasketMargins(basketId, subBasketId);
  const [selected, setSelected] = useState<MarginSelection | null>(null);
  const queries = useQueries({ queries: KNOWLEDGE_MODE_TIERS.map((tier) => ({
    queryKey: knowledgeQueryKeys.subBasketMargins(basketId, subBasketId, tier),
    queryFn: async () => {
      const summary = await getKnowledgeSubBasketMargins(basketId, subBasketId, { modeTier: tier });
      if (summary.basketId !== basketId || summary.subBasketId !== subBasketId) throw new Error("The margin comparison could not be verified. Please retry.");
      return summary;
    },
    enabled: enabled && selected?.tier === tier,
    staleTime: 30_000
  })) });
  const [announcement, setAnnouncement] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const closeAfterRestore = useRef<(() => void) | undefined>(undefined);
  const writeLocked = useRef(false);
  const refreshMainLineIds = useRef<readonly string[]>([]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function refreshRelated(mainLineIds: readonly string[]) {
    const results = await Promise.allSettled([
      syncKnowledgeSubBasketMargins(client, mainLineIds, basketId),
      client.invalidateQueries({ queryKey: signatureKey, predicate: (query) => query.queryKey.length > signatureKey.length }, { throwOnError: true })
    ]);
    return results.every((result) => result.status === "fulfilled" && result.value !== false);
  }

  const mutation = useMutation({
    mutationFn: async ({ mode, versionToken }: { mode: KnowledgeSubBasketMarginMode; versionToken: string }) => {
      const result = await applyKnowledgeSubBasketMargins(basketId, subBasketId, { mode, versionToken });
      if (result.summary.basketId !== basketId || result.summary.subBasketId !== subBasketId) throw new Error("The saved margin comparison could not be verified. Refresh before continuing.");
      return result;
    },
    onSuccess: async (result, { mode }) => {
      await client.cancelQueries({ queryKey: signatureKey, exact: true });
      client.setQueryData(signatureKey, result.summary);
      refreshMainLineIds.current = result.updatedMainLineIds;
      const refreshed = await refreshRelated(result.updatedMainLineIds);
      if (!mounted.current) return;
      setRefreshWarning(!refreshed);
      setAnnouncement(`Signature ${LABELS[mode]} default applied to ${result.updatedMainLineIds.length} main ${result.updatedMainLineIds.length === 1 ? "line" : "lines"}.`);
      if (refreshed) closeAfterRestore.current?.();
    },
    onError: () => { if (mounted.current) setNeedsReview(true); },
    onSettled: () => { writeLocked.current = false; }
  });
  const selectedQuery = selected ? queries[KNOWLEDGE_MODE_TIERS.indexOf(selected.tier)] : undefined;
  const summary = selectedQuery?.data;
  const mode = selected ? summary?.modes[selected.mode] : undefined;
  const signatureSelected = selected?.tier === "signature";
  const busy = mutation.isPending;

  async function refresh(tier: KnowledgeModeTier) {
    const result = await queries[KNOWLEDGE_MODE_TIERS.indexOf(tier)].refetch();
    if (mounted.current && result.isSuccess && tier === "signature") { setNeedsReview(false); mutation.reset(); }
  }

  function apply() {
    if (!selected?.allowRestore || !signatureSelected || !summary || !mode?.canApply || !mode.mismatchCount || readOnly || busy || writeLocked.current || selectedQuery?.isFetching || selectedQuery?.isError || needsReview) return;
    writeLocked.current = true;
    mutation.mutate({ mode: selected.mode, versionToken: summary.versionToken });
  }

  return <div className="knowledge-sub-margins">
    <KnowledgeMarginMatrix basketId={basketId} subBasketId={subBasketId} name={subBasketName}
      enabled={enabled} readOnly={readOnly}
      onCompare={(tier, allowRestore, onRestored) => {
        closeAfterRestore.current = onRestored;
        setSelected({ tier, mode: "pmc", allowRestore });
        if (!needsReview) mutation.reset();
      }}
      onLeaveComparison={() => setSelected(null)}
      comparison={selected ? {
        title: `${KNOWLEDGE_MODE_TIER_LABELS[selected.tier]} ${LABELS[selected.mode]} margins`,
        busy,
        action: signatureSelected && !readOnly && mode && mode.mismatchCount !== null && mode.mismatchCount > 0
          ? <Button busy={busy} disabled={!selected.allowRestore || !mode.canApply || selectedQuery?.isFetching || selectedQuery?.isError || needsReview || refreshWarning} onClick={apply}>
              Apply default to {mode.mismatchCount} main {mode.mismatchCount === 1 ? "line" : "lines"}
            </Button> : null,
        content: <div className="knowledge-sub-margins-panel__body">
          <div className="knowledge-sub-margins-panel__modes" role="group" aria-label={`${KNOWLEDGE_MODE_TIER_LABELS[selected.tier]} margin mode`}>
            {MODES.map((key) => <button key={key} type="button" disabled={busy} aria-pressed={selected.mode === key}
              onClick={() => setSelected({ ...selected, mode: key })}>{LABELS[key]}</button>)}
          </div>
          {selectedQuery?.isPending ? <p role="status">Loading {KNOWLEDGE_MODE_TIER_LABELS[selected.tier]} margins…</p> : null}
          {selectedQuery?.isError ? <InlineMessage tone="error" role="alert">Could not load {KNOWLEDGE_MODE_TIER_LABELS[selected.tier]} margins. <Button size="compact" variant="quiet" busy={selectedQuery.isFetching} onClick={() => void refresh(selected.tier)}>Retry {KNOWLEDGE_MODE_TIER_LABELS[selected.tier]} margins</Button></InlineMessage> : null}
          {summary && mode ? <>
            <section aria-label="Default margin source">
              <h3>{summary.ownedMargins ? "Sub-Basket default" : "Default from first main line"}</h3>
              {!summary.ownedMargins && <p>{summary.source?.mainLineName ?? "No main lines in this Sub-Basket."}</p>}
              <p className="knowledge-sub-margins-panel__legend">{selected.mode === "in_house" ? "Minimum / Starting gross margin" : "Minimum / Maximum margin"}</p>
              <MarginRanges ranges={mode.ranges} mode={selected.mode} />
              <p className="knowledge-sub-margins-panel__hint">Compared across all {summary.totalMainLines} main lines, including temporary items and other pages. Only saved, configured margins are compared. Archived items are excluded.{selected.mode === "in_house" ? " Components are matched by Main basket and Sub-basket." : ""}</p>
            </section>
            {mode.unavailableReason ? <InlineMessage tone="warning">{mode.unavailableReason}</InlineMessage> : null}
            {mode.mismatchCount === 0 ? <p>All configured margins match this default.</p> : null}
            {mode.mismatchCount !== null && mode.mismatches.length ? <section aria-label="Mismatched main lines">
              <h3>{mode.mismatchCount} mismatched main {mode.mismatchCount === 1 ? "line" : "lines"}</h3>
              <ul className="knowledge-sub-margins-panel__lines">{mode.mismatches.map((line) => <li key={line.mainLineId}>
                <strong>{line.mainLineName}</strong>
                <MarginRanges ranges={line.ranges} mode={selected.mode} />
                {line.blockedReason ? <p>{line.blockedReason}</p> : null}
              </li>)}</ul>
            </section> : null}
          </> : null}
          {readOnly ? <InlineMessage tone="info">You have read-only access to these margins.</InlineMessage> : null}
          {signatureSelected && !selected.allowRestore && !readOnly && <p>Finish editing tier defaults before applying a saved default.</p>}
          {signatureSelected && mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message} Refresh the comparison before applying again.</InlineMessage> : null}
          {signatureSelected && needsReview ? <Button variant="secondary" busy={selectedQuery?.isFetching} onClick={() => void refresh(selected.tier)}>Refresh comparison</Button> : null}
          {refreshWarning ? <InlineMessage tone="warning" role="status">Margins saved. Some related views could not refresh. <Button size="compact" variant="quiet" onClick={() => void refreshRelated(refreshMainLineIds.current).then((settled) => { if (mounted.current) setRefreshWarning(!settled); })}>Retry refresh</Button></InlineMessage> : null}
        </div>
      } : undefined} />
    <span className="sr-only" role={announcement ? "status" : undefined} aria-live="polite">{announcement}</span>
  </div>;
}
