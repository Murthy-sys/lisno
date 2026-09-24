import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Field";
import type { KnowledgeMaster } from "../ai-estimator-knowledge/knowledgeTypes";
import { normalizeExecutionTypes } from "./vendorProfileDraft";
import { DirectoryIcon } from "./VendorDirectoryOverview";

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

export function VendorDirectoryTable({ items, selected, onSelection, canUpdate, canArchive, onEdit, onView, onArchive }: {
  items: readonly KnowledgeMaster[]; selected: Set<string>; onSelection: (selection: Set<string>) => void; canUpdate: boolean; canArchive: boolean;
  onEdit: (vendor: KnowledgeMaster) => void; onView: (vendor: KnowledgeMaster) => void; onArchive: (vendor: KnowledgeMaster) => void;
}) {
  const selectAll = useRef<HTMLInputElement>(null);
  const selectedCount = items.filter((vendor) => selected.has(vendor.id)).length;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && selectedCount < items.length; }, [selectedCount, items.length]);
  return <div className="vendor-directory__table-wrap"><table className="vendor-directory__table"><caption className="sr-only">Configured vendors and KPI availability</caption>
    <thead><tr><th scope="col" className="vendor-directory__selection"><label><Checkbox ref={selectAll} aria-label="Select all vendors on this page" checked={items.length > 0 && selectedCount === items.length} onChange={(event) => onSelection(event.target.checked ? new Set(items.map((vendor) => vendor.id)) : new Set())} /></label></th><th scope="col">Vendor Details</th><th scope="col">Type</th><th scope="col">Main Basket</th><th scope="col">Sub Basket</th><th scope="col">Status</th><th scope="col">Vendor KPI</th><th scope="col">Actions</th></tr></thead>
    <tbody>{items.map((vendor) => {
      const summary = vendor.procurementSummary;
      const editable = canUpdate && vendor.status !== "archived";
      const initials = vendor.name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toLocaleUpperCase();
      const types = normalizeExecutionTypes(summary?.executionType).map((type) => type === "labor" ? "Labor" : "Material + Labour");
      return <tr key={vendor.id} data-selected={selected.has(vendor.id) || undefined}>
        <td className="vendor-directory__selection"><label><Checkbox aria-label={`Select ${vendor.name}`} checked={selected.has(vendor.id)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(vendor.id); else next.delete(vendor.id); onSelection(next); }} /></label></td>
        <th scope="row"><div className="vendor-directory__identity"><span className="vendor-directory__avatar" aria-hidden="true">{initials}</span><div><strong>{vendor.name}</strong><small className="vendor-directory__code" title={vendor.code}>{vendor.code}</small></div></div></th>
        <td data-label="Type"><div>{summary?.vendorType ? <span className={`vendor-directory__type vendor-directory__type--${summary.vendorType}`}>{summary.vendorType === "execution" ? "Execution" : "Supplier"}</span> : <span>Incomplete</span>}{summary?.vendorType === "execution" ? <small>{types.length ? types.join(" · ") : "Execution type not recorded"}</small> : null}{summary?.vendorType && !summary.profileComplete ? <small>Incomplete profile</small> : null}</div></td>
        <td data-label="Main Basket"><div>{summary?.mainBasket?.name ?? (summary?.mainBasket ? "Unavailable" : "Not recorded")}{summary?.mainBasket && summary.mainBasket.status !== "active" ? <small>Unavailable for new selections</small> : null}</div></td>
        <td data-label="Sub Basket">{summary?.subBasket?.name ?? (summary?.subBasket ? "Unavailable" : "Not recorded")}</td>
        <td data-label="Status"><div><span className={`vendor-directory__status vendor-directory__status--${vendor.status}`}>{vendor.status === "active" ? "Active" : vendor.status === "inactive" ? "Inactive" : "Archived"}</span>{vendor.status !== "archived" && summary?.currentAddressVerifiedPhysically !== true ? <small className="vendor-directory__review">Under Review</small> : null}</div></td>
        <td data-label="Vendor KPI"><span className="vendor-directory__unavailable">Not available</span></td>
        <td data-label="Actions"><div className="vendor-directory__row-actions"><Button variant="quiet" className="vendor-directory__action-edit" title={editable ? "Edit vendor" : "View vendor"} aria-label={`${editable ? "Edit" : "View"} ${vendor.name}`} onClick={() => editable ? onEdit(vendor) : onView(vendor)}><DirectoryIcon name={editable ? "edit" : "view"} /></Button>{canArchive && vendor.status !== "archived" ? <Button variant="quiet" className="vendor-directory__action-archive" title="Archive vendor" aria-label={`Archive ${vendor.name}`} onClick={() => onArchive(vendor)}><DirectoryIcon name="archive" /></Button> : null}<RowMenu vendor={vendor} onView={() => onView(vendor)} /></div></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function VendorDirectoryPagination({ offset, total, count, busy, onPage }: { offset: number; total: number; count: number; busy: boolean; onPage: (offset: number) => void }) {
  const page = Math.floor(offset / 5) + 1;
  const pages = Math.max(1, Math.ceil(total / 5));
  const visible = Array.from(new Set([1, pages, ...Array.from({ length: 5 }, (_, index) => page + index - 2).filter((value) => value >= 1 && value <= pages)])).sort((a, b) => a - b);
  return <div className="vendor-directory__footer"><p>Showing {count ? offset + 1 : 0} to {Math.min(offset + count, total)} of {total} vendors</p><nav aria-label="Vendor pages"><Button variant="secondary" aria-label="Previous" disabled={busy || page <= 1} onClick={() => onPage(offset - 5)}><DirectoryIcon name="previous" /></Button>{visible.map((value, index) => <span key={value} className="vendor-directory__page-entry">{index > 0 && value - visible[index - 1] > 1 ? <span className="vendor-directory__ellipsis" aria-hidden="true">…</span> : null}<Button variant={value === page ? "primary" : "secondary"} aria-label={`Page ${value}`} aria-current={value === page ? "page" : undefined} disabled={busy} onClick={() => onPage((value - 1) * 5)}>{value}</Button></span>)}<Button variant="secondary" aria-label="Next" disabled={busy || page >= pages} onClick={() => onPage(offset + 5)}><DirectoryIcon name="next" /></Button></nav></div>;
}
