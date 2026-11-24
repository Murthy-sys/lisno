import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { estimatePricingModeLabels } from "../leads/configuredEstimate";
import type { EstimatePricingMode } from "../leads/leadsApi";

function PmcReasonButton({ label, reason }: { label: string; reason: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const name = `PMC information for ${label}`;

  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const button = trigger.current;
    const panel = popup.current;
    const position = () => {
      const anchor = button.getBoundingClientRect();
      const inset = 8;
      const below = anchor.bottom + 4;
      const top = below + panel.offsetHeight <= window.innerHeight - inset ? below : anchor.top - panel.offsetHeight - 4;
      panel.style.top = `${Math.max(inset, top)}px`;
      panel.style.left = `${Math.max(inset, Math.min(anchor.left, window.innerWidth - panel.offsetWidth - inset))}px`;
    };
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !button.contains(event.target) && !panel.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.focus({ preventScroll: true });
    };
    position();
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, reason]);

  return <>
    <button type="button" ref={trigger} className="estimate-tier-info-button" aria-label={name}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={open ? `${id}-message` : undefined}
      onClick={() => setOpen(value => !value)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.01" />
      </svg>
    </button>
    {open && createPortal(<div ref={popup} id={id} role="dialog" aria-label={name} className="configured-estimate-line__pmc-reason">
      <span id={`${id}-message`}>{reason}</span>
    </div>, document.body)}
  </>;
}

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
  const pmcOnly = variant === "pmc-only";
  const pricingClassName = `configured-estimate-line__pricing${editable ? " configured-estimate-line__pricing--editable" : ""}`;
  const pmcSwitch = <button type="button" role="switch" className="configured-estimate-line__pmc-switch"
    aria-label={`PMC pricing mode for ${label}`} aria-checked={mode === "pmc"} disabled={disabled || pmcOnly && !editable}
    aria-description={pmcOnly ? disabledReason : undefined}
    onClick={onTogglePmc}>
    <span>PMC</span><span className="configured-estimate-line__pmc-track" aria-hidden="true"><span /></span>
  </button>;
  if (pmcOnly) return <div className={`${pricingClassName} configured-estimate-line__pmc-controls`}>
    {pmcSwitch}
    {disabledReason ? <PmcReasonButton label={label} reason={disabledReason} /> : null}
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
