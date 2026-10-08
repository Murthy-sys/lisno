import { useId, useRef, useState } from "react";

import { formatPaise } from "../finance/ProjectFinancePanel";
import { resolveMainBasketImage } from "../leads/mainBasketImages";
import type { ProcurementBasketModeGroup, ProcurementEstimateModeGroupKey, ProcurementModeBasketSubset, ProcurementModeGroupMetrics } from "./procurementBasketApi";
import "./procurementBasketModeGroups.css";

export const procurementEstimateModeLabels: Record<ProcurementEstimateModeGroupKey, string> = {
  in_house: "In-house", sub_vendor: "Sub-vendor", pmc: "PMC", unrecorded: "Mode not recorded"
};

const descriptions: Record<ProcurementEstimateModeGroupKey, string> = {
  in_house: "Selected as In-house in the approved estimate",
  sub_vendor: "Standard items and Special items selected as Sub-vendor",
  pmc: "Selected as PMC in the approved estimate",
  unrecorded: "Approved items without a reliable recorded estimate mode"
};

export interface ProcurementBasketViewState {
  search: string;
  mode: "all" | ProcurementEstimateModeGroupKey;
  readiness: "all" | "ready" | "attention";
  view: "grid" | "list";
  filtersOpen: boolean;
  expanded: Partial<Record<ProcurementEstimateModeGroupKey, boolean>>;
}

export const initialProcurementBasketView: ProcurementBasketViewState = {
  search: "", mode: "all", readiness: "all", view: "grid", filtersOpen: false, expanded: {}
};

function Symbol({ kind }: { kind: "search" | "filter" | "grid" | "list" | "chevron" | ProcurementEstimateModeGroupKey }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></> :
      kind === "filter" ? <path d="M3 4h18l-7 8v7l-4 2V12Z" /> :
      kind === "grid" ? <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></> :
      kind === "list" ? <><path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1" /></> :
      kind === "chevron" ? <path d="m9 5 7 7-7 7" /> :
      kind === "in_house" ? <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></> :
      kind === "sub_vendor" ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3" /></> :
      kind === "pmc" ? <><path d="M8 4H5v17h14V4h-3M8 10h8M8 14h8M8 18h5" /><rect x="8" y="2" width="8" height="4" /></> :
      <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>}
  </svg>;
}

function Cost({ metrics }: { metrics: ProcurementModeGroupMetrics }) {
  return <span className="procurement-mode__cost"><strong>{metrics.currentCostComplete && metrics.currentCostPaise !== null
    ? formatPaise(metrics.currentCostPaise) : "Incomplete"}</strong>
    {!metrics.currentCostComplete ? <small>{metrics.unpricedLineCount} unpriced line{metrics.unpricedLineCount === 1 ? "" : "s"}</small> : null}
  </span>;
}

function BasketCard({ basket, mode, onOpen }: { basket: ProcurementModeBasketSubset; mode: ProcurementEstimateModeGroupKey; onOpen: (id: string) => void }) {
  const photo = resolveMainBasketImage(basket.name);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return <button type="button" className="procurement-mode__card" onClick={() => onOpen(basket.id)} aria-label={`Open ${basket.name} in ${procurementEstimateModeLabels[mode]}`}>
    <span className="procurement-mode__thumbnail" aria-hidden="true">
      {photo && photo !== failedPhoto ? <img src={photo} alt="" width="112" height="128" loading="lazy" decoding="async" onError={() => setFailedPhoto(photo)} />
        : <span className="procurement-mode__photo-placeholder"><span /><span /><span /></span>}
    </span>
    <span className="procurement-mode__card-content">
      <span className="procurement-mode__card-heading"><strong>{basket.name}</strong><small>{basket.includedLineCount} included line{basket.includedLineCount === 1 ? "" : "s"}</small></span>
      <span className="procurement-mode__card-values"><span><small>Approved estimate</small><strong>{formatPaise(basket.approvedEstimatePaise)}</strong></span><span><small>Current cost</small><Cost metrics={basket} /></span></span>
      <span className="procurement-mode__card-foot">Committed net {formatPaise(basket.committedNetPaise)}
        {basket.modeIssueCount > 0 ? <span>{basket.modeIssueCount} mode issue{basket.modeIssueCount === 1 ? "" : "s"}</span> : null}
      </span>
    </span>
    <span className="procurement-mode__open"><Symbol kind="chevron" /></span>
  </button>;
}

function readyForBoq(basket: ProcurementModeBasketSubset) {
  return basket.includedLineCount > 0 && basket.boqReadyLineCount === basket.includedLineCount;
}

