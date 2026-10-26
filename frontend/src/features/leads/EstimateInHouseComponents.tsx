import { configuredInHouseSelectionIssue, type ConfiguredLineDraft } from "./configuredEstimate";
import "./estimate-in-house-components.css";

export function EstimateInHouseComponents({ line, editable, onChange }: {
  readonly line: ConfiguredLineDraft;
  readonly editable: boolean;
  readonly onChange: (selected: string[]) => void;
}) {
  if (line.pricingMode !== "in_house" || line.inHouseComponents === undefined) return null;
  const selected = line.selectedInHouseComponentIds ?? [];
  const missing = selected.filter((id) => !line.inHouseComponents!.some((component) => component.id === id));
  const issue = configuredInHouseSelectionIssue(line);
  return <fieldset className="estimate-in-house-components" aria-label={`In-house components for ${line.mainLineName} in ${line.roomName}`}>
    <legend>In-house components</legend>
    <p>Choose the components included in this line.</p>
    {line.inHouseComponents.map((component) => <label key={component.id}>
      <input type="checkbox" checked={selected.includes(component.id)} disabled={!editable || Boolean(component.unavailableReason) && !selected.includes(component.id)}
        onChange={(event) => onChange(event.target.checked ? [...selected, component.id] : selected.filter((id) => id !== component.id))} />
      <span>{component.basketName} / {component.subBasketName ?? "Current In-house configuration"}
        <small>{component.unavailableReason ? "Unavailable; review the configuration" : component.baseRatePaise === null ? "Cost not configured" : `Base reference: ₹${(component.baseRatePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} / ${line.uomName}`}</small>
      </span>
    </label>)}
    {missing.map((id, index) => <label key={id}><input type="checkbox" checked disabled={!editable} onChange={() => onChange(selected.filter((current) => current !== id))} /><span>Unavailable selected component {index + 1}<small>Remove this selection and review the current components.</small></span></label>)}
    {!line.inHouseComponents.length ? <p>No components configured.</p> : null}
    {editable && issue ? <p className="configured-estimate-line__message">{issue}</p> : null}
  </fieldset>;
}
