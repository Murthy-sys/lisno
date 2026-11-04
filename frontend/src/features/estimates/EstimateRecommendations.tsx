import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ESTIMATE_SELECTION_PAGE_SIZE, EstimateSelectionPagination, type EstimateSelectionState } from "./EstimateItemPicker";

export interface EstimateRecommendationItem {
  id: string;
  name: string;
  sourceNames: readonly string[];
  selected: boolean;
  disabled?: boolean;
  message?: string;
  addLabel?: string;
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
}

/** Receives only authorized non-negotiable suggestions, never unrestricted catalogue data. */
export function EstimateRecommendations({ roomName, contextKey, items, total, offset, onOffsetChange, state,
  disabled = false, message, onRetry, onAdd, onRemove }: EstimateRecommendationsProps) {
  const id = useId();
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<string | null>(null);
  useEffect(() => {
    if (state === "ready" && total > 0 && expandedContext !== contextKey) {
      setExpandedContext(contextKey); setOpen(true);
    }
  }, [state, total, expandedContext, contextKey]);
  useLayoutEffect(() => {
    const pending = focusAfterChange.current;
    if (pending === null) return;
    focusAfterChange.current = null;
    const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>("button[data-recommendation-item]") ?? []);
    (buttons.find(button => button.dataset.recommendationItem === pending && !button.disabled) ?? buttons.find(button => !button.disabled) ?? triggerRef.current)?.focus();
  });
  if (state === "ready" && total === 0 && !message) return null;
  const blocked = disabled || state !== "ready";
  return <section ref={sectionRef} className="estimate-selection estimate-selection--recommendations" aria-label={`Non-negotiable recommendations for ${roomName}`}>
    <div className="estimate-selection__heading">
      <button ref={triggerRef} type="button" className="estimate-selection__disclosure" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}>Non-negotiable recommendations{state === "ready" ? ` (${total})` : ""}</button>
    </div>
    {state === "loading" ? <p role="status">Checking non-negotiable recommendations…</p> : null}
    {state === "error" || state === "stale" || state === "forbidden" ? <p role="alert">{message ?? (state === "stale" ? "Configuration changed. Refresh recommendations." : state === "forbidden" ? "Recommendations are unavailable for this account." : "Recommendations could not be loaded.")}{onRetry ? <> <button type="button" onClick={onRetry}>Retry recommendations</button></> : null}</p> : null}
    {state === "ready" && message ? <p role="status">{message}</p> : null}
    <div id={id} hidden={!open} className="estimate-selection__body">
      <ul className="estimate-selection__list" aria-label="Recommended items" aria-busy={state === "loading"}>
        {items.slice(0, ESTIMATE_SELECTION_PAGE_SIZE).map(item => <li key={item.id}>
          <div className="estimate-selection__copy"><strong>{item.name}</strong>{item.sourceNames.length ? <span>For {item.sourceNames.join(", ")}</span> : null}{item.message ? <small>{item.message}</small> : null}</div>
          <button type="button" data-recommendation-item={item.id}
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
    </div>
    <span role="status" className="sr-only">{announcement}</span>
  </section>;
}
