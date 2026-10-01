import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

import type { EstimationCatalogue } from "./estimationCatalogueApi";
import { configuredLineAmountPaise, configuredQuantityUnits, parseSellingRate, type ConfiguredLineDraft } from "./configuredEstimate";
import { RoomSidebar } from "./RoomSidebar";

interface Room {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
}

export function ConfiguredEstimateBuilder({
  rooms, activeRoomId, onSelectRoom, catalogue, selectedMainBasketIds, lines,
  onUpdateLine, roomTotal, roomIcons, moneyPaise, editable
}: {
  rooms: readonly Room[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  catalogue: EstimationCatalogue;
  selectedMainBasketIds: ReadonlySet<string>;
  lines: readonly ConfiguredLineDraft[];
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  roomTotal: (roomId: string) => number;
  roomIcons: Record<string, LucideIcon>;
  moneyPaise: (value: number) => string;
  editable: boolean;
}) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0];
  const roomLines = lines.filter((line) => line.roomId === activeRoom?.id);
  const mainBasketRefs = useRef<Map<string, HTMLElement>>(new Map());
  const catalogueGroups = catalogue.items.filter((basket) => selectedMainBasketIds.has(basket.id))
    .map((basket) => ({
      id: basket.id, name: basket.name,
      subBaskets: basket.subBaskets.map((subBasket) => ({
        id: subBasket.id, name: subBasket.name,
        lines: roomLines.filter((line) => line.mainBasketId === basket.id && line.subBasketId === subBasket.id && !line.sourceMissing)
      }))
    }));
  const unavailable = roomLines.filter((line) => line.sourceMissing);
  const basketSubtotal = (basketId: string) => roomLines
    .filter((line) => line.mainBasketId === basketId)
    .reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0);
  const jumpToBasket = (basketId: string) => mainBasketRefs.current.get(basketId)?.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start"
  });

  return <div className="configured-estimate-builder">
    <nav aria-label="Jump to Main Basket" className="configured-estimate-builder__jump">
      {catalogueGroups.map((basket) => <button type="button" key={basket.id} onClick={() => jumpToBasket(basket.id)}>
        <span>{basket.name}</span><span>{moneyPaise(basketSubtotal(basket.id))}</span>
      </button>)}
      {unavailable.length ? <button type="button" onClick={() => jumpToBasket("saved-items")}>Saved items</button> : null}
    </nav>
    <div className="configured-estimate-builder__layout">
      <RoomSidebar
        rooms={rooms.map((room) => ({ ...room, total: roomTotal(room.id) }))}
        activeRoomId={activeRoomId}
        onSelect={onSelectRoom}
        icons={roomIcons}
        money={moneyPaise}
      />
      <div className="configured-estimate-builder__baskets">
        {catalogueGroups.map((basket) => <section
          key={basket.id}
          className="configured-estimate-basket"
          aria-label={basket.name}
          ref={(element) => { if (element) mainBasketRefs.current.set(basket.id, element); else mainBasketRefs.current.delete(basket.id); }}
        >
          <header><h2>{basket.name}</h2><strong>{moneyPaise(basketSubtotal(basket.id))}</strong></header>
          {basket.subBaskets.map((subBasket) => <section className="configured-estimate-sub-basket" key={subBasket.id} aria-label={subBasket.name}>
            <h3>{subBasket.name}</h3>
            {subBasket.lines.length ? subBasket.lines.map((line) => <ConfiguredLineRow key={line.key} line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />) : <p>No eligible Main Lines in this Sub Basket.</p>}
          </section>)}
          {!basket.subBaskets.length ? <p>No eligible Sub Baskets in this Main Basket.</p> : null}
        </section>)}
        {unavailable.length ? <section
          className="configured-estimate-basket"
          aria-label="Saved items unavailable in current Configuration"
          ref={(element) => { if (element) mainBasketRefs.current.set("saved-items", element); else mainBasketRefs.current.delete("saved-items"); }}
        >
          <header><h2>Saved items</h2><span>Unavailable in current Configuration</span></header>
          {unavailable.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.mainBasketName} / {line.subBasketName}</p>
            <ConfiguredLineRow line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {!catalogueGroups.length && !unavailable.length ? <p className="estimate-notice">Select a Main Basket to see its Sub Baskets and Main Lines.</p> : null}
      </div>
    </div>
  </div>;
}

function ConfiguredLineRow({ line, editable, onUpdateLine, moneyPaise }: {
  line: ConfiguredLineDraft;
  editable: boolean;
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  moneyPaise: (value: number) => string;
}) {
  const rate = parseSellingRate(line.rateInput);
  const amount = configuredLineAmountPaise(line);
  const quantityInvalid = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included) === null;
  const rateRequired = line.included && rate.kind === "blank";
  const rateInvalid = rate.kind === "invalid";
  const label = `${line.mainBasketName}, ${line.subBasketName}, ${line.mainLineName} in ${line.roomName}`;
  const inputId = `rate-${encodeURIComponent(line.key)}`;
  return <div className={`configured-estimate-line${line.included ? " configured-estimate-line--included" : ""}`}>
    <label className="configured-estimate-line__choice">
      <input type="checkbox" checked={line.included} disabled={!editable} onChange={(event) => onUpdateLine(line.key, { included: event.target.checked })} />
      <span><strong>{line.mainLineName}</strong><small>{line.uomName}</small></span>
    </label>
    <div className="configured-estimate-line__fields">
      <label>Quantity <span className="sr-only">for {label}</span>
        <input type="number" min="0" step={10 ** -line.uomDecimalScale} value={Number.isFinite(line.quantity) ? line.quantity : ""} disabled={!editable} aria-invalid={quantityInvalid} onChange={(event) => onUpdateLine(line.key, { quantity: event.target.value === "" ? Number.NaN : Number(event.target.value) })} />
      </label>
      <label htmlFor={inputId}>Selling rate (₹/{line.uomName}) <span className="sr-only">for {label}</span>
        <input id={inputId} type="text" inputMode="decimal" value={line.rateInput} disabled={!editable} aria-invalid={rateInvalid || rateRequired} aria-describedby={rateInvalid || rateRequired ? `${inputId}-message` : undefined} onChange={(event) => onUpdateLine(line.key, { rateInput: event.target.value })} />
      </label>
      <output aria-label={`Amount for ${label}`}>{amount === null ? "Incomplete" : moneyPaise(amount)}</output>
    </div>
    {rateRequired || rateInvalid ? <p id={`${inputId}-message`} className="configured-estimate-line__message">{rateRequired ? "Rate required" : "Enter a non-negative rate with up to two decimal places."}</p> : null}
    {quantityInvalid ? <p className="configured-estimate-line__message">Quantity must match {line.uomName} precision.</p> : null}
  </div>;
}
