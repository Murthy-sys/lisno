import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

import ceilingImage from "../../assets/project-card-default.jpg";
import interiorImage from "../../assets/projects-living-room.webp";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateClassification } from "./leadsApi";
import { configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredModeBaseRate, configuredQuantityUnits, estimatePricingModeLabels, parseSellingRate, type ConfiguredLineDraft } from "./configuredEstimate";
import { EstimatorRecommendations, type RecommendationReadState } from "./EstimatorRecommendations";
import type { RoomRecommendationView, RecommendedLineTarget } from "./roomRecommendations";

interface Room {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
}

type GlyphName = "search" | "refresh" | "section" | "basket" | "paint" | "room" | "chevron" | "more";

function BuilderGlyph({ name }: { name: GlyphName }) {
  const paths: Record<GlyphName, React.ReactNode> = {
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

export function ConfiguredEstimateBuilder({
  rooms, activeRoomId, onSelectRoom, catalogue, selectedMainBasketIds, mainBasketClassifications, lines,
  onUpdateLine, onRefreshAvailableItems, refreshingAvailableItems, roomTotal, moneyPaise, editable,
  recommendationSourceCount = 0, recommendationState = "ready", recommendationView = null,
  recommendationDialogOpen = false, automaticDismissal = false, skippedRecommendationKeys,
  onOpenRecommendations = () => {}, onCloseRecommendations = () => {},
  onRetryRecommendations = () => {}, onSelectRecommendedLine = () => false, onSkipRecommendedLine
}: {
  rooms: readonly Room[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  catalogue: EstimationCatalogue;
  selectedMainBasketIds: ReadonlySet<string>;
  mainBasketClassifications?: ReadonlyMap<string, EstimateClassification>;
  lines: readonly ConfiguredLineDraft[];
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  onRefreshAvailableItems: () => void;
  refreshingAvailableItems: boolean;
  roomTotal: (roomId: string) => number;
  roomIcons: Record<string, LucideIcon>;
  moneyPaise: (value: number) => string;
  editable: boolean;
  recommendationSourceCount?: number;
  recommendationState?: RecommendationReadState;
  recommendationView?: RoomRecommendationView | null;
  recommendationDialogOpen?: boolean;
  automaticDismissal?: boolean;
  skippedRecommendationKeys?: ReadonlySet<string>;
  onOpenRecommendations?: () => void;
  onCloseRecommendations?: () => void;
  onRetryRecommendations?: () => void;
  onSelectRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
  onSkipRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
}) {
  const [search, setSearch] = useState("");
  const recommendationFallbackFocusRef = useRef<HTMLInputElement>(null);
  const [basketFilter, setBasketFilter] = useState("all");
  const [railView, setRailView] = useState<"section" | "selected">("section");
  const selectedCount = lines.filter((line) => line.included).length;
  const visibleRooms = railView === "selected" ? rooms.filter((room) => lines.some((line) => line.roomId === room.id && line.included)) : rooms;
  const activeRoom = visibleRooms.find((room) => room.id === activeRoomId) ?? visibleRooms[0];
  useEffect(() => {
    if (activeRoom && activeRoom.id !== activeRoomId) onSelectRoom(activeRoom.id);
  }, [activeRoom?.id, activeRoomId, onSelectRoom]);
  const roomLines = lines.filter((line) => line.roomId === activeRoom?.id && (railView !== "selected" || line.included));
  const visibleBaskets = catalogue.items.filter((basket) => selectedMainBasketIds.has(basket.id) &&
    (railView !== "selected" || roomLines.some((line) => line.mainBasketId === basket.id && !line.sourceMissing)));
  const visibleBasketFilter = visibleBaskets.some((basket) => basket.id === basketFilter) ? basketFilter : "all";
  useEffect(() => {
    if (basketFilter !== visibleBasketFilter) setBasketFilter(visibleBasketFilter);
  }, [basketFilter, visibleBasketFilter]);
  const mainBasketRefs = useRef<Map<string, HTMLElement>>(new Map());
  const itemPaneRef = useRef<HTMLDivElement>(null);
  const basketJumpFrameRef = useRef<number | null>(null);
  const [collapsedBasketIds, setCollapsedBasketIds] = useState<Set<string>>(() => new Set());
  const [collapsedSubBasketIds, setCollapsedSubBasketIds] = useState<Set<string>>(() => new Set());
  const query = search.trim().toLocaleLowerCase();
  useEffect(() => {
    if (itemPaneRef.current) itemPaneRef.current.scrollTop = 0;
  }, [activeRoom?.id, query, visibleBasketFilter, railView]);
  useEffect(() => () => {
    if (basketJumpFrameRef.current !== null) window.cancelAnimationFrame(basketJumpFrameRef.current);
  }, []);
  const matches = (line: ConfiguredLineDraft) => !query || [line.mainLineName, line.mainBasketName, line.subBasketName, line.uomName]
    .some((value) => value?.toLocaleLowerCase().includes(query));
  const subtotalLabel = (matchingLines: readonly ConfiguredLineDraft[]) => matchingLines.some((line) => configuredLineAmountPaise(line) === null)
    ? "Incomplete"
    : moneyPaise(matchingLines.reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0));
  const roomAmountLabel = (roomId: string) => lines.some((line) => line.roomId === roomId && configuredLineAmountPaise(line) === null)
    ? "Incomplete" : moneyPaise(roomTotal(roomId));
  const catalogueGroups = (activeRoom ? visibleBaskets : [])
    .filter((basket) => visibleBasketFilter === "all" || visibleBasketFilter === basket.id)
    .map((basket) => {
      const directLines = roomLines.filter((line) => line.mainBasketId === basket.id && line.itemType === "temporary" && line.subBasketId === null && !line.sourceMissing);
      const subBaskets = basket.subBaskets.map((subBasket) => ({
        id: subBasket.id, name: subBasket.name,
        lines: roomLines.filter((line) => line.mainBasketId === basket.id && line.subBasketId === subBasket.id && !line.sourceMissing)
      }));
      const hasAvailableItems = directLines.length > 0 || subBaskets.some((subBasket) => subBasket.lines.length > 0);
      return { id: basket.id, name: basket.name,
        count: directLines.length + subBaskets.reduce((sum, subBasket) => sum + subBasket.lines.length, 0),
        directSubtotalLabel: subtotalLabel(directLines),
        directLines: directLines.filter(matches),
        subBaskets: (hasAvailableItems ? subBaskets.filter((subBasket) => subBasket.lines.length > 0) : subBaskets)
          .map((subBasket) => ({ ...subBasket, lines: subBasket.lines.filter(matches) }))
          .filter((subBasket) => !query || subBasket.lines.length > 0) };
    }).filter((basket) => !query || basket.directLines.length > 0 || basket.subBaskets.length > 0);
  const unselected = roomLines.filter((line) => line.persistedId && !selectedMainBasketIds.has(line.mainBasketId));
  const unavailableSaved = roomLines.filter((line) => line.persistedId && line.sourceMissing && selectedMainBasketIds.has(line.mainBasketId));
  const unavailableNew = roomLines.filter((line) => !line.persistedId && line.sourceMissing && selectedMainBasketIds.has(line.mainBasketId));
  const basketSubtotalLabel = (basketId: string) => subtotalLabel(roomLines.filter((line) => line.mainBasketId === basketId));
  const subBasketSubtotalLabel = (basketId: string, subBasketId: string) => subtotalLabel(roomLines
    .filter((line) => line.mainBasketId === basketId && line.subBasketId === subBasketId));
  const jumpToBasket = (basketId: string) => {
    if (search) setSearch("");
    if (basketFilter !== "all") setBasketFilter("all");
    setCollapsedBasketIds((current) => {
      if (!current.has(basketId)) return current;
      const next = new Set(current);
      next.delete(basketId);
      return next;
    });
    if (basketJumpFrameRef.current !== null) window.cancelAnimationFrame(basketJumpFrameRef.current);
    basketJumpFrameRef.current = window.requestAnimationFrame(() => {
      basketJumpFrameRef.current = null;
      const pane = itemPaneRef.current;
      const basket = mainBasketRefs.current.get(basketId);
      if (!pane || !basket) return;
      const top = Math.max(0, pane.scrollTop + basket.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientTop);
      pane.scrollTo?.({ top, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  };
  const toggleBasket = (basketId: string) => setCollapsedBasketIds((current) => {
    const next = new Set(current);
    if (next.has(basketId)) next.delete(basketId);
    else next.add(basketId);
    return next;
  });
  const toggleSubBasket = (id: string) => setCollapsedSubBasketIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectRecommendedLine = (target: RecommendedLineTarget) => {
    const accepted = onSelectRecommendedLine(target);
    if (accepted === false) return false;
    setSearch("");
    setBasketFilter("all");
    setCollapsedBasketIds((current) => {
      const next = new Set(current);
      next.delete(target.basketId);
      return next;
    });
    if (target.subBasketId) setCollapsedSubBasketIds((current) => {
      const next = new Set(current);
      next.delete(`${target.basketId}:${target.subBasketId}`);
      return next;
    });
    return accepted;
  };

  return <div className="configured-estimate-builder">
    <div className="configured-estimate-builder__toolbar">
      <label className="configured-estimate-builder__search"><BuilderGlyph name="search" /><span className="sr-only">Search estimate items</span><input ref={recommendationFallbackFocusRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items, materials, or keywords..." /></label>
      <label className="configured-estimate-builder__filter"><BuilderGlyph name="section" /><span className="sr-only">Filter Main Baskets</span><select value={visibleBasketFilter} onChange={(event) => setBasketFilter(event.target.value)}><option value="all">All Sections</option>{visibleBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select><BuilderGlyph name="chevron" /></label>
      <button type="button" className="configured-estimate-builder__refresh" aria-label="Refresh available items" disabled={refreshingAvailableItems} onClick={onRefreshAvailableItems}><BuilderGlyph name="refresh" />{refreshingAvailableItems ? "Refreshing…" : "Refresh items"}</button>
    </div>
    <div className="configured-estimate-builder__layout">
      <aside className="configured-estimate-builder__rail" aria-label="Estimate sections">
        <div className="configured-estimate-builder__rail-tabs" role="group" aria-label="Room view"><button type="button" aria-pressed={railView === "section"} onClick={() => setRailView("section")}>By Section</button><button type="button" aria-pressed={railView === "selected"} onClick={() => setRailView("selected")}>Selected ({selectedCount})</button></div>
        <nav aria-label="Rooms" className="configured-estimate-builder__rooms">{visibleRooms.map((room) => <button type="button" key={room.id} aria-current={room.id === activeRoom?.id ? "true" : undefined} onClick={() => onSelectRoom(room.id)}><span className="configured-estimate-builder__room-icon"><BuilderGlyph name="room" /></span><span className="configured-estimate-builder__room-copy"><strong>{room.label}</strong><small>{room.sqft} sqft · {roomAmountLabel(room.id)}</small></span><BuilderGlyph name="chevron" /></button>)}</nav>
        {!visibleRooms.length ? <p className="configured-estimate-builder__rail-empty">No selected items yet. Choose By Section to add items.</p> : null}
      </aside>
      <div className="configured-estimate-builder__content">
    <nav aria-label="Jump to Main Basket" className="configured-estimate-builder__jump">
      {visibleBaskets.map((basket) => <button type="button" key={basket.id} data-tone={/paint/i.test(basket.name) ? "paint" : "default"} onClick={() => jumpToBasket(basket.id)}><BuilderGlyph name={basketGlyph(basket.name)} /><span><strong>{basket.name}</strong><small>{itemCount(roomLines.filter((line) => line.mainBasketId === basket.id && !line.sourceMissing).length)} · {basketSubtotalLabel(basket.id)}</small></span></button>)}
      {unselected.length ? <button type="button" onClick={() => jumpToBasket("unselected-items")}>Unselected saved items</button> : null}
      {unavailableSaved.length ? <button type="button" onClick={() => jumpToBasket("saved-items")}>Saved items</button> : null}
      {unavailableNew.length ? <button type="button" onClick={() => jumpToBasket("unavailable-selections")}>Unavailable selections</button> : null}
    </nav>
      <div ref={itemPaneRef} className="configured-estimate-builder__scroll-pane" role="region" aria-label={`Estimate items${activeRoom ? ` for ${activeRoom.label}` : ""}`} tabIndex={0}>
      {refreshingAvailableItems ? <p role="status" className="configured-estimate-builder__status">Refreshing available items…</p> : null}
      {activeRoom ? <EstimatorRecommendations
        roomName={activeRoom.label} sourceCount={activeRoom.id === activeRoomId ? recommendationSourceCount : 0}
        state={recommendationState} view={recommendationView} editable={editable}
        open={recommendationDialogOpen} automaticDismissal={automaticDismissal}
        skippedKeys={skippedRecommendationKeys} onSkip={onSkipRecommendedLine}
        onOpen={onOpenRecommendations} onClose={onCloseRecommendations}
        fallbackFocusRef={recommendationFallbackFocusRef}
        onRetry={onRetryRecommendations} onRefresh={onRefreshAvailableItems} onSelect={selectRecommendedLine}
      /> : null}
      <div className="configured-estimate-builder__baskets">
        {catalogueGroups.map((basket) => <section
          key={basket.id}
          className="configured-estimate-basket"
          aria-label={basket.name}
          ref={(element) => { if (element) mainBasketRefs.current.set(basket.id, element); else mainBasketRefs.current.delete(basket.id); }}
        >
          <header><h2><button
            type="button"
            className="configured-estimate-basket__toggle"
            aria-label={`${collapsedBasketIds.has(basket.id) ? "Expand" : "Collapse"} ${basket.name}, subtotal ${basketSubtotalLabel(basket.id)}`}
            aria-expanded={!collapsedBasketIds.has(basket.id)}
            aria-controls={`configured-basket-${encodeURIComponent(basket.id)}`}
            onClick={() => toggleBasket(basket.id)}
          ><BuilderGlyph name={basketGlyph(basket.name)} /><span>{basket.name}</span><small>{itemCount(basket.count)}</small><strong>{basketSubtotalLabel(basket.id)}</strong><BuilderGlyph name="chevron" /></button></h2></header>
          <div id={`configured-basket-${encodeURIComponent(basket.id)}`} hidden={collapsedBasketIds.has(basket.id)}>
          {basket.directLines.length ? <section className="configured-estimate-sub-basket" aria-label={`Direct items in ${basket.name}`}>
            <div className="configured-estimate-sub-basket__heading"><BuilderGlyph name="section" /><h3>Direct items</h3><small>{itemCount(basket.directLines.length)}</small><strong>{basket.directSubtotalLabel}</strong></div>
            {basket.directLines.map((line) => <ConfiguredLineRow key={line.key} line={line} inheritedClassification={mainBasketClassifications?.get(line.mainBasketId)} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />)}
          </section> : null}
          {basket.subBaskets.map((subBasket) => { const subId = `${basket.id}:${subBasket.id}`; return <section className="configured-estimate-sub-basket" key={subBasket.id} aria-label={subBasket.name}>
            <h3><button type="button" className="configured-estimate-sub-basket__toggle" aria-expanded={!collapsedSubBasketIds.has(subId)} aria-controls={`configured-sub-basket-${encodeURIComponent(subId)}`} onClick={() => toggleSubBasket(subId)}><BuilderGlyph name="section" /><span>{subBasket.name}</span><small>{itemCount(subBasket.lines.length)}</small><strong>{subBasketSubtotalLabel(basket.id, subBasket.id)}</strong><BuilderGlyph name="chevron" /></button></h3>
            <div id={`configured-sub-basket-${encodeURIComponent(subId)}`} hidden={collapsedSubBasketIds.has(subId)}>{subBasket.lines.length ? subBasket.lines.map((line) => <ConfiguredLineRow key={line.key} line={line} inheritedClassification={mainBasketClassifications?.get(line.mainBasketId)} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />) : <p className="configured-estimate-sub-basket__empty">No available items in this Sub Basket.</p>}</div>
          </section>; })}
          {!basket.directLines.length && basket.subBaskets.every((subBasket) => !subBasket.lines.length) ? <div className="configured-estimate-basket__empty">
            <p>No available items in this Main Basket. Item availability depends on the information needed for estimating, including a valid UOM. Refresh to check for changes. You can still save this basket in a draft.</p>
            <button type="button" className="button button--secondary" disabled={refreshingAvailableItems} onClick={onRefreshAvailableItems}>Refresh available items</button>
          </div> : null}
          </div>
        </section>)}
        {unselected.length ? <section
          className="configured-estimate-basket"
          aria-label="Saved items from unselected Main Baskets"
          ref={(element) => { if (element) mainBasketRefs.current.set("unselected-items", element); else mainBasketRefs.current.delete("unselected-items"); }}
        >
          <header><h2>Unselected saved items</h2><span>Recheck the Main Basket to edit or include these items.</span></header>
          {unselected.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={false} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {unavailableSaved.length ? <section
          className="configured-estimate-basket"
          aria-label="Saved items unavailable in current Configuration"
          ref={(element) => { if (element) mainBasketRefs.current.set("saved-items", element); else mainBasketRefs.current.delete("saved-items"); }}
        >
          <header><h2>Saved items</h2><span>Unavailable in current Configuration</span></header>
          {unavailableSaved.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {unavailableNew.length ? <section
          className="configured-estimate-basket"
          aria-label="Unavailable new selections"
          ref={(element) => { if (element) mainBasketRefs.current.set("unavailable-selections", element); else mainBasketRefs.current.delete("unavailable-selections"); }}
        >
          <header><h2>Unavailable selections</h2><span>Refresh available items or uncheck these new lines before saving.</span></header>
          {unavailableNew.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {!catalogueGroups.length && !unselected.length && !unavailableSaved.length && !unavailableNew.length ? <p className="configured-estimate-builder__empty">{railView === "selected" && !activeRoom ? "No selected items yet. Choose By Section to add items." : !selectedMainBasketIds.size ? "Select a Main Basket to see its available items." : !activeRoom ? "Select a room to see its available items." : query ? `No items match “${search.trim()}”.` : "No items in this section."}</p> : null}
      </div>
      </div>
      </div>
    </div>
  </div>;
}

function ConfiguredLineRow({ line, inheritedClassification = "standard", editable, onUpdateLine, moneyPaise }: {
  line: ConfiguredLineDraft;
  inheritedClassification?: EstimateClassification;
  editable: boolean;
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  moneyPaise: (value: number) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) menuTriggerRef.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const trigger = menuTriggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const left = Math.max(viewportLeft + 8, Math.min(anchor.right - menu.offsetWidth, viewportRight - menu.offsetWidth - 8));
    const top = anchor.bottom + menu.offsetHeight + 4 <= viewportBottom - 8
      ? anchor.bottom + 4 : Math.max(viewportTop + 8, anchor.top - menu.offsetHeight - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const dismiss = () => setMenuOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) dismiss();
    };
    // The portal keeps a bottom-row menu outside the item pane's clipping boundary.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    viewport?.addEventListener("resize", dismiss);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      viewport?.removeEventListener("resize", dismiss);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);
  const rate = parseSellingRate(line.rateInput);
  const amount = configuredLinePreviewAmountPaise(line);
  const amountTooLarge = !line.uomNeedsQuantityReview && amount === null && rate.kind === "value"
    && configuredQuantityUnits(line.quantity, line.uomDecimalScale, true) !== null;
  const quantityInvalid = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included) === null;
  const rateRequired = line.included && rate.kind === "blank";
  const rateInvalid = rate.kind === "invalid";
  const label = `${line.mainBasketName}${line.subBasketName ? `, ${line.subBasketName}` : ""}, ${line.mainLineName} in ${line.roomName}`;
  const sourceStatus = line.persistedId ? line.sourceItemStatus : line.itemStatus;
  const inputId = `rate-${encodeURIComponent(line.key)}`;
  const classification = line.classification ?? inheritedClassification;
  const referenceMode = line.pricingMode ?? (classification !== "special" ? "sub_vendor" : undefined);
  const baseRate = referenceMode ? configuredModeBaseRate(line, referenceMode) : null;
  const step = 10 ** -line.uomDecimalScale;
  const changeQuantity = (direction: -1 | 1) => {
    const units = Math.round((Number.isFinite(line.quantity) ? line.quantity : 0) / step);
    const minimum = line.included ? 1 : 0;
    onUpdateLine(line.key, { quantity: Math.max(minimum, units + direction * 10 ** line.uomDecimalScale) * step });
  };
  return <div className={`configured-estimate-line${line.included ? " configured-estimate-line--included" : ""}`}>
    <label className="configured-estimate-line__choice">
      <span className="configured-estimate-line__thumb"><img src={/ceiling|cove|gypsum/i.test(line.mainLineName) ? ceilingImage : interiorImage} alt="" loading="lazy" /><input type="checkbox" checked={line.included} disabled={!editable} onChange={(event) => onUpdateLine(line.key, { included: event.target.checked })} /></span>
      <span className="configured-estimate-line__copy"><strong>{line.mainLineName}</strong><small>{line.uomName}</small>{sourceStatus === "draft" || sourceStatus === "inactive" ? <small className="configured-estimate-line__source">{sourceStatus === "draft" ? "Draft" : "Inactive"} source</small> : null}</span>
    </label>
    <div className="configured-estimate-line__fields">
      <label className="configured-estimate-line__quantity"><span>Quantity ({line.uomName})</span><span className="configured-estimate-line__stepper"><button type="button" aria-label={`Decrease quantity for ${label}`} disabled={!editable || !Number.isFinite(line.quantity) || line.quantity <= (line.included ? step : 0)} onClick={() => changeQuantity(-1)}>−</button><input type="number" min={line.included ? step : 0} step={step} value={Number.isFinite(line.quantity) ? line.quantity : ""} disabled={!editable} aria-label={`Quantity (${line.uomName}) for ${label}`} aria-invalid={quantityInvalid || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined} onChange={(event) => onUpdateLine(line.key, { quantity: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /><button type="button" aria-label={`Increase quantity for ${label}`} disabled={!editable} onClick={() => changeQuantity(1)}>+</button></span></label>
      <label className="configured-estimate-line__rate" htmlFor={inputId}><span aria-hidden="true">Price (₹/{line.uomName})</span><span className="sr-only">Selling rate (₹/{line.uomName}) for {label}</span><input id={inputId} type="text" inputMode="decimal" value={line.rateInput} disabled={!editable} aria-label={`Selling rate (₹/${line.uomName}) for ${label}`} aria-invalid={rateInvalid || rateRequired || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : rateInvalid || rateRequired ? `${inputId}-message` : undefined} onChange={(event) => onUpdateLine(line.key, { rateInput: event.target.value })} /></label>
      <div className="configured-estimate-line__amount"><span>Amount{line.included ? "" : " · Not included"}</span><output aria-label={line.included ? `Amount for ${label}` : `Preview amount for ${label}, not included in totals`} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined}>{amountTooLarge ? "Too large" : amount === null ? "Pending" : moneyPaise(amount)}</output></div>
      <div className="configured-estimate-line__more" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeMenu(true); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) closeMenu(); }}>
        <button ref={menuTriggerRef} type="button" aria-label={`More options for ${line.mainLineName}`} aria-expanded={menuOpen} aria-controls={menuOpen ? `${inputId}-options` : undefined} onClick={() => setMenuOpen((open) => !open)}><BuilderGlyph name="more" /></button>
        {menuOpen ? createPortal(<div ref={menuRef} id={`${inputId}-options`} className="configured-estimate-line__menu configured-estimate-line__menu--floating" role="group" aria-label={`Options for ${line.mainLineName}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== menuTriggerRef.current) closeMenu(); }} onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          if (event.shiftKey && event.target === actions[0]) { event.preventDefault(); closeMenu(true); }
          else if (!event.shiftKey && event.target === actions.at(-1)) { event.preventDefault(); closeMenu(true); }
        }}>
          <button type="button" disabled={!editable} onClick={() => { onUpdateLine(line.key, { included: !line.included }); closeMenu(true); }}>{line.included ? "Remove from estimate" : "Add to estimate"}</button>
          <button type="button" disabled={!editable} onClick={() => { onUpdateLine(line.key, { quantity: 1 }); closeMenu(true); }}>Reset quantity</button>
        </div>, document.body) : null}
      </div>
    </div>
    {line.included ? <div className="configured-estimate-line__options">
      {editable ? <fieldset className="estimate-classification configured-estimate-line__classification" aria-label={`Item type for ${label}`}>
        <legend>Item type</legend>
        {(["standard", "special"] as const).map((value) => <label key={value}><input type="radio" name={`line-classification-${line.key}`} value={value} checked={classification === value} aria-label={`${value === "standard" ? "Standard" : "Special"} item type for ${label}`} onChange={() => onUpdateLine(line.key, { classification: value })} /><span>{value === "standard" ? "Standard" : "Special"}</span></label>)}
      </fieldset> : <p className="configured-estimate-line__classification-readonly">Item type: <strong>{classification === "special" ? "Special" : "Standard"}</strong></p>}
      <div className="configured-estimate-line__pricing">
        {editable && classification === "special" ? <fieldset className="estimate-classification configured-estimate-line__modes" aria-label={`Pricing mode for ${label}`}>
          <legend>Pricing mode</legend>
          {(["pmc", "sub_vendor", "in_house"] as const).map((mode) => <label key={mode}><input type="radio" name={`line-pricing-mode-${line.key}`} value={mode} checked={line.pricingMode === mode} aria-label={`${estimatePricingModeLabels[mode]} pricing mode for ${label}`} onChange={() => onUpdateLine(line.key, { pricingMode: mode })} /><span>{estimatePricingModeLabels[mode]}</span></label>)}
        </fieldset> : <p>Pricing mode: <strong>{line.pricingMode ? estimatePricingModeLabels[line.pricingMode] : editable && referenceMode ? "Sub-Vendor (current base reference)" : "Not recorded"}</strong></p>}
        {editable ? <p className="configured-estimate-line__base" id={`${inputId}-base`}>
          {!referenceMode ? "Choose pricing mode" : baseRate === null ? "Base price not configured" : `Base price: ${moneyPaise(baseRate)} / ${line.uomName}`}
        </p> : null}
      </div>
    </div> : null}
    {rateRequired || rateInvalid ? <p id={`${inputId}-message`} className="configured-estimate-line__message">{rateRequired ? "Rate required" : "Enter a non-negative rate with up to two decimal places."}</p> : null}
    {quantityInvalid ? <p className="configured-estimate-line__message">Quantity must match {line.uomName} precision.</p> : null}
    {amountTooLarge ? <p id={`${inputId}-amount-overflow`} className="configured-estimate-line__message">Amount too large for this quantity and price.</p> : null}
    {line.uomNeedsQuantityReview && !line.sourceMissing ? <p className="configured-estimate-line__message" role="alert">Unit changed{line.previousUomName ? ` from ${line.previousUomName}` : ""} to {line.uomName}. Re-enter the quantity for this unit.</p> : null}
  </div>;
}
