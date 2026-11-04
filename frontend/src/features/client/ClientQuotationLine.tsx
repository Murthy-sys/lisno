import { calculateDimensionQuantity } from "../../../../shared/estimation/estimateDimensions";
import { KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { EstimateLineActions, EstimateLineChoice, EstimateLineLayout, EstimateLineTierOptions } from "../estimates/EstimateLineRow";
import { EstimateDimensionsFields } from "../leads/EstimateDimensionsFields";
import type { QuotationItemDraft } from "./clientQuotationDraft";
import type { QuotationLine } from "./quotationApi";

/** The shared Sales row, driven only by the scoped quotation response and commands. */
export function ClientQuotationLine({ item, currentLine, selected, disabled, grouped, onChange, money }: {
  item: QuotationItemDraft;
  currentLine: QuotationLine;
  selected: boolean;
  disabled: boolean;
  grouped: boolean;
  onChange: (update: Partial<QuotationItemDraft>) => void;
  money: (paise: number | null) => string;
}) {
  const line = item.line;
  const label = `${currentLine.mainLineName} in ${currentLine.roomName}`;
  const unavailable = !currentLine.source;
  const blocked = disabled || unavailable || grouped;
  const fieldsDisabled = blocked || !selected;
  const choice = line.choices.find(option => option.modeTier === item.modeTier);
  const quantity = Number(item.quantity);
  const measured = line.dimensionsMandatory ? calculateDimensionQuantity(line.dimensionRule, item.dimensions) : null;
  const changeQuantity = (direction: -1 | 1) => {
    if (fieldsDisabled) return;
    const next = (Number.isFinite(quantity) ? quantity : 0) + direction;
    // Keep the entered precision when stepping; binary rounding must not create an invalid quantity.
    const [coefficient, exponent = "0"] = quantity.toString().split("e");
    const precision = Math.max(0, (coefficient?.split(".")[1]?.length ?? 0) - Number(exponent));
    if (next > 0 && Number.isFinite(next)) onChange({ quantity: String(Number(next.toFixed(Math.min(100, precision)))) });
  };
  return <EstimateLineLayout included={selected} label={`${currentLine.mainLineName} ${currentLine.roomName}`} className="client-quotation__line"
    choice={<EstimateLineChoice name={currentLine.mainLineName} unit={line.uomName} included={selected} disabled={blocked}
      accessibleLabel={`Include ${label}`} onToggle={included => onChange({ included })} />}
    fields={<>
      {line.dimensionsMandatory
        ? <div className="configured-estimate-line__quantity configured-estimate-line__quantity--calculated"><span>Quantity ({line.uomName})</span><output aria-label={`Quantity for ${label} ${line.uomName}`}>{measured?.quantity ?? "Pending"}</output></div>
        : <label className="configured-estimate-line__quantity"><span>Quantity ({line.uomName})</span><span className="configured-estimate-line__stepper">
          <button type="button" aria-label={`Decrease quantity for ${label}`} disabled={fieldsDisabled || !Number.isFinite(quantity) || quantity <= 1} onClick={() => changeQuantity(-1)}>−</button>
          <input aria-label={`Quantity for ${label} ${line.uomName}`} type="number" inputMode="decimal" min="0" step="any" value={item.quantity} disabled={fieldsDisabled} onChange={event => onChange({ quantity: event.target.value })} />
          <button type="button" aria-label={`Increase quantity for ${label}`} disabled={fieldsDisabled} onClick={() => changeQuantity(1)}>+</button>
        </span></label>}
      <div className="configured-estimate-line__rate client-quotation__price"><span>Price (₹/{line.uomName})</span><output aria-label={`Configured price for ${label}`}>{choice?.inHouseComponents ? "From components" : money(choice?.ratePaise ?? null)}</output></div>
      <div className="configured-estimate-line__amount"><span>{item.kind === "update" ? "Saved amount" : "Amount"}</span><output aria-label={`${item.kind === "update" ? "Saved amount" : "Amount"} for ${label}`}>{item.kind === "update" ? money(currentLine.amountPaise) : "After save"}</output></div>
      <EstimateLineActions name={label} disabled={blocked} included={selected} onToggle={() => onChange({ included: !selected })}
        {...(!line.dimensionsMandatory && selected ? { onResetQuantity: () => onChange({ quantity: "1" }) } : {})} />
    </>}>
    {unavailable ? <p className="configured-estimate-line__message" role="status">This saved item is unavailable in the current Configuration. Your team must review it before you can edit or remove it. Saved amounts are unchanged.</p> : null}
    {selected && line.dimensionsMandatory ? line.dimensionRule
      ? <EstimateDimensionsFields label={label} dimensions={item.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName} disabled={fieldsDisabled} onChange={dimensions => onChange({ dimensions })} />
      : <p className="configured-estimate-line__message" role="status">Dimensions are unavailable until your team reviews the configured unit.</p> : null}
    {selected ? <div className="configured-estimate-line__options">
      <EstimateLineTierOptions label={label} groupName={`client-line-tier-${line.id}`} value={item.modeTier} disabled={fieldsDisabled}
        options={line.choices.map(option => ({ value: option.modeTier, label: KNOWLEDGE_MODE_TIER_LABELS[option.modeTier], disabledReason: option.available && option.source ? null : "Unavailable" }))}
        onChange={modeTier => onChange({ modeTier, components: [] })} />
      {choice?.inHouseComponents ? <fieldset className="client-quotation__components" disabled={fieldsDisabled}><legend>Components for {label}</legend>{choice.inHouseComponents.map(component => <label key={component.id}>
        <input type="checkbox" checked={item.components.includes(component.id)} disabled={fieldsDisabled || !component.available && !item.components.includes(component.id)} onChange={event => onChange({ components: event.target.checked ? [...item.components, component.id] : item.components.filter(id => id !== component.id) })} />{component.label}{!component.available ? " (unavailable)" : ""}
      </label>)}</fieldset> : null}
    </div> : <p className="configured-estimate-line__classification-readonly client-quotation__line-status">{grouped || item.included !== line.included ? "Removed when you save." : item.kind === "add" ? "Select this Main Line to add it to the room." : "Not included. Select it to restore the saved choices."}</p>}
  </EstimateLineLayout>;
}
