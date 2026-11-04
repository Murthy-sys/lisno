import { Fragment, useEffect, useRef, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { useConfiguredEstimateViewState, type ConfiguredEstimateViewState } from "../leads/useConfiguredEstimateViewState";

export interface EstimateShellRoom {
  id: string;
  label: string;
  detail?: string;
  hasSelectedItems: boolean;
}

export interface EstimateShellRemoval {
  label: string;
  disabled?: boolean;
  onRemove: () => void;
}

export interface EstimateShellSubBasket {
  id: string;
  name: string;
  count: number;
  subtotalLabel: string;
  lines: readonly { id: string }[];
  removal?: EstimateShellRemoval;
}

export interface EstimateShellBasket {
  id: string;
  name: string;
  count: number;
  subtotalLabel: string;
  directLines: readonly { id: string }[];
  directSubtotalLabel?: string;
  subBaskets: readonly EstimateShellSubBasket[];
}

export interface EstimateBuilderShellProps {
  rooms: readonly EstimateShellRoom[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  selectedCount: number;
  baskets: readonly { id: string; name: string; detail?: string }[];
  groups: readonly EstimateShellBasket[];
  renderLine: (id: string) => ReactNode;
  viewState: ConfiguredEstimateViewState;
  onViewStateChange: Dispatch<SetStateAction<ConfiguredEstimateViewState>>;
  onRefresh: () => void;
  refreshing: boolean;
  navigation?: ReactNode;
  beforeGroups?: ReactNode;
  afterGroups?: ReactNode;
  emptyMessage?: string;
  /** Embedded estimates follow normal page scrolling; dedicated editors keep their item pane. */
  scrollMode?: "pane" | "document";
  searchInputRef?: RefObject<HTMLInputElement | null>;
  /** Adapter-owned sections use data-estimate-jump-target with this stable ID. */
  extraJumpTargets?: readonly { id: string; label: string }[];
  renderEmptyBasket?: (basket: EstimateShellBasket) => ReactNode;
}

type GlyphName = "search" | "refresh" | "section" | "basket" | "paint" | "room" | "chevron" | "more";

export function EstimateBuilderGlyph({ name }: { name: GlyphName }) {
  const paths: Record<GlyphName, ReactNode> = {
    search: <><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M20 7.5A8 8 0 0 0 6.2 5L4 7.2M4 3.5v4h4M4 16.5A8 8 0 0 0 17.8 19l2.2-2.2M20 20.5v-4h-4" /></>,
    section: <><path d="m12 2 9 5-9 5-9-5 9-5ZM3 11l9 5 9-5M3 15l9 5 9-5" /></>,
    basket: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5M12 12v10" /></>,
    paint: <><path d="M3 5h14v6H3zM17 8h3v4h-8v8M12 20v2M6 8h8" /></>,
    room: <><path d="M3 14V9a2 2 0 0 1 2-2h1v7M18 14V7h1a2 2 0 0 1 2 2v5M3 14h18v5H3zM6 14v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M5 19v2m14-2v2" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const basketGlyph = (name: string): GlyphName => /paint/i.test(name) ? "paint" : "basket";
const itemCount = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

/** Presentation only: adapters supply authorized rows, amounts, and mutation callbacks. */
export function EstimateBuilderShell({ rooms, activeRoomId, onSelectRoom, selectedCount, baskets, groups, renderLine,
  viewState, onViewStateChange, onRefresh, refreshing, navigation, beforeGroups, afterGroups, emptyMessage,
  searchInputRef, extraJumpTargets = [], renderEmptyBasket, scrollMode = "pane" }: EstimateBuilderShellProps) {
  const { search, setSearch, basketFilter, setBasketFilter, railView, setRailView, collapsedBasketIds,
    setCollapsedBasketIds, collapsedSubBasketIds, setCollapsedSubBasketIds } = useConfiguredEstimateViewState(viewState, onViewStateChange);
  const visibleRooms = railView === "selected" ? rooms.filter(room => room.hasSelectedItems) : rooms;
  const activeRoom = visibleRooms.find(room => room.id === activeRoomId) ?? visibleRooms[0];
  const mainBasketRefs = useRef<Map<string, HTMLElement>>(new Map());
  const itemPaneRef = useRef<HTMLDivElement>(null);
  const basketJumpFrameRef = useRef<number | null>(null);
  const visibleBasketFilter = baskets.some(basket => basket.id === basketFilter) ? basketFilter : "all";
  const query = search.trim().toLocaleLowerCase();
  useEffect(() => {
    if (activeRoom && activeRoom.id !== activeRoomId) onSelectRoom(activeRoom.id);
  }, [activeRoom?.id, activeRoomId, onSelectRoom]);
  useEffect(() => {
    if (basketFilter !== visibleBasketFilter) setBasketFilter(visibleBasketFilter);
  }, [basketFilter, visibleBasketFilter]);
  useEffect(() => {
    if (itemPaneRef.current) itemPaneRef.current.scrollTop = 0;
  }, [activeRoom?.id, query, visibleBasketFilter, railView]);
  useEffect(() => () => {
    if (basketJumpFrameRef.current !== null) window.cancelAnimationFrame(basketJumpFrameRef.current);
  }, []);
  const jumpToBasket = (basketId: string) => {
    if (search) setSearch("");
    if (basketFilter !== "all") setBasketFilter("all");
    setCollapsedBasketIds(current => {
      if (!current.has(basketId)) return current;
      const next = new Set(current); next.delete(basketId); return next;
    });
    if (basketJumpFrameRef.current !== null) window.cancelAnimationFrame(basketJumpFrameRef.current);
    basketJumpFrameRef.current = window.requestAnimationFrame(() => {
      basketJumpFrameRef.current = null;
      const pane = itemPaneRef.current;
      const basket = mainBasketRefs.current.get(basketId) ?? Array.from(pane?.querySelectorAll<HTMLElement>("[data-estimate-jump-target]") ?? [])
        .find(element => element.dataset.estimateJumpTarget === basketId);
      if (!pane || !basket) return;
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
      if (scrollMode === "document") {
        basket.scrollIntoView?.({ block: "nearest", behavior });
        return;
      }
      const top = Math.max(0, pane.scrollTop + basket.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientTop);
      pane.scrollTo?.({ top, behavior });
    });
  };
  const toggleBasket = (id: string) => setCollapsedBasketIds(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const toggleSubBasket = (id: string) => setCollapsedSubBasketIds(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  return <div className="configured-estimate-builder">
    <div className="configured-estimate-builder__toolbar">
      <label className="configured-estimate-builder__search"><EstimateBuilderGlyph name="search" /><span className="sr-only">Search estimate items</span><input ref={searchInputRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search items, materials, or keywords..." /></label>
      <label className="configured-estimate-builder__filter"><EstimateBuilderGlyph name="section" /><span className="sr-only">Filter Main Baskets</span><select value={visibleBasketFilter} onChange={event => setBasketFilter(event.target.value)}><option value="all">All Sections</option>{baskets.map(basket => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select><EstimateBuilderGlyph name="chevron" /></label>
      <button type="button" className="configured-estimate-builder__refresh" aria-label="Refresh available items" disabled={refreshing} onClick={onRefresh}><EstimateBuilderGlyph name="refresh" />{refreshing ? "Refreshing…" : "Refresh items"}</button>
    </div>
    <div className="configured-estimate-builder__layout">
      <aside className="configured-estimate-builder__rail" aria-label="Estimate sections">
        {navigation}
        <div className="configured-estimate-builder__rail-tabs" role="group" aria-label="Room view"><button type="button" aria-pressed={railView === "section"} onClick={() => setRailView("section")}>By Section</button><button type="button" aria-pressed={railView === "selected"} onClick={() => setRailView("selected")}>Selected ({selectedCount})</button></div>
        <nav aria-label="Rooms" className="configured-estimate-builder__rooms">{visibleRooms.map(room => <button type="button" key={room.id} aria-current={room.id === activeRoom?.id ? "true" : undefined} onClick={() => onSelectRoom(room.id)}><span className="configured-estimate-builder__room-icon"><EstimateBuilderGlyph name="room" /></span><span className="configured-estimate-builder__room-copy"><strong>{room.label}</strong>{room.detail ? <small>{room.detail}</small> : null}</span><EstimateBuilderGlyph name="chevron" /></button>)}</nav>
        {!visibleRooms.length ? <p className="configured-estimate-builder__rail-empty">No selected items yet. Choose By Section to add items.</p> : null}
      </aside>
      <div className="configured-estimate-builder__content">
        <nav aria-label="Jump to Main Basket" className="configured-estimate-builder__jump">
          {baskets.map(basket => <button type="button" key={basket.id} data-tone={/paint/i.test(basket.name) ? "paint" : "default"} onClick={() => jumpToBasket(basket.id)}><EstimateBuilderGlyph name={basketGlyph(basket.name)} /><span><strong>{basket.name}</strong>{basket.detail ? <small>{basket.detail}</small> : null}</span></button>)}
          {extraJumpTargets.map(target => <button type="button" key={target.id} onClick={() => jumpToBasket(target.id)}>{target.label}</button>)}
        </nav>
        <div ref={itemPaneRef} className="configured-estimate-builder__scroll-pane" role="region" aria-label={`Estimate items${activeRoom ? ` for ${activeRoom.label}` : ""}`} tabIndex={0}>
          {refreshing ? <p role="status" className="configured-estimate-builder__status">Refreshing available items…</p> : null}
          {beforeGroups}
          <div className="configured-estimate-builder__baskets">
            {groups.map(basket => <section key={basket.id} className="configured-estimate-basket" aria-label={basket.name}
              ref={element => { if (element) mainBasketRefs.current.set(basket.id, element); else mainBasketRefs.current.delete(basket.id); }}>
              <header><h2><button type="button" className="configured-estimate-basket__toggle"
                aria-label={`${collapsedBasketIds.has(basket.id) ? "Expand" : "Collapse"} ${basket.name}, subtotal ${basket.subtotalLabel}`}
                aria-expanded={!collapsedBasketIds.has(basket.id)} aria-controls={`configured-basket-${encodeURIComponent(basket.id)}`} onClick={() => toggleBasket(basket.id)}>
                <EstimateBuilderGlyph name={basketGlyph(basket.name)} /><span>{basket.name}</span><small>{itemCount(basket.count)}</small><strong>{basket.subtotalLabel}</strong><EstimateBuilderGlyph name="chevron" />
              </button></h2></header>
              <div id={`configured-basket-${encodeURIComponent(basket.id)}`} hidden={collapsedBasketIds.has(basket.id)}>
                {basket.directLines.length ? <section className="configured-estimate-sub-basket" aria-label={`Direct items in ${basket.name}`}>
                  <div className="configured-estimate-sub-basket__heading"><EstimateBuilderGlyph name="section" /><h3>Direct items</h3><small>{itemCount(basket.directLines.length)}</small>{basket.directSubtotalLabel ? <strong>{basket.directSubtotalLabel}</strong> : null}</div>
                  {basket.directLines.map(line => <Fragment key={line.id}>{renderLine(line.id)}</Fragment>)}
                </section> : null}
                {basket.subBaskets.map(subBasket => {
                  const subId = `${basket.id}:${subBasket.id}`;
                  return <section className="configured-estimate-sub-basket" key={subBasket.id} aria-label={subBasket.name}>
                    <div className="configured-estimate-sub-basket__header"><h3><button type="button" className="configured-estimate-sub-basket__toggle" aria-expanded={!collapsedSubBasketIds.has(subId)} aria-controls={`configured-sub-basket-${encodeURIComponent(subId)}`} onClick={() => toggleSubBasket(subId)}>
                      <EstimateBuilderGlyph name="section" /><span>{subBasket.name}</span><small>{itemCount(subBasket.count)}</small><strong>{subBasket.subtotalLabel}</strong><EstimateBuilderGlyph name="chevron" />
                    </button></h3>{subBasket.removal ? <button type="button" className="button button--secondary configured-estimate-sub-basket__remove" aria-label={subBasket.removal.label} disabled={subBasket.removal.disabled} onClick={subBasket.removal.onRemove}>Remove Sub Basket</button> : null}</div>
                    <div id={`configured-sub-basket-${encodeURIComponent(subId)}`} hidden={collapsedSubBasketIds.has(subId)}>{subBasket.lines.length ? subBasket.lines.map(line => <Fragment key={line.id}>{renderLine(line.id)}</Fragment>) : <p className="configured-estimate-sub-basket__empty">No available items in this Sub Basket.</p>}</div>
                  </section>;
                })}
                {!basket.directLines.length && basket.subBaskets.every(subBasket => !subBasket.lines.length)
                  ? renderEmptyBasket?.(basket) ?? <p className="configured-estimate-basket__empty">No available items in this Main Basket.</p> : null}
              </div>
            </section>)}
            {afterGroups}
            {emptyMessage ? <p className="configured-estimate-builder__empty">{emptyMessage}</p> : null}
          </div>
        </div>
      </div>
    </div>
  </div>;
}
