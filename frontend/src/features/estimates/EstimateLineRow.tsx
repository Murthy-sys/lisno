import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import ceilingImage from "../../assets/main-baskets/pop-gypsum.webp";
import interiorImage from "../../assets/projects-living-room.webp";
import { EstimateBuilderGlyph } from "./EstimateBuilderShell";

/** Shared presentation only; each role supplies its permitted controls and values. */
export function EstimateLineLayout({ included, choice, tier, type, pricing, pricingBeforeTier = false, fields, children, className = "", label }: {
  included: boolean;
  choice: ReactNode;
  tier?: ReactNode;
  type?: ReactNode;
  pricing?: ReactNode;
  pricingBeforeTier?: boolean;
  fields: ReactNode;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const pricingGroup = pricing ? <div className="configured-estimate-line__group configured-estimate-line__pricing-group">{pricing}</div> : null;
  return <div className={`configured-estimate-line configured-estimate-line--reference${included ? " configured-estimate-line--included" : ""}${className ? ` ${className}` : ""}`}
    role={label ? "group" : undefined} aria-label={label}>
    <div className="configured-estimate-line__primary">
      {choice}
      {pricingBeforeTier ? pricingGroup : null}
      {tier ? <div className="configured-estimate-line__group configured-estimate-line__tier-group">{tier}</div> : null}
      {type ? <div className="configured-estimate-line__group configured-estimate-line__type-group">{type}</div> : null}
      {!pricingBeforeTier ? pricingGroup : null}
      <div className="configured-estimate-line__fields">{fields}</div>
    </div>
    <div className="configured-estimate-line__details">{children}</div>
  </div>;
}

export function EstimateLineChoice({ name, included, disabled, onToggle, accessibleLabel, children }: {
  name: string;
  unit: string;
  included: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  accessibleLabel?: string;
  children?: ReactNode;
}) {
  return <label className="configured-estimate-line__choice">
    <input className="configured-estimate-line__include" type="checkbox" checked={included} disabled={disabled}
      aria-label={accessibleLabel ?? `Include ${name}`} onChange={event => onToggle(event.target.checked)} />
    <span className="configured-estimate-line__thumb">
      <img src={/ceiling|cove|gypsum/i.test(name) ? ceilingImage : interiorImage} alt="" loading="lazy" />
    </span>
    <span className="configured-estimate-line__copy"><strong>{name}</strong>{children}</span>
  </label>;
}

export interface EstimateLineTierOption {
  value: KnowledgeModeTier;
  label: string;
  disabledReason?: string | null;
}

export function EstimateLineTierNotes({ options, id }: { options: readonly EstimateLineTierOption[]; id: string }) {
  const unavailable = options.filter(option => option.disabledReason);
  return unavailable.length ? <p id={id} className="sr-only">
    {unavailable.map(option => `${option.label}: ${option.disabledReason}`).join(" · ")}
  </p> : null;
}

export function EstimateLineTierOptions({ label, groupName, value, options, disabled = false, availabilityId, onChange }: {
  label: string;
  groupName: string;
  value: KnowledgeModeTier | null;
  options: readonly EstimateLineTierOption[];
  disabled?: boolean;
  availabilityId?: string;
  onChange: (value: KnowledgeModeTier) => void;
}) {
  return <fieldset className="estimate-classification configured-estimate-line__tiers" aria-label={`Configuration tier for ${label}`}
    aria-describedby={options.some(option => option.disabledReason) ? availabilityId : undefined} disabled={disabled}>
    <legend>Tier</legend>
    <div className="configured-estimate-line__choices">{options.map(option => <label key={option.value} title={option.disabledReason ?? undefined}>
      <input type="radio" name={groupName} checked={value === option.value} disabled={disabled || Boolean(option.disabledReason)}
        aria-label={`${option.label} tier for ${label}`} onChange={() => onChange(option.value)} />
      <span>{option.label}</span>
    </label>)}</div>
  </fieldset>;
}

export function EstimateLineActions({ name, disabled, included, onToggle, onResetQuantity }: {
  name: string;
  disabled: boolean;
  included: boolean;
  onToggle: () => void;
  onResetQuantity?: () => void;
}) {
  const inputId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) menuTriggerRef.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const trigger = menuTriggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const left = Math.max(viewportLeft + 8, Math.min(anchor.right - menu.offsetWidth, viewportRight - menu.offsetWidth - 8));
    const top = anchor.bottom + menu.offsetHeight + 4 <= viewportBottom - 8
      ? anchor.bottom + 4 : Math.max(viewportTop + 8, anchor.top - menu.offsetHeight - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const dismiss = () => setMenuOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) dismiss();
    };
    // The portal keeps a bottom-row menu outside the item pane's clipping boundary.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    viewport?.addEventListener("resize", dismiss);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      viewport?.removeEventListener("resize", dismiss);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  return <div className="configured-estimate-line__more" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); closeMenu(true); }
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) closeMenu();
  }}>
    <button ref={menuTriggerRef} type="button" aria-label={`More options for ${name}`} aria-expanded={menuOpen}
      aria-controls={menuOpen ? `${inputId}-options` : undefined} onClick={() => setMenuOpen(open => !open)}><EstimateBuilderGlyph name="more" /></button>
    {menuOpen ? createPortal(<div ref={menuRef} id={`${inputId}-options`} className="configured-estimate-line__menu configured-estimate-line__menu--floating"
      role="group" aria-label={`Options for ${name}`} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== menuTriggerRef.current) closeMenu();
      }} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (event.shiftKey && event.target === actions[0]) { event.preventDefault(); closeMenu(true); }
        else if (!event.shiftKey && event.target === actions.at(-1)) { event.preventDefault(); closeMenu(true); }
      }}>
      <button type="button" disabled={disabled} onClick={() => { onToggle(); closeMenu(true); }}>{included ? "Remove from estimate" : "Add to estimate"}</button>
      {onResetQuantity ? <button type="button" disabled={disabled} onClick={() => { onResetQuantity(); closeMenu(true); }}>Reset quantity</button> : null}
    </div>, document.body) : null}
  </div>;
}
