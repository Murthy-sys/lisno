import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { EstimateSelectionState } from "../estimates/EstimateItemPicker";
import type { RecommendedLineTarget } from "./roomRecommendations";

interface Choice {
  id: string;
  name: string;
  basketName: string;
  subBasketName: string;
  target: RecommendedLineTarget;
  selected: boolean;
  message?: string;
}

export function SalesEstimateItemPicker({ roomName, items, triggerRef, state, refreshing, onRetry, onAdd }: {
  roomName: string;
  items: readonly Choice[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  state: EstimateSelectionState;
  refreshing: boolean;
  onRetry: () => void;
  onAdd: (id: string) => boolean;
}) {
  const panelId = useId();
  const firstSelect = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [basket, setBasket] = useState("");
  const [group, setGroup] = useState<string | null | undefined>();
  const [line, setLine] = useState("");
  const [receipt, setReceipt] = useState("");
  const baskets = new Map(items.map(item => [item.target.basketId, item.basketName]));
  const basketItems = items.filter(item => item.target.basketId === basket);
  const groups = new Map(basketItems.map(item => [item.target.subBasketId, item.subBasketName]));
  const branches = basketItems.filter(item => item.target.subBasketId === group);
  const selection = branches.find(item => item.id === line);
  const blocked = refreshing || state !== "ready";
  const validBasket = baskets.has(basket);
  const validGroup = group !== undefined && groups.has(group);
  const groupValue = validGroup ? JSON.stringify(group) : "";

  useEffect(() => {
    if (!validBasket) setBasket("");
    if (!validGroup) setGroup(undefined);
    if (!selection) setLine("");
  }, [validBasket, validGroup, selection]);
  useEffect(() => { if (open) firstSelect.current?.focus(); }, [open]);

  function close() {
    setOpen(false);
    setBasket("");
    setGroup(undefined);
    setLine("");
    triggerRef.current?.focus();
  }

  return <section className="estimate-selection" aria-label={`Add items to ${roomName}`} onKeyDown={event => {
    if (open && event.key === "Escape") { event.stopPropagation(); close(); }
  }}>
    <div className="estimate-selection__heading">
      <button type="button" ref={triggerRef} aria-expanded={open} aria-controls={panelId} disabled={refreshing}
        onClick={() => { if (open) close(); else { setReceipt(""); setOpen(true); } }}>{open ? "Close item picker" : "Add items"}</button>
      {open && <span>{roomName}</span>}
    </div>
    {open && <div id={panelId} className="estimate-selection__body">
      <div className="estimate-selection__filters estimate-selection__sales-fields">
        <label>Main Basket<select ref={firstSelect} value={validBasket ? basket : ""} disabled={blocked || !baskets.size}
          onChange={event => { setBasket(event.target.value); setGroup(undefined); setLine(""); }}>
          <option value="">Choose Main Basket</option>
          {Array.from(baskets, ([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Sub Basket<select value={groupValue} disabled={blocked || !validBasket}
          onChange={event => { setGroup(event.target.value ? JSON.parse(event.target.value) as string | null : undefined); setLine(""); }}>
          <option value="">Choose Sub Basket</option>
          {Array.from(groups, ([id, name]) => <option key={JSON.stringify(id)} value={JSON.stringify(id)}>{name}</option>)}
        </select></label>
        <label>Main Line<select value={selection?.id ?? ""} disabled={blocked || !validGroup}
          onChange={event => setLine(event.target.value)}>
          <option value="">Choose Main Line</option>
          {branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <button type="button" disabled={blocked || !selection || selection.selected || Boolean(selection.message)}
          onClick={() => {
            if (selection && onAdd(selection.id)) { setReceipt(`${selection.name} added to ${roomName}.`); close(); }
          }}>Add</button>
      </div>
      {refreshing || state === "loading" ? <p role="status">Loading available items…</p> : null}
      {!refreshing && (state === "error" || state === "stale") && <p role="alert">{state === "stale" ? "Available items changed. Refresh before adding." : "Available items could not be loaded."} <button type="button" onClick={onRetry}>Retry items</button></p>}
      {!blocked && !items.length && <p role="status">No eligible items for this room.</p>}
      {!blocked && selection && (selection.selected || selection.message) && <p role="status">{selection.selected ? "This item is already included in this room." : selection.message}</p>}
    </div>}
    <span role="status" className="sr-only">{receipt}</span>
  </section>;
}
