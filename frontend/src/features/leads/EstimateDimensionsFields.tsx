import { useId } from "react";
import { calculateDimensionQuantity, type EstimateDimensionRule, type EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import "./estimateDimensions.css";

export const emptyEstimateDimensions = (): EstimateDimensions => ({ length: "", width: "", height: "" });

export function EstimateDimensionsFields({ label, dimensions, rule, quantityUnit, disabled = false, needsReview = false, onChange, onConfirm }: {
  label: string;
  dimensions: EstimateDimensions | undefined;
  rule: EstimateDimensionRule | null | undefined;
  quantityUnit: string;
  disabled?: boolean;
  needsReview?: boolean;
  onChange: (dimensions: EstimateDimensions) => void;
  onConfirm?: () => void;
}) {
  const id = useId();
  const values = dimensions ?? emptyEstimateDimensions();
  const calculated = calculateDimensionQuantity(rule, values);
  return <fieldset className="estimate-line-dimensions" disabled={disabled} aria-describedby={`${id}-help`}>
    <legend>Dimensions for {label}</legend>
    <div className="estimate-line-dimensions__fields">
      {(["length", "width", "height"] as const).map(field => <label key={field}>
        <span>{field[0]!.toUpperCase() + field.slice(1)}{rule ? ` (${rule.inputUnit})` : ""}</span>
        <input type="text" inputMode="decimal" value={values[field]} maxLength={32} required
          aria-label={`${field[0]!.toUpperCase() + field.slice(1)}${rule ? ` (${rule.inputUnit})` : ""} for ${label}`}
          onChange={event => onChange({ ...values, [field]: event.target.value })} />
      </label>)}
      <div><span>Calculated quantity ({quantityUnit})</span><output aria-label={`Calculated quantity for ${label}`}>{calculated && !needsReview ? calculated.quantity : "Pending"}</output></div>
    </div>
    <p id={`${id}-help`}>{rule ? "Enter positive length, width and height with up to 6 decimal places. Quantity = Length × Width. Height is recorded only." : "A matching area unit must be configured before dimensions can be saved."}</p>
    {needsReview ? <div className="estimate-line-dimensions__review"><p role="alert">The measurement rule changed. Review all dimensions in {rule?.inputUnit ?? "the configured unit"} before confirming.</p>
      {onConfirm ? <button type="button" disabled={disabled || !calculated} onClick={onConfirm}>Confirm dimensions for {label}</button> : null}</div> : null}
    {!disabled && rule && !calculated ? <p role="status">Complete valid dimensions before saving. The calculated quantity must fit the configured unit’s precision.</p> : null}
  </fieldset>;
}
