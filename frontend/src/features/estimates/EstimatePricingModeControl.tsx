import { useId } from "react";
import { estimatePricingModeLabels } from "../leads/configuredEstimate";
import type { EstimatePricingMode } from "../leads/leadsApi";

/** Presentation only: the owning editor supplies permission and mode-change behavior. */
export function EstimatePricingModeControl({ mode, label, groupName, editable, disabled = false, variant = "full", disabledReason, onTogglePmc, onChange }: {
  mode: EstimatePricingMode | null | undefined;
  label: string;
  groupName: string;
  editable: boolean;
  disabled?: boolean;
  variant?: "full" | "pmc-only";
  disabledReason?: string;
  onTogglePmc: () => void;
  onChange: (mode: EstimatePricingMode) => void;
}) {
  const reasonId = useId();
  const pmcOnly = variant === "pmc-only";
  const pricingClassName = `configured-estimate-line__pricing${editable ? " configured-estimate-line__pricing--editable" : ""}`;
  const pmcSwitch = <button type="button" role="switch" className="configured-estimate-line__pmc-switch"
    aria-label={`PMC pricing mode for ${label}`} aria-checked={mode === "pmc"} disabled={disabled || pmcOnly && !editable}
    aria-describedby={pmcOnly && disabledReason ? reasonId : undefined} title={pmcOnly ? disabledReason : undefined}
    onClick={onTogglePmc}>
    <span>PMC</span><span className="configured-estimate-line__pmc-track" aria-hidden="true"><span /></span>
  </button>;
  if (pmcOnly) return <div className={pricingClassName}>
    {pmcSwitch}
    {disabledReason ? <span className="sr-only" id={reasonId}>{disabledReason}</span> : null}
  </div>;
  if (!editable && mode === "sub_vendor") return null;
  return <div className={pricingClassName}>
    {editable ? <fieldset className="estimate-classification configured-estimate-line__modes" aria-label={`Pricing mode for ${label}`} disabled={disabled}>
      <legend>Pricing</legend>
      <div className="configured-estimate-line__choices">
      {pmcSwitch}
      {mode !== "pmc" ? (["sub_vendor", "in_house"] as const).map(value => <label key={value}>
        <input type="radio" name={groupName} value={value} checked={mode === value} disabled={disabled}
          aria-label={`${estimatePricingModeLabels[value]} pricing mode for ${label}`} onChange={() => onChange(value)} />
        <span>{value === "sub_vendor" ? "Vendor" : estimatePricingModeLabels[value]}</span>
      </label>) : null}
      </div>
    </fieldset> : <div className="configured-estimate-line__readonly"><span>Pricing</span><strong>{mode ? mode === "sub_vendor" ? "Vendor" : estimatePricingModeLabels[mode] : "Not recorded"}</strong></div>}
  </div>;
}
