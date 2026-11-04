import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import "./estimateSelection.css";

export const ESTIMATE_SELECTION_PAGE_SIZE = 20;
export type EstimateSelectionState = "ready" | "loading" | "error" | "stale";
export interface EstimatePickerItem {
  id: string;
  name: string;
  context?: string;
  selected?: boolean;
  disabled?: boolean;
  message?: string;
}
export interface EstimatePickerBasket {
  id: string;
  name: string;
  subBaskets?: readonly { id: string; name: string }[];
}
export interface EstimateItemPickerProps {
  roomName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  items: readonly EstimatePickerItem[];
  total: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  search: string;
  onSearchChange: (search: string) => void;
  baskets: readonly EstimatePickerBasket[];
  basketId: string;
  onBasketChange: (id: string) => void;
  subBasketId: string;
  onSubBasketChange: (id: string) => void;
  state: EstimateSelectionState;
  disabled?: boolean;
  message?: string;
  onRetry?: () => void;
  onAdd: (id: string) => boolean | void;
}

export function EstimateSelectionPagination({ total, offset, disabled, onChange, label }: {
  total: number; offset: number; disabled: boolean; onChange: (offset: number) => void; label: string;
}) {
  if (total <= ESTIMATE_SELECTION_PAGE_SIZE) return null;
  return <nav className="estimate-selection__pagination" aria-label={label}>
    <span>{Math.min(total, offset + 1)}–{Math.min(total, offset + ESTIMATE_SELECTION_PAGE_SIZE)} of {total}</span>
    <button type="button" disabled={disabled || offset <= 0} onClick={() => onChange(Math.max(0, offset - ESTIMATE_SELECTION_PAGE_SIZE))}>Previous</button>
    <button type="button" disabled={disabled || offset + ESTIMATE_SELECTION_PAGE_SIZE >= total} onClick={() => onChange(offset + ESTIMATE_SELECTION_PAGE_SIZE)}>Next</button>
  </nav>;
}

/** Adapters own catalogue authorization, filtering, pagination and draft mutations. */
export function EstimateItemPicker({ roomName, open, onOpenChange, triggerRef, items, total, offset,
  onOffsetChange, search, onSearchChange, baskets, basketId, onBasketChange, subBasketId, onSubBasketChange,
  state, disabled = false, message, onRetry, onAdd }: EstimateItemPickerProps) {
  const panelId = useId();
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterAdd = useRef<{ id: string; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const subBaskets = baskets.find(basket => basket.id === basketId)?.subBaskets ?? [];
  const blocked = disabled || state !== "ready";
  const page = items.slice(0, ESTIMATE_SELECTION_PAGE_SIZE);
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);
  useLayoutEffect(() => {
    const pending = focusAfterAdd.current;
    if (!pending) return;
    focusAfterAdd.current = null;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-picker-item]") ?? []);
    const same = buttons.find(button => button.dataset.pickerItem === pending.id && !button.disabled);
    (same ?? buttons.slice(pending.index).find(button => !button.disabled) ?? buttons.find(button => !button.disabled) ?? searchRef.current)?.focus();
  });
  const close = () => {
    onOpenChange(false);
    (triggerRef?.current ?? localTriggerRef.current)?.focus();
  };
  return <section className="estimate-selection" aria-label={`Add items to ${roomName}`} onKeyDown={event => {
    if (open && event.key === "Escape") { event.stopPropagation(); close(); }
  }}>
    <div className="estimate-selection__heading">
      <button ref={triggerRef ?? localTriggerRef} type="button" className="estimate-selection__trigger" aria-expanded={open}
        aria-controls={panelId} disabled={disabled} onClick={() => open ? close() : onOpenChange(true)}>{open ? "Close item picker" : "Add items"}</button>
      {open ? <span>{roomName}</span> : null}
    </div>
    {open ? <div id={panelId} className="estimate-selection__body">
      <div className="estimate-selection__filters">
        <label>Search available items<input ref={searchRef} type="search" value={search} disabled={disabled}
          placeholder="Find an item…" onChange={event => { onSearchChange(event.target.value); onOffsetChange(0); }} /></label>
        <label>Main Basket<select value={basketId} disabled={disabled} onChange={event => {
          onBasketChange(event.target.value); onSubBasketChange("all"); onOffsetChange(0);
        }}><option value="all">All selected baskets</option>{baskets.map(basket => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select></label>
        <label>Sub Basket<select value={subBasketId} disabled={disabled || !subBaskets.length} onChange={event => {
          onSubBasketChange(event.target.value); onOffsetChange(0);
        }}><option value="all">All sub baskets</option>{subBaskets.map(basket => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select></label>
      </div>
      {state === "loading" ? <p role="status">Loading available items…</p> : null}
      {state === "error" || state === "stale" ? <p role="alert">{message ?? (state === "stale" ? "Available items changed. Refresh before adding." : "Available items could not be loaded.")}{onRetry ? <> <button type="button" onClick={onRetry}>Retry items</button></> : null}</p> : null}
      {state === "ready" && message ? <p role="status">{message}</p> : null}
      {state === "ready" && !page.length ? <p>No matching items. Adjust your search or selected baskets.</p> : null}
      {page.length ? <ul ref={listRef} className="estimate-selection__list" aria-label="Available items" aria-busy={state === "loading"}>
        {page.map((item, index) => <li key={item.id}>
          <div className="estimate-selection__copy"><strong>{item.name}</strong>{item.context ? <span>{item.context}</span> : null}{item.message ? <small>{item.message}</small> : null}</div>
          <button type="button" data-picker-item={item.id} aria-label={`${item.selected ? "Added" : "Add"} ${item.name}`}
            disabled={blocked || item.disabled || item.selected} onClick={() => {
              if (onAdd(item.id) === false) return;
              focusAfterAdd.current = { id: item.id, index };
              setAnnouncement(`${item.name} added to ${roomName}.`);
            }}>{item.selected ? "Added" : "Add"}</button>
        </li>)}
      </ul> : null}
      <EstimateSelectionPagination total={total} offset={offset} disabled={blocked} onChange={onOffsetChange} label="Available item pages" />
    </div> : null}
    <span role="status" className="sr-only">{announcement}</span>
  </section>;
}
