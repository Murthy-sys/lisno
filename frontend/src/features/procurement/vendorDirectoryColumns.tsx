import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Field";
import type { KnowledgeMaster } from "../ai-estimator-knowledge/knowledgeTypes";
import { normalizeExecutionTypes } from "./vendorProfileDraft";
import { DirectoryIcon } from "./VendorDirectoryOverview";

export interface VendorDirectoryRowContext {
  selected: boolean; toggle: (checked: boolean) => void;
  canUpdate: boolean; canArchive: boolean;
  onEdit: () => void; onView: () => void; onArchive: () => void;
}

export interface VendorDirectoryColumn {
  id: string;
  header: string;
  width: { fixed: number } | { weight: number; min: number; max?: number } | { fill: true; weight: number; min: number }; // at most one column may be fill
  sticky?: "start" | "end"; // columns pinned closer to the same edge must be fixed-width
  placement: "selection" | "identity" | "field" | "actions";
  render: (vendor: KnowledgeMaster, context: VendorDirectoryRowContext) => ReactNode;
}

function RowMenu({ vendor, onView }: { vendor: KnowledgeMaster; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  function dismiss() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="vendor-directory__menu" ref={container} onKeyDown={(event) => {
    if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); dismiss(); }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); item.current?.focus(); }
  }}>
    <Button ref={trigger} variant="quiet" aria-label={`More actions for ${vendor.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }} onClick={() => setOpen((value) => !value)}><DirectoryIcon name="more" /></Button>
    {open ? <div className="vendor-directory__menu-items" role="menu" aria-label={`Actions for ${vendor.name}`} id={id}><button ref={item} type="button" role="menuitem" onClick={() => { dismiss(); onView(); }}>View details</button></div> : null}
  </div>;
}

const initials = (name: string) => name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toLocaleUpperCase();
const basketName = (basket: { name: string | null } | null | undefined) => basket?.name ?? (basket ? "Unavailable" : "Not recorded");

export const vendorDirectoryColumns: readonly VendorDirectoryColumn[] = [
  { id: "selection", header: "Select", width: { fixed: 48 }, sticky: "start", placement: "selection", render: (vendor, { selected, toggle }) => <label><Checkbox aria-label={`Select ${vendor.name}`} checked={selected} onChange={(event) => toggle(event.target.checked)} /></label> },
  { id: "vendor", header: "Vendor Details", width: { fill: true, weight: 45, min: 220 }, sticky: "start", placement: "identity", render: (vendor) => <div className="vendor-directory__identity"><span className="vendor-directory__avatar" aria-hidden="true">{initials(vendor.name)}</span><div><strong>{vendor.name}</strong><small className="vendor-directory__code" title={vendor.code}>{vendor.code}</small></div></div> },
  { id: "type", header: "Type", width: { weight: 30, min: 150, max: 240 }, placement: "field", render: (vendor) => {
    const summary = vendor.procurementSummary;
    const types = normalizeExecutionTypes(summary?.executionType).map((type) => type === "labor" ? "Labor" : "Material + Labour");
    return <div>{summary?.vendorType ? <span className={`vendor-directory__type vendor-directory__type--${summary.vendorType}`}>{summary.vendorType === "execution" ? "Execution" : "Supplier"}</span> : <span>Incomplete</span>}{summary?.vendorType === "execution" ? <small>{types.length ? types.join(" · ") : "Execution type not recorded"}</small> : null}{summary?.vendorType && !summary.profileComplete ? <small>Incomplete profile</small> : null}</div>;
  } },
  { id: "basket", header: "Basket", width: { weight: 25, min: 130, max: 220 }, placement: "field", render: (vendor) => {
    const summary = vendor.procurementSummary;
    return <div className="vendor-directory__basket"><span className="sr-only">Main Basket: </span>{basketName(summary?.mainBasket)}{summary?.mainBasket && summary.mainBasket.status !== "active" ? <small>Unavailable for new selections</small> : null}<small className="vendor-directory__sub-basket"><span aria-hidden="true">↳ </span><span className="sr-only">Sub Basket: </span>{basketName(summary?.subBasket)}</small></div>;
  } },
  { id: "status", header: "Status", width: { fixed: 124 }, placement: "field", render: (vendor) => <div><span className={`vendor-directory__status vendor-directory__status--${vendor.status}`}>{vendor.status === "active" ? "Active" : vendor.status === "inactive" ? "Inactive" : "Archived"}</span>{vendor.status !== "archived" && vendor.procurementSummary?.currentAddressVerifiedPhysically !== true ? <small className="vendor-directory__review">Under Review</small> : null}</div> },
  { id: "kpi", header: "Vendor KPI", width: { fixed: 112 }, placement: "field", render: () => <span className="vendor-directory__unavailable">Not available</span> },
  { id: "actions", header: "Actions", width: { fixed: 156 }, sticky: "end", placement: "actions", render: (vendor, { canUpdate, canArchive, onEdit, onView, onArchive }) => {
    const editable = canUpdate && vendor.status !== "archived";
    return <div className="vendor-directory__row-actions"><Button variant="quiet" className="vendor-directory__action-edit" title={editable ? "Edit vendor" : "View vendor"} aria-label={`${editable ? "Edit" : "View"} ${vendor.name}`} onClick={() => editable ? onEdit() : onView()}><DirectoryIcon name={editable ? "edit" : "view"} /></Button>{canArchive && vendor.status !== "archived" ? <Button variant="quiet" className="vendor-directory__action-archive" title="Archive vendor" aria-label={`Archive ${vendor.name}`} onClick={() => onArchive()}><DirectoryIcon name="archive" /></Button> : null}<RowMenu vendor={vendor} onView={onView} /></div>;
  } }
];
