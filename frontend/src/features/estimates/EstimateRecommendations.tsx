import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { OverlayPortal } from "../../components/ui/overlay";
import { ESTIMATE_SELECTION_PAGE_SIZE, EstimateSelectionPagination, type EstimateSelectionState } from "./EstimateItemPicker";
import "../../components/ui/dialog.css";

export interface EstimateRecommendationItem {
  id: string;
  name: string;
  sourceNames: readonly string[];
  selected: boolean;
  disabled?: boolean;
  message?: string;
  addLabel?: string;
}
export interface EstimateRecommendationsPopup {
  /** Undefined identifies a room whose suggestions have not been opened or dismissed yet. */
  open: boolean | undefined;
  onOpenChange: (open: boolean) => void;
  toolbarRef: RefObject<HTMLDivElement | null>;
  footerRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLInputElement | null>;
}
export interface EstimateRecommendationsProps {
  roomName: string;
  contextKey: string;
  items: readonly EstimateRecommendationItem[];
  total: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  state: EstimateSelectionState | "forbidden";
  disabled?: boolean;
  message?: string;
  onRetry?: () => void;
  onAdd: (id: string) => boolean | void;
  onRemove: (id: string) => boolean | void;
  popup?: EstimateRecommendationsPopup;
}

/** Receives only authorized non-negotiable suggestions, never unrestricted catalogue data. */
export function EstimateRecommendations({ roomName, contextKey, items, total, offset, onOffsetChange, state,
  disabled = false, message, onRetry, onAdd, onRemove, popup }: EstimateRecommendationsProps) {
  const id = useId();
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  const ownsFocus = useRef(false);
  const focusAfterChange = useRef<string | null>(null);
  const visible = state !== "ready" || total > 0 || Boolean(message);
  const expanded = popup ? popup.open === true : open;
  const popupStyle = usePopupPosition(popup, visible && expanded);
  useEffect(() => {
    if (popup) {
      if (popup.open === undefined && state === "ready" && total > 0) popup.onOpenChange(true);
      return;
    }
    if (state === "ready" && total > 0 && expandedContext !== contextKey) {
      setExpandedContext(contextKey); setOpen(true);
    }
  }, [state, total, expandedContext, contextKey, popup]);
  useLayoutEffect(() => {
    if (popup && expanded && focusOnOpen.current && popupStyle.visibility !== "hidden" && Number(popupStyle.maxHeight) > 0) {
      focusOnOpen.current = false;
      closeRef.current?.focus({ preventScroll: true });
    }
  }, [popup, expanded, popupStyle]);
  const popupMode = Boolean(popup);
  const fallbackFocusRef = popup?.fallbackFocusRef;
  useLayoutEffect(() => {
    if (!popupMode || !visible) return;
    const trackFocus = () => {
      ownsFocus.current = Boolean(sectionRef.current?.contains(document.activeElement) || triggerRef.current === document.activeElement);
      if (!ownsFocus.current) focusOnOpen.current = false;
    };
    document.addEventListener("focusin", trackFocus);
    return () => {
      document.removeEventListener("focusin", trackFocus);
      if (!ownsFocus.current) return;
      // Unmounts can remove the focused action before React assigns the surviving refs.
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        const fallback = fallbackFocusRef?.current;
        if (fallback?.isConnected && !fallback.closest("[inert]")) fallback.focus({ preventScroll: true });
      });
    };
  }, [popupMode, visible, fallbackFocusRef]);
  useLayoutEffect(() => {
    const pending = focusAfterChange.current;
    if (pending === null) return;
    focusAfterChange.current = null;
    const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>("button[data-recommendation-item]") ?? []);
    (buttons.find(button => button.dataset.recommendationItem === pending && !button.disabled) ?? buttons.find(button => !button.disabled) ?? (popup ? closeRef.current : null) ?? triggerRef.current)?.focus({ preventScroll: true });
  });
  if (!visible) return null;
  const blocked = disabled || state !== "ready";
  const status = <>
    {state === "loading" ? <p role="status">Checking non-negotiable recommendations…</p> : null}
    {state === "error" || state === "stale" || state === "forbidden" ? <p role="alert">{message ?? (state === "stale" ? "Configuration changed. Refresh recommendations." : state === "forbidden" ? "Recommendations are unavailable for this account." : "Recommendations could not be loaded.")}{onRetry ? <> <button type="button" className={popup ? "ui-button ui-button--secondary" : undefined} onClick={onRetry}>Retry recommendations</button></> : null}</p> : null}
    {state === "ready" && message ? <p role="status">{message}{popup && onRetry ? <> <button type="button" className="ui-button ui-button--secondary" onClick={onRetry}>Refresh recommendations</button></> : null}</p> : null}
  </>;
  const body = <>
      <ul className="estimate-selection__list" aria-label="Recommended items" aria-busy={state === "loading"}>
        {items.slice(0, ESTIMATE_SELECTION_PAGE_SIZE).map(item => <li key={item.id}>
          <div className="estimate-selection__copy"><strong>{item.name}</strong>{item.sourceNames.length ? <span>For {item.sourceNames.join(", ")}</span> : null}{item.message ? <small>{item.message}</small> : null}</div>
          <button type="button" data-recommendation-item={item.id}
            className={popup ? `ui-button ui-button--${item.selected ? "secondary" : "primary"}` : undefined}
            aria-label={`${item.selected ? "Remove" : item.addLabel ?? "Add"} ${item.name}`}
            disabled={blocked || item.disabled} onClick={() => {
              if ((item.selected ? onRemove : onAdd)(item.id) === false) return;
              focusAfterChange.current = item.id;
              setAnnouncement(!item.selected && item.addLabel && item.addLabel !== "Add"
                ? `${item.addLabel}: ${item.name}.`
                : `${item.name} ${item.selected ? "removed from" : "added to"} ${roomName}.`);
            }}>{item.selected ? "Remove" : item.addLabel ?? "Add"}</button>
        </li>)}
      </ul>
      <EstimateSelectionPagination total={total} offset={offset} disabled={blocked} onChange={onOffsetChange} label="Recommendation pages" />
  </>;
  if (!popup) return <section ref={sectionRef} className="estimate-selection estimate-selection--recommendations" aria-label={`Non-negotiable recommendations for ${roomName}`}>
    <div className="estimate-selection__heading">
      <button ref={triggerRef} type="button" className="estimate-selection__disclosure" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}>Non-negotiable recommendations{state === "ready" ? ` (${total})` : ""}</button>
    </div>
    {status}
    <div id={id} hidden={!open} className="estimate-selection__body">{body}</div>
    <span role="status" className="sr-only">{announcement}</span>
  </section>;
  const closePopup = () => {
    popup.onOpenChange(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const triggerStatus = state === "loading" ? "Checking…" : state === "error" ? "Could not load"
    : state === "stale" ? "Refresh needed" : state === "forbidden" ? "Unavailable" : message ? "Review needed" : null;
  return <>
    <button ref={triggerRef} type="button" className="estimate-recommendations-trigger ui-dialog--reference" aria-expanded={expanded}
      aria-controls={expanded ? id : undefined} onClick={() => {
        if (expanded) { closePopup(); return; }
        focusOnOpen.current = true;
        popup.onOpenChange(true);
      }}>Recommendations{state === "ready" ? ` (${total})` : ""}{triggerStatus ? <span>{triggerStatus}</span> : null}</button>
    {expanded ? <OverlayPortal>
      <section id={id} ref={sectionRef} role="region" aria-label={`Non-negotiable recommendations for ${roomName}`}
        className="estimate-selection estimate-recommendations-popup ui-dialog--reference" style={popupStyle} onKeyDown={event => {
          if (event.key !== "Escape" || event.defaultPrevented || !sectionRef.current?.contains(document.activeElement)) return;
          event.preventDefault(); event.stopPropagation(); closePopup();
        }}>
        <header className="estimate-recommendations-popup__heading">
          <div><h2>Non-negotiable recommendations{state === "ready" ? ` (${total})` : ""}</h2><p>{roomName}</p></div>
          <button ref={closeRef} type="button" className="ui-button ui-button--secondary" aria-label="Close recommendations" onClick={closePopup}>Close</button>
        </header>
        <div className="estimate-recommendations-popup__content">{status}{body}</div>
        <span role="status" className="sr-only">{announcement}</span>
      </section>
    </OverlayPortal> : null}
  </>;
}

/** Measure the actual editor controls: the Save footer is normal flow on small screens. */
function usePopupPosition(popup: EstimateRecommendationsPopup | undefined, open: boolean) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const toolbarRef = popup?.toolbarRef;
  const footerRef = popup?.footerRef;
  useLayoutEffect(() => {
    if (!open || !toolbarRef) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      const footer = footerRef?.current?.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const margin = 8;
      const footerVisible = footer && footer.height > 0 && footer.top < viewportBottom && footer.bottom > viewportTop;
      const bottom = Math.min(viewportBottom - margin, footerVisible ? footer.top - margin : viewportBottom - margin);
      const top = Math.max(viewportTop + margin, (toolbar?.bottom ?? viewportTop) + margin);
      const width = Math.min(380, Math.max(0, viewportWidth - margin * 2));
      const right = Math.min(viewportLeft + viewportWidth - margin, toolbar?.width ? toolbar.right : viewportLeft + viewportWidth - margin);
      const next = { left: Math.max(viewportLeft + margin, right - width), top, width, maxHeight: Math.min(520, Math.max(0, bottom - top)) };
      setStyle(current => current.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight ? current : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    if (footerRef?.current) observer?.observe(footerRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [open, toolbarRef, footerRef]);
  return style;
}
