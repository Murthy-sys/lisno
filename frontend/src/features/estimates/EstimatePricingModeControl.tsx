import { estimatePricingModeLabels } from "../leads/configuredEstimate";
import type { EstimatePricingMode } from "../leads/leadsApi";

/** Presentation only: the owning editor supplies permission and mode-change behavior. */
export function EstimatePricingModeControl({ mode, label, groupName, editable, disabled = false, onTogglePmc, onChange }: {
  mode: EstimatePricingMode | null | undefined;
  label: string;
  groupName: string;
  editable: boolean;
  disabled?: boolean;
  onTogglePmc: () => void;
  onChange: (mode: EstimatePricingMode) => void;
}) {
  if (!editable && mode === "sub_vendor") return null;
  return <div className={`configured-estimate-line__pricing${editable ? " configured-estimate-line__pricing--editable" : ""}`}>
    {editable ? <fieldset className="estimate-classification configured-estimate-line__modes" aria-label={`Pricing mode for ${label}`} disabled={disabled}>
      <legend>Pricing</legend>
      <div className="configured-estimate-line__choices">
      <button type="button" role="switch" className="configured-estimate-line__pmc-switch"
        aria-label={`PMC pricing mode for ${label}`} aria-checked={mode === "pmc"} disabled={disabled}
        onClick={onTogglePmc}>
        <span>PMC</span><span className="configured-estimate-line__pmc-track" aria-hidden="true"><span /></span>
      </button>
      {mode !== "pmc" ? (["sub_vendor", "in_house"] as const).map(value => <label key={value}>
        <input type="radio" name={groupName} value={value} checked={mode === value} disabled={disabled}
          aria-label={`${estimatePricingModeLabels[value]} pricing mode for ${label}`} onChange={() => onChange(value)} />
        <span>{value === "sub_vendor" ? "Vendor" : estimatePricingModeLabels[value]}</span>
      </label>) : null}
      </div>
    </fieldset> : <div className="configured-estimate-line__readonly"><span>Pricing</span><strong>{mode ? mode === "sub_vendor" ? "Vendor" : estimatePricingModeLabels[mode] : "Not recorded"}</strong></div>}
  </div>;
}
