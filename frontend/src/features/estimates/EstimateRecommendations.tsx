import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { ESTIMATE_SELECTION_PAGE_SIZE, EstimateSelectionPagination, type EstimateSelectionState } from "./EstimateItemPicker";
import "../../components/ui/dialog.css";

export interface EstimateRecommendationItem {
  id: string;
  name: string;
  context?: string;
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
export interface EstimateRecommendationCompletion {
  contextKey: string;
  selectedTargetIds: ReadonlySet<string>;
  /** Outstanding targets across the complete authorized list, before pagination. */
  remainingCount: number;
  blocked: boolean;
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
  /** Opt-in Sales feedback, scoped to a stable workspace/room rather than source-query changes. */
  selectionFeedback?: { contextKey: string };
  /** Sales popup opt-in; an accepted Add or probable-item Ignore must be acknowledged. */
  completion?: EstimateRecommendationCompletion;
  /** Optional recommendations are decisions; required-item selection is owned by the workspace. */
  mode?: "required" | "probable";
  ignoredTargetIds?: ReadonlySet<string>;
  onIgnore?: (id: string) => boolean | void;
  onReopen?: () => void;
}

/** Receives only authorized suggestions, never unrestricted catalogue data. */
export function EstimateRecommendations({ roomName, contextKey, items, total, offset, onOffsetChange, state,
  disabled = false, message, onRetry, onAdd, onRemove, popup, selectionFeedback, completion,
  mode = "required", ignoredTargetIds, onIgnore, onReopen }: EstimateRecommendationsProps) {
  const probable = mode === "probable";
  const title = probable ? "Probable items" : "Non-negotiable recommendations";
  const id = useId();
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<{ contextKey: string | undefined; completionContext?: string; text: string } | null>(null);
  const [closedReceiptContext, setClosedReceiptContext] = useState<string | null>(null);
  const feedbackContext = selectionFeedback?.contextKey;
  const completionContext = completion?.contextKey;
  const announcementText = announcement?.contextKey === feedbackContext && announcement?.completionContext === completionContext ? announcement?.text ?? "" : "";
  useEffect(() => { setAnnouncement(null); setClosedReceiptContext(null); }, [feedbackContext, completionContext]);
  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<{ id: string; feedback?: { contextKey: string; anchor: HTMLElement; needsReveal: boolean } } | null>(null);
  const pendingCompletion = useRef<{ contextKey: string; id: string; action: "add" | "ignore" } | null>(null);
  const visible = state !== "ready" || total > 0 || Boolean(message);
  const unresolved = probable ? completion?.remainingCount ?? items.filter(item => !item.selected && !ignoredTargetIds?.has(item.id)).length : total;
  const expanded = popup ? popup.open === true : open;
  const closePopup = () => {
    pendingCompletion.current = null;
    focusAfterChange.current = null;
    popup?.onOpenChange(false);
  };
  useLayoutEffect(() => {
    pendingCompletion.current = null;
    focusAfterChange.current = null;
  }, [completionContext]);
  useLayoutEffect(() => {
    const pending = pendingCompletion.current;
    if (!pending) return;
    if (!completion || !popup || !expanded || pending.contextKey !== completion.contextKey) {
      pendingCompletion.current = null;
      focusAfterChange.current = null;
      return;
    }
    // A ready response alone cannot acknowledge a selection or an Ignore decision.
    const acknowledged = pending.action === "ignore" ? ignoredTargetIds?.has(pending.id) : completion.selectedTargetIds.has(pending.id);
    if (!acknowledged || state !== "ready" || completion.blocked || disabled || message && !probable) return;
    pendingCompletion.current = null;
    if (completion.remainingCount === 0) {
      setClosedReceiptContext(completion.contextKey);
      closePopup();
    }
  });
  useEffect(() => {
    if (popup) {
      if (popup.open === undefined && state === "ready" && total > 0 && unresolved > 0) popup.onOpenChange(true);
      return;
    }
    if (state === "ready" && total > 0 && unresolved > 0 && expandedContext !== contextKey) {
      setExpandedContext(contextKey); setOpen(true);
    }
  }, [state, total, unresolved, expandedContext, contextKey, popup]);
  const feedbackEnabled = Boolean(selectionFeedback);
  useLayoutEffect(() => {
    if (!feedbackEnabled) return;
    const cancelMovedFocus = (event: FocusEvent) => {
      const pending = focusAfterChange.current;
      if (pending?.feedback && event.target !== pending.feedback.anchor) focusAfterChange.current = null;
    };
    const cancelPointerDeparture = (event: PointerEvent) => {
      const pending = focusAfterChange.current;
      if (pending?.feedback && event.target instanceof Node && !pending.feedback.anchor.contains(event.target)) {
        focusAfterChange.current = null;
        // Clicking plain text can blur to body without dispatching another focusin.
      }
    };
    document.addEventListener("focusin", cancelMovedFocus);
    document.addEventListener("pointerdown", cancelPointerDeparture, true);
    return () => {
      document.removeEventListener("focusin", cancelMovedFocus);
      document.removeEventListener("pointerdown", cancelPointerDeparture, true);
    };
  }, [feedbackEnabled]);
  useLayoutEffect(() => {
    const pending = focusAfterChange.current;
    if (pending === null) return;
    const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>("button[data-recommendation-item]") ?? []);
    const target = buttons.find(button => button.dataset.recommendationItem === pending.id && !button.disabled);
    const fallback = (popup ? closeRef.current : null) ?? triggerRef.current;
    if (!pending.feedback) {
      focusAfterChange.current = null;
      (target ?? buttons.find(button => !button.disabled) ?? fallback)?.focus({ preventScroll: true });
      return;
    }
    if (pending.feedback.contextKey !== feedbackContext || !visible || !expanded) {
      focusAfterChange.current = null;
      return;
    }
    const active = document.activeElement;
    if (active !== pending.feedback.anchor && active !== document.body) {
      focusAfterChange.current = null;
      return;
    }
    // A source refresh can remove the action until the authorized targets return.
    // Keep a safe control focused, but retain intent only while the user stays there.
    const next = state === "ready" ? target ?? fallback : fallback;
    if (state === "loading") pending.feedback.needsReveal = true;
    if (state !== "loading" && (state !== "ready" || !target)) focusAfterChange.current = null;
    if (next) {
      const reveal = pending.feedback.needsReveal || pending.feedback.anchor !== next;
      pending.feedback.anchor = next;
      next.focus({ preventScroll: true });
      if (popup && next === target && reveal) {
        const content = sectionRef.current?.querySelector<HTMLElement>(".estimate-recommendations-popup__content");
        if (content) {
          const viewport = content.getBoundingClientRect();
          const action = next.getBoundingClientRect();
          if (action.top < viewport.top) content.scrollTop += action.top - viewport.top;
          else if (action.bottom > viewport.bottom) content.scrollTop += action.bottom - viewport.bottom;
        }
      }
      if (next === target) pending.feedback.needsReveal = false;
    }
  });
  const receipt = selectionFeedback
    ? <p role="status" aria-live="polite" aria-atomic="true" className="estimate-selection__receipt">{announcementText}</p>
    : <span role="status" className="sr-only">{announcementText}</span>;
  const closedReceipt = completion && closedReceiptContext === completion.contextKey && announcementText ? receipt : null;
  if (!visible) return closedReceipt;
  const blocked = disabled || state !== "ready";
  const status = <>
    {state === "loading" ? <p role="status">{probable ? "Checking probable items…" : "Checking non-negotiable recommendations…"}</p> : null}
    {state === "error" || state === "stale" || state === "forbidden" ? <p role="alert">{message ?? (state === "stale" ? "Configuration changed. Refresh recommendations." : state === "forbidden" ? "Recommendations are unavailable for this account." : "Recommendations could not be loaded.")}{onRetry ? <> <button type="button" className={popup ? "ui-button ui-button--secondary" : undefined} onClick={onRetry}>Retry recommendations</button></> : null}</p> : null}
    {state === "ready" && message ? <p role="status">{message}{popup && onRetry ? <> <button type="button" className="ui-button ui-button--secondary" onClick={onRetry}>Refresh recommendations</button></> : null}</p> : null}
  </>;
  const body = <>
      {probable ? <p className="estimate-selection__add-guidance">Add includes this item in this room. Ignore leaves your estimate unchanged.</p>
        : selectionFeedback ? <p className="estimate-selection__add-guidance">Add selects this item for this room.</p> : null}
      <ul className="estimate-selection__list" aria-label="Recommended items" aria-busy={state === "loading"}>
        {items.slice(0, ESTIMATE_SELECTION_PAGE_SIZE).map(item => <li key={item.id}>
          <div className="estimate-selection__copy"><strong>{item.name}</strong>{selectionFeedback && item.context ? <span>{item.context}</span> : null}{item.sourceNames.length ? <span>For {item.sourceNames.join(", ")}</span> : null}{item.message ? <small>{item.message}</small> : null}</div>
          <div className="estimate-selection__recommendation-actions"><button type="button" data-recommendation-item={item.id}
            className={popup ? `ui-button ui-button--${item.selected ? "secondary" : "primary"}` : undefined}
            aria-label={`${item.selected ? probable ? "Added" : "Remove" : item.addLabel ?? "Add"} ${item.name}`}
            disabled={blocked || item.disabled || probable && item.selected} onClick={event => {
              // Remove and rejected changes must not finish an earlier accepted Add.
              pendingCompletion.current = null;
              setClosedReceiptContext(null);
              if ((item.selected ? onRemove : onAdd)(item.id) === false) {
                if (selectionFeedback) setAnnouncement({ contextKey: feedbackContext, completionContext,
                  text: `Could not ${item.selected ? "remove" : "add"} ${item.name} ${item.selected ? "from" : "to"} ${roomName}. Refresh available items and try again.` });
                return;
              }
              if (!item.selected && popup && completion && (!item.addLabel || item.addLabel === "Add")) {
                pendingCompletion.current = { contextKey: completion.contextKey, id: item.id, action: "add" };
              }
              focusAfterChange.current = selectionFeedback
                ? document.activeElement === event.currentTarget
                  ? { id: item.id, feedback: { contextKey: selectionFeedback.contextKey, anchor: event.currentTarget, needsReveal: true } }
                  : null
                : { id: item.id };
              const text = !item.selected && item.addLabel && item.addLabel !== "Add"
                ? `${item.addLabel}: ${item.name}.`
                : selectionFeedback && !item.selected
                  ? `Added 1 item: ${item.name} to ${roomName}.`
                  : `${item.name} ${item.selected ? "removed from" : "added to"} ${roomName}.`;
              setAnnouncement({ contextKey: feedbackContext, completionContext, text });
            }}>{item.selected ? probable ? "Added" : "Remove" : item.addLabel ?? "Add"}</button>
            {probable && !item.selected ? <button type="button" className={popup ? "ui-button ui-button--secondary" : undefined}
              aria-label={`${ignoredTargetIds?.has(item.id) ? "Ignored" : "Ignore"} ${item.name}`}
              disabled={blocked || ignoredTargetIds?.has(item.id) || !onIgnore}
              onClick={() => {
                pendingCompletion.current = null;
                focusAfterChange.current = null;
                setClosedReceiptContext(null);
                if (onIgnore?.(item.id) === false) return;
                focusAfterChange.current = { id: item.id };
                if (popup && completion) pendingCompletion.current = { contextKey: completion.contextKey, id: item.id, action: "ignore" };
                setAnnouncement({ contextKey: feedbackContext, completionContext, text: `Ignored ${item.name}. Your estimate is unchanged.` });
              }}>{ignoredTargetIds?.has(item.id) ? "Ignored" : "Ignore"}</button> : null}
          </div>
        </li>)}
      </ul>
      <EstimateSelectionPagination total={total} offset={offset} disabled={blocked} onChange={onOffsetChange} label="Recommendation pages" />
  </>;
  if (!popup) return <section ref={sectionRef} className="estimate-selection estimate-selection--recommendations" aria-label={`${title} for ${roomName}`}>
    <div className="estimate-selection__heading">
      <button ref={triggerRef} type="button" className="estimate-selection__disclosure" aria-expanded={open} aria-controls={id}
        onClick={() => { if (!open) onReopen?.(); setOpen(value => !value); }}>{title}{state === "ready" ? ` (${total})` : ""}</button>
    </div>
    {status}
    <div id={id} hidden={!open} className="estimate-selection__body">{body}</div>
    {receipt}
  </section>;
  const triggerStatus = state === "loading" ? "Checking…" : state === "error" ? "Could not load"
    : state === "stale" ? "Refresh needed" : state === "forbidden" ? "Unavailable" : message ? "Review needed" : null;
  return <>
    <button ref={triggerRef} type="button" className="estimate-recommendations-trigger ui-dialog--reference" aria-expanded={expanded} aria-haspopup="dialog"
      aria-controls={expanded ? id : undefined} onClick={() => {
        if (expanded) { closePopup(); return; }
        onReopen?.();
        popup.onOpenChange(true);
      }}>{probable ? "Probable items" : "Recommendations"}{state === "ready" ? ` (${total})` : ""}{triggerStatus ? <span>{triggerStatus}</span> : null}</button>
    {!expanded ? closedReceipt : null}
    {expanded ? <Dialog title={title} eyebrow="Estimation" description={roomName}
      className="estimate-recommendations-dialog" onClose={closePopup} closeButtonRef={closeRef}
      closeButtonLabel="Close recommendations" initialFocusRef={closeRef} returnFocusRef={triggerRef} fallbackFocusRef={popup.fallbackFocusRef}>
      <section id={id} ref={sectionRef} role="region" aria-label={`${title} for ${roomName}`}
        className="estimate-selection estimate-recommendations-popup">
        {selectionFeedback ? receipt : null}
        <div className="estimate-recommendations-popup__content">{status}{body}</div>
        {selectionFeedback ? null : receipt}
      </section>
    </Dialog> : null}
  </>;
}
