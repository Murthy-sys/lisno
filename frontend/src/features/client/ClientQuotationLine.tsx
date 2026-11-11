import { calculateDimensionQuantity } from "../../../../shared/estimation/estimateDimensions";
import { EstimateLineActions, EstimateLineChoice, EstimateLineLayout } from "../estimates/EstimateLineRow";
import { EstimateDimensionsFields } from "../leads/EstimateDimensionsFields";
import { EstimatePricingModeControl } from "../estimates/EstimatePricingModeControl";
import { quotationItemChoices, type QuotationItemDraft } from "./clientQuotationDraft";
import type { QuotationLine } from "./quotationApi";
import { hasGovernedInHousePrice, lineAggregatePrice } from "../estimates/estimateAggregatePresentation";

/** The shared Sales row, driven only by the scoped quotation response and commands. */
export function ClientQuotationLine({ item, currentLine, selected, disabled, grouped, canChangePricingMode, onTogglePmc, onChange, money }: {
  item: QuotationItemDraft;
  currentLine: QuotationLine;
  selected: boolean;
  disabled: boolean;
  grouped: boolean;
  canChangePricingMode: boolean;
  onTogglePmc: () => void;
  onChange: (update: Partial<QuotationItemDraft>) => void;
  money: (paise: number | null) => string;
}) {
  const line = item.line;
  const label = `${currentLine.mainLineName} in ${currentLine.roomName}`;
  const unavailable = !currentLine.source;
  const blocked = disabled || unavailable || grouped;
  const fieldsDisabled = blocked || !selected;
  const choices = quotationItemChoices({ ...item, line: { ...item.line, pricingMode: currentLine.pricingMode, choices: currentLine.choices, pricingModeChoices: currentLine.pricingModeChoices } });
  const choice = choices.find(option => option.modeTier === item.modeTier);
  const governed = hasGovernedInHousePrice(choice);
  const aggregate = choice ? lineAggregatePrice({ ...currentLine, pricingMode: item.pricingMode }, choice) : null;
  const components = governed ? undefined : choice?.inHouseComponents;
  const editableMode = canChangePricingMode && currentLine.classification === "special" &&
    Boolean(currentLine.pricingModeChoices?.length) && !unavailable;
  const modePricingUnavailable = Boolean(currentLine.pricingModeChoices?.length) && (!choice?.available || !choice.source);
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
    type={selected ? <div className="configured-estimate-line__readonly"><span>Type</span><strong>{currentLine.classification === "standard" ? "Standard" : currentLine.classification === "special" ? "Special" : "Not recorded"}</strong></div> : null}
    pricing={selected ? <EstimatePricingModeControl mode={item.pricingMode} label={label} groupName={`client-line-pricing-mode-${line.id}`}
      editable={editableMode} disabled={fieldsDisabled} onTogglePmc={onTogglePmc}
      onChange={pricingMode => onChange({ pricingMode, components: [] })} /> : null}
    fields={<>
      {line.dimensionsMandatory
        ? <div className="configured-estimate-line__quantity configured-estimate-line__quantity--calculated"><span>Qty ({line.uomName})</span><output aria-label={`Quantity for ${label} ${line.uomName}`}>{measured?.quantity ?? "Pending"}</output></div>
        : <label className="configured-estimate-line__quantity"><span>Qty ({line.uomName})</span><span className="configured-estimate-line__stepper">
          <button type="button" aria-label={`Decrease quantity for ${label}`} disabled={fieldsDisabled || !Number.isFinite(quantity) || quantity <= 1} onClick={() => changeQuantity(-1)}>−</button>
          <input aria-label={`Quantity for ${label} ${line.uomName}`} type="number" inputMode="decimal" min="0" step="any" value={item.quantity} disabled={fieldsDisabled} onChange={event => onChange({ quantity: event.target.value })} />
          <button type="button" aria-label={`Increase quantity for ${label}`} disabled={fieldsDisabled} onClick={() => changeQuantity(1)}>+</button>
        </span></label>}
      <div className="configured-estimate-line__rate client-quotation__price"><span>{governed ? "Price including margin" : `Rate (₹/${line.uomName})`}</span><output className={components ? "client-quotation__component-rate" : undefined} aria-label={`Configured price for ${label}`}>{governed ? money(aggregate?.totalPaise ?? null) : components ? "From components" : money(choice?.ratePaise ?? null)}</output></div>
      <div className="configured-estimate-line__amount"><span>{item.kind === "update" ? "Saved amount" : "Amount"}</span><output aria-label={`${item.kind === "update" ? "Saved amount" : "Amount"} for ${label}`}>{item.kind === "update" ? money(currentLine.amountPaise) : "After save"}</output></div>
      <EstimateLineActions name={label} disabled={blocked} included={selected} onToggle={() => onChange({ included: !selected })}
        {...(!line.dimensionsMandatory && selected ? { onResetQuantity: () => onChange({ quantity: "1" }) } : {})} />
    </>}>
    {unavailable ? <p className="configured-estimate-line__message" role="status">This saved item is unavailable in the current Configuration. Your team must review it before you can edit or remove it. Saved amounts are unchanged.</p> : null}
    {selected && line.dimensionsMandatory ? line.dimensionRule
      ? <EstimateDimensionsFields label={label} dimensions={item.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName} disabled={fieldsDisabled} onChange={dimensions => onChange({ dimensions })} />
      : <p className="configured-estimate-line__message" role="status">Dimensions are unavailable until your team reviews the configured unit.</p> : null}
    {selected ? <>
      {modePricingUnavailable ? <p className="configured-estimate-line__message" role="status">{choice?.unavailableReason ?? "Price is unavailable for the selected mode and tier. Review the available options before saving."}</p> : null}
      {governed && (quantity !== currentLine.quantity || item.modeTier !== currentLine.modeTier) ? <p className="configured-estimate-line__message">The combined price is calculated for the saved quantity. Save your changes to update the amount.</p> : null}
      {components ? <fieldset className="client-quotation__components" aria-label={`Components for ${label}`} disabled={fieldsDisabled}><legend>In-house components</legend>{components.map(component => <label key={component.id}>
        <input type="checkbox" checked={item.components.includes(component.id)} disabled={fieldsDisabled || !component.available && !item.components.includes(component.id)} onChange={event => onChange({ components: event.target.checked ? [...item.components, component.id] : item.components.filter(id => id !== component.id) })} />
        <span className="client-quotation__component-copy"><span>{component.label}</span>{!component.available ? <span className="client-quotation__component-status">(unavailable)</span> : null}</span>
      </label>)}</fieldset> : null}
    </> : <p className="configured-estimate-line__classification-readonly client-quotation__line-status">{grouped || item.included !== line.included ? "Removed when you save." : item.kind === "add" ? "Select this Main Line to add it to the room." : "Not included. Select it to restore the saved choices."}</p>}
  </EstimateLineLayout>;
}