export function ProcurementBasketModeGroups({ groups, preferences, onPreferencesChange, onOpen }: {
  groups: ProcurementBasketModeGroup[];
  preferences: ProcurementBasketViewState;
  onPreferencesChange: (value: ProcurementBasketViewState) => void;
  onOpen: (id: string) => void;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const update = (value: Partial<ProcurementBasketViewState>) => onPreferencesChange({ ...preferences, ...value });
  const query = preferences.search.trim().toLocaleLowerCase();
  const filtersActive = preferences.mode !== "all" || preferences.readiness !== "all";
  const searching = query.length > 0 || filtersActive;
  const visibleGroups = groups.filter((group) => preferences.mode === "all" || preferences.mode === group.mode).map((group) => ({
    group, visible: group.baskets.filter((basket) => basket.name.toLocaleLowerCase().includes(query) &&
      (preferences.readiness === "all" || (preferences.readiness === "ready" ? readyForBoq(basket) : !readyForBoq(basket))))
  }));
  const noResults = searching && !visibleGroups.some(({ visible }) => visible.length > 0);
  const empty = groups.every((group) => group.baskets.length === 0);

  return <div className="procurement-mode">
    <div className="procurement-mode__toolbar">
      <div className="procurement-mode__intro"><h2>Main baskets</h2><p>Grouped by each item's approved estimate selection.</p></div>
      <div className="procurement-mode__controls">
        <div className="procurement-mode__search"><Symbol kind="search" /><input ref={searchRef} aria-label="Search baskets" type="search" placeholder="Search baskets…" value={preferences.search} onChange={(event) => update({ search: event.target.value })} />
          {preferences.search ? <button type="button" aria-label="Clear search" onClick={() => { update({ search: "" }); searchRef.current?.focus(); }}>×</button> : null}
        </div>
        <button type="button" className="procurement-mode__filter-toggle" aria-label="Filter" aria-expanded={preferences.filtersOpen} aria-controls={`${id}-filters`} onClick={() => update({ filtersOpen: !preferences.filtersOpen })}><Symbol kind="filter" />Filter{filtersActive ? <span className="procurement-mode__filter-active">Active</span> : null}</button>
        <div className="procurement-mode__view" role="group" aria-label="Basket view">
          <button type="button" aria-label="Grid view" aria-pressed={preferences.view === "grid"} onClick={() => update({ view: "grid" })}><Symbol kind="grid" /></button>
          <button type="button" aria-label="List view" aria-pressed={preferences.view === "list"} onClick={() => update({ view: "list" })}><Symbol kind="list" /></button>
        </div>
      </div>
    </div>
    <div id={`${id}-filters`} className="procurement-mode__filters" hidden={!preferences.filtersOpen}>
      <label>Pricing mode<select value={preferences.mode} onChange={(event) => update({ mode: event.target.value as ProcurementBasketViewState["mode"] })}><option value="all">All modes</option>{groups.map((group) => <option key={group.mode} value={group.mode}>{procurementEstimateModeLabels[group.mode]}</option>)}</select></label>
      <label>BOQ readiness<select value={preferences.readiness} onChange={(event) => update({ readiness: event.target.value as ProcurementBasketViewState["readiness"] })}><option value="all">All readiness states</option><option value="ready">Ready for BOQ</option><option value="attention">Needs attention</option></select></label>
      <button type="button" disabled={!filtersActive} onClick={() => update({ mode: "all", readiness: "all" })}>Reset filters</button>
    </div>
    <p className="procurement-mode__explanation">Current cost and BOQ readiness follow Procurement decisions. Opening a card shows all approved lines in that basket.</p>
    {empty ? <p className="procurement-mode__empty" role="status">No approved main baskets are available for this project.</p> : noResults ? <p className="procurement-mode__empty" role="status">No baskets match your search or filters.</p> : null}
    <div className={`procurement-mode__groups procurement-mode__groups--${preferences.view}`}>
      {visibleGroups.map(({ group, visible }) => {
        const label = procurementEstimateModeLabels[group.mode];
        const expanded = preferences.expanded[group.mode] ?? group.baskets.length > 0;
        return <section className={`procurement-mode__group procurement-mode__group--${group.mode}`} key={group.mode} aria-label={`${label} baskets`}>
          <h3 className="procurement-mode__group-heading"><button type="button" className="procurement-mode__group-toggle" aria-label={label} aria-expanded={expanded} aria-controls={`${id}-${group.mode}`} onClick={() => update({ expanded: { ...preferences.expanded, [group.mode]: !expanded } })}>
            <span className="procurement-mode__symbol"><Symbol kind={group.mode} /></span>
            <span className="procurement-mode__group-title"><span><strong>{label}</strong><small>{searching ? `${visible.length} of ${group.basketCount}` : group.basketCount} basket{group.basketCount === 1 ? "" : "s"}</small></span><span>{descriptions[group.mode]}</span></span>
            <span className="procurement-mode__group-money"><span><small>Approved estimate</small><strong>{formatPaise(group.approvedEstimatePaise)}</strong></span><span><small>Current cost</small><Cost metrics={group} /></span></span>
            <span className="procurement-mode__readiness"><span>Ready for BOQ {group.readinessPercent === null ? "" : `${group.readinessPercent}%`}</span>{group.readinessPercent !== null ? <progress aria-label={`${label} ready for BOQ`} max="100" value={group.readinessPercent} /> : <small>No included lines</small>}</span>
            <span className="procurement-mode__disclosure"><Symbol kind="chevron" /></span>
          </button></h3>
          <div id={`${id}-${group.mode}`} hidden={!expanded}>
            {visible.length ? <div className="procurement-mode__cards">{visible.map((basket) => <BasketCard key={`${group.mode}:${basket.id}`} basket={basket} mode={group.mode} onOpen={onOpen} />)}</div>
              : <p className="procurement-mode__group-empty">{group.baskets.length ? "No matching baskets in this mode." : "No items in this mode."}</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
