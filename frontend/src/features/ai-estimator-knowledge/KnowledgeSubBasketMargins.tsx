import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginRange } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { applyKnowledgeSubBasketMargins, getKnowledgeSubBasketMargins } from "./knowledgeApi";
import { syncKnowledgeSubBasketMargins } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import "./knowledge-sub-basket-margins.css";

const MODES = ["pmc", "sub_vendor", "in_house"] as const;
const LABELS = { pmc: "PMC", sub_vendor: "Sub-vendor", in_house: "In-house" };
const percentage = (value: number | null) => value === null ? "Not configured" : `${value / 100}%`;

function MarginRanges({ ranges, mode, compact = false }: { ranges: readonly KnowledgeSubBasketMarginRange[]; mode: KnowledgeSubBasketMarginMode; compact?: boolean }) {
  if (compact && (!ranges.length || ranges.every((range) => range.minimumBps === null && range.maximumBps === null))) {
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

export function KnowledgeSubBasketMargins({ basketId, subBasketId, subBasketName, enabled, readOnly }: {
  readonly basketId: string;
  readonly subBasketId: string;
  readonly subBasketName: string;
  readonly enabled: boolean;
  readonly readOnly: boolean;
}) {
  const client = useQueryClient();
  const queryKey = knowledgeQueryKeys.subBasketMargins(basketId, subBasketId);
  const query = useQuery({ queryKey, queryFn: () => getKnowledgeSubBasketMargins(basketId, subBasketId), enabled });
  const [selected, setSelected] = useState<KnowledgeSubBasketMarginMode | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const writeLocked = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ mode, versionToken }: { mode: KnowledgeSubBasketMarginMode; versionToken: string }) =>
      applyKnowledgeSubBasketMargins(basketId, subBasketId, { mode, versionToken }),
    onSuccess: async (result, { mode }) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, result.summary);
      const refreshed = await syncKnowledgeSubBasketMargins(client, result.updatedMainLineIds);
      setRefreshWarning(!refreshed);
      setAnnouncement(`${LABELS[mode]} default applied to ${result.updatedMainLineIds.length} main ${result.updatedMainLineIds.length === 1 ? "line" : "lines"}.`);
      setSelected(null);
    },
    onError: () => setNeedsReview(true),
    onSettled: () => { writeLocked.current = false; }
  });
  const summary = query.data;
  const mode = selected ? summary?.modes[selected] : undefined;
  const busy = mutation.isPending;
  const unavailable = query.isPending || query.isError || !summary;

  async function refresh() {
    const result = await query.refetch();
    if (result.isSuccess) { setNeedsReview(false); mutation.reset(); }
  }

  function apply() {
    if (!selected || !summary || !mode?.canApply || !mode.mismatchCount || readOnly || busy || writeLocked.current || query.isFetching || query.isError || needsReview) return;
    writeLocked.current = true;
    mutation.mutate({ mode: selected, versionToken: summary.versionToken });
  }

  return <div className="knowledge-sub-margins">
    <span className="knowledge-sub-margins__eyebrow" aria-hidden="true">Default margins</span>
    <div className="knowledge-sub-margins__controls" role="group" aria-label={`Default margins for ${subBasketName}`} aria-busy={query.isFetching || busy}>
      {MODES.map((key) => {
        const state = summary?.modes[key];
        const mismatchCount = !unavailable && state?.mismatchCount ? state.mismatchCount : 0;
        return <button key={key} type="button" className="knowledge-sub-margins__control"
          disabled={unavailable || busy} data-mismatch={mismatchCount > 0 || undefined}
          aria-haspopup="dialog" aria-expanded={selected === key}
          title={key === "in_house" ? "View minimum and starting gross margins" : "View minimum and maximum margins"}
          aria-label={`${LABELS[key]} default margins for ${subBasketName}${mismatchCount > 0 ? `, ${mismatchCount} mismatched main lines` : ""}`}
          onClick={(event) => { returnFocusRef.current = event.currentTarget; setSelected(key); if (!needsReview) mutation.reset(); }}>
          <span className="knowledge-sub-margins__label">{LABELS[key]}
            <svg className="knowledge-sub-margins__chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" /></svg>
          </span>
          {unavailable ? <span className="knowledge-sub-margins__empty">{query.isError ? "Unavailable" : "Loading…"}</span>
            : <MarginRanges ranges={state!.ranges} mode={key} compact />}
          {mismatchCount > 0 ? <span className="knowledge-sub-margins__count">{mismatchCount} mismatched</span> : null}
        </button>;
      })}
    </div>
    {query.isError ? <div className="knowledge-sub-margins__feedback" role="alert">Could not load default margins. <Button size="compact" variant="quiet" busy={query.isFetching} onClick={() => void refresh()}>Retry margins</Button></div> : null}
    <span className="sr-only" role={announcement ? "status" : undefined} aria-live="polite">{announcement}</span>
    {refreshWarning ? <div className="knowledge-sub-margins__feedback" role="status">Margins saved. Some related views could not refresh. <Button size="compact" variant="quiet" onClick={() => void syncKnowledgeSubBasketMargins(client, mutation.data?.updatedMainLineIds ?? []).then(settled => setRefreshWarning(!settled))}>Retry refresh</Button></div> : null}
    {selected && summary && mode ? <ContextPanel title={`${LABELS[selected]} default margins`} eyebrow={subBasketName}
      description="Use the first main line's saved margins for mismatched main lines in this Sub-Basket."
      onClose={() => setSelected(null)} busy={busy} width="medium" returnFocusRef={returnFocusRef}
      className="knowledge-context-panel knowledge-sub-margins-panel"
      footer={({ requestClose }) => <div className="knowledge-dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={requestClose}>Close</Button>
        {!readOnly && mode.mismatchCount !== null && mode.mismatchCount > 0 ? <Button busy={busy} disabled={!mode.canApply || query.isFetching || query.isError || needsReview} onClick={apply}>
          Apply default to {mode.mismatchCount ?? 0} main {mode.mismatchCount === 1 ? "line" : "lines"}
        </Button> : null}
      </div>}>
      <div className="knowledge-sub-margins-panel__body">
        <section aria-label="Default margin source">
          <h3>Default from first main line</h3>
          <p>{summary.source?.mainLineName ?? "No main lines in this Sub-Basket."}</p>
          <p className="knowledge-sub-margins-panel__legend">{selected === "in_house" ? "Minimum / Starting gross margin" : "Minimum / Maximum margin"}</p>
          <MarginRanges ranges={mode.ranges} mode={selected} />
          <p className="knowledge-sub-margins-panel__hint">Compared across all {summary.totalMainLines} main lines, including temporary items and other pages. Only saved, configured margins are compared. Archived items are excluded.{selected === "in_house" ? " Components are matched by Main basket and Sub-basket." : ""}</p>
        </section>
        {readOnly ? <InlineMessage tone="info">You have read-only access to these margins.</InlineMessage> : null}
        {mode.unavailableReason ? <InlineMessage tone="warning">{mode.unavailableReason}</InlineMessage> : null}
        {mode.mismatchCount === 0 ? <p>All configured margins match this default.</p> : null}
        {mode.mismatchCount !== null && mode.mismatches.length ? <section aria-label="Mismatched main lines">
          <h3>{mode.mismatchCount} mismatched main {mode.mismatchCount === 1 ? "line" : "lines"}</h3>
          <ul className="knowledge-sub-margins-panel__lines">{mode.mismatches.map((line) => <li key={line.mainLineId}>
            <strong>{line.mainLineName}</strong>
            <MarginRanges ranges={line.ranges} mode={selected} />
            {line.blockedReason ? <p>{line.blockedReason}</p> : null}
          </li>)}</ul>
        </section> : null}
        {mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message} Refresh the comparison before applying again.</InlineMessage> : null}
        {query.isError && !mutation.error ? <InlineMessage tone="error" role="alert">The current margin comparison could not be loaded.</InlineMessage> : null}
        {needsReview || query.isError ? <Button variant="secondary" busy={query.isFetching} onClick={() => void refresh()}>Refresh comparison</Button> : null}
      </div>
    </ContextPanel> : null}
  </div>;
}
