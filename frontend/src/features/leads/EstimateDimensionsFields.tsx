import { useId } from "react";
import { calculateDimensionQuantity, type EstimateDimensionRule, type EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import "./estimateDimensions.css";

export const emptyEstimateDimensions = (): EstimateDimensions => ({ length: "", width: "", height: "" });

export function EstimateDimensionsFields({ label, dimensions, rule, quantityUnit, disabled = false, needsReview = false, compact = false, onChange, onConfirm }: {
  label: string;
  dimensions: EstimateDimensions | undefined;
  rule: EstimateDimensionRule | null | undefined;
  quantityUnit: string;
  disabled?: boolean;
  needsReview?: boolean;
  compact?: boolean;
  onChange: (dimensions: EstimateDimensions) => void;
  onConfirm?: () => void;
}) {
  const id = useId();
  const values = dimensions ?? emptyEstimateDimensions();
  const calculated = calculateDimensionQuantity(rule, values);
  const help = !rule
    ? compact ? "Configure a matching area unit." : "A matching area unit must be configured before dimensions can be saved."
    : compact ? null : "Enter positive length, width and height with up to 6 decimal places. Quantity = Length × Width. Height is recorded only.";
  const invalid = !disabled && rule && !calculated && (!compact || !needsReview);
  const description = [help && `${id}-help`, compact && needsReview && `${id}-review`, compact && invalid && `${id}-invalid`].filter(Boolean).join(" ") || undefined;
  return <fieldset className={`estimate-line-dimensions${compact ? " estimate-line-dimensions--compact" : ""}`} disabled={disabled}
    aria-label={compact ? `Dimensions for ${label}` : undefined} aria-describedby={description}>
    <legend>{compact ? "Dimensions" : `Dimensions for ${label}`}</legend>
    <div className="estimate-line-dimensions__fields">
      {(["length", "width", "height"] as const).map(field => <label key={field}>
        <span>{field[0]!.toUpperCase() + field.slice(1)}{rule ? ` (${rule.inputUnit})` : ""}</span>
        <input type="text" inputMode="decimal" value={values[field]} maxLength={32} required
          aria-label={`${field[0]!.toUpperCase() + field.slice(1)}${rule ? ` (${rule.inputUnit})` : ""} for ${label}`}
          onChange={event => onChange({ ...values, [field]: event.target.value })} />
      </label>)}
      <div><span>{compact ? "Quantity" : "Calculated quantity"} ({quantityUnit})</span><output aria-label={`Calculated quantity for ${label}`}>{calculated && !needsReview ? calculated.quantity : "Pending"}</output></div>
    </div>
    {help ? <p id={`${id}-help`}>{help}</p> : null}
    {needsReview ? <div className="estimate-line-dimensions__review"><p id={`${id}-review`} role="alert">{compact
      ? `Measurement rule changed. Review dimensions${rule ? ` (${rule.inputUnit})` : ""}.`
      : `The measurement rule changed. Review all dimensions in ${rule?.inputUnit ?? "the configured unit"} before confirming.`}</p>
      {onConfirm ? <button type="button" aria-label={`Confirm dimensions for ${label}`} disabled={disabled || !calculated} onClick={onConfirm}>{compact ? "Confirm dimensions" : `Confirm dimensions for ${label}`}</button> : null}</div> : null}
    {invalid ? <p id={`${id}-invalid`} role="status">{compact ? "Enter valid dimensions." : "Complete valid dimensions before saving. The calculated quantity must fit the configured unit’s precision."}</p> : null}
  </fieldset>;
}
