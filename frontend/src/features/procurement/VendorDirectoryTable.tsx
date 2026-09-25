import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Select } from "../../components/ui/Field";
import type { KnowledgeMaster } from "../ai-estimator-knowledge/knowledgeTypes";
import { vendorDirectoryColumns, type VendorDirectoryColumn, type VendorDirectoryRowContext } from "./vendorDirectoryColumns";
import { DirectoryIcon } from "./VendorDirectoryOverview";

export const vendorDirectoryPageSizes = [10, 25, 50] as const;
export type VendorDirectoryPageSize = (typeof vendorDirectoryPageSizes)[number];

const fixedWidth = (column: VendorDirectoryColumn) => "fixed" in column.width ? column.width.fixed : 0;
export function vendorColumnWidth(column: VendorDirectoryColumn, minWidth: number, totalWeight: number): string | undefined {
  const { width } = column;
  if ("fixed" in width) return `${width.fixed}px`;
  if ("fill" in width) return undefined;
  const grown = `calc(${width.min}px + (100cqw - ${minWidth + 2}px) * ${width.weight / totalWeight})`;
  return width.max === undefined ? `max(${width.min}px, ${grown})` : `clamp(${width.min}px, ${grown}, ${width.max}px)`;
}

export function VendorDirectoryTable({ items, selected, onSelection, canUpdate, canArchive, onEdit, onView, onArchive, columns = vendorDirectoryColumns }: {
  items: readonly KnowledgeMaster[]; selected: Set<string>; onSelection: (selection: Set<string>) => void; canUpdate: boolean; canArchive: boolean;
  onEdit: (vendor: KnowledgeMaster) => void; onView: (vendor: KnowledgeMaster) => void; onArchive: (vendor: KnowledgeMaster) => void;
  columns?: readonly VendorDirectoryColumn[];
}) {
  const selectAll = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const selectedCount = items.filter((vendor) => selected.has(vendor.id)).length;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && selectedCount < items.length; }, [selectedCount, items.length]);
  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (table.current) observer?.observe(table.current);
    return () => observer?.disconnect();
  }, [items, columns]);
  const totalWeight = columns.reduce((sum, column) => sum + ("weight" in column.width ? column.width.weight : 0), 0);
  const minWidth = columns.reduce((sum, column) => sum + ("min" in column.width ? column.width.min : column.width.fixed), 0);
  const stickyStart = columns.filter((column) => column.sticky === "start");
  const stickyEnd = columns.filter((column) => column.sticky === "end");
  const stickyOffset = (column: VendorDirectoryColumn) => (column.sticky === "start" ? stickyStart.slice(0, stickyStart.indexOf(column)) : stickyEnd.slice(stickyEnd.indexOf(column) + 1)).reduce((sum, other) => sum + fixedWidth(other), 0);
  const cell = (column: VendorDirectoryColumn, body: boolean) => ({ "data-column": column.id, "data-placement": column.placement, "data-sticky": column.sticky, "data-label": body && (column.placement === "field" || column.placement === "actions") ? column.header : undefined, style: column.sticky ? { "--sticky-offset": `${stickyOffset(column)}px` } as CSSProperties : undefined });
  return <div className="vendor-directory__table-wrap" ref={wrap} data-scrollable={scrollable ? "true" : undefined} role={scrollable ? "region" : undefined} tabIndex={scrollable ? 0 : undefined} aria-label={scrollable ? "Vendor table, scroll horizontally" : undefined}><table ref={table} className="vendor-directory__table" style={{ "--vendor-table-min-width": `${minWidth}px` } as CSSProperties}><caption className="sr-only">Configured vendors and KPI availability</caption>
    <colgroup>{columns.map((column) => { const width = vendorColumnWidth(column, minWidth, totalWeight); return <col key={column.id} data-column={column.id} style={width === undefined ? undefined : { width }} />; })}</colgroup>
    <thead><tr>{columns.map((column) => column.placement === "selection" ? <th key={column.id} scope="col" className="vendor-directory__selection" {...cell(column, false)}><label><Checkbox ref={selectAll} aria-label="Select all vendors on this page" checked={items.length > 0 && selectedCount === items.length} onChange={(event) => onSelection(event.target.checked ? new Set(items.map((vendor) => vendor.id)) : new Set())} /></label></th> : <th key={column.id} scope="col" {...cell(column, false)}>{column.header}</th>)}</tr></thead>
    <tbody>{items.map((vendor) => {
      const context: VendorDirectoryRowContext = { selected: selected.has(vendor.id), toggle: (checked) => { const next = new Set(selected); if (checked) next.add(vendor.id); else next.delete(vendor.id); onSelection(next); }, canUpdate, canArchive, onEdit: () => onEdit(vendor), onView: () => onView(vendor), onArchive: () => onArchive(vendor) };
      return <tr key={vendor.id} data-selected={context.selected || undefined}>{columns.map((column) => column.placement === "identity" ? <th key={column.id} scope="row" {...cell(column, true)}>{column.render(vendor, context)}</th> : <td key={column.id} className={column.placement === "selection" ? "vendor-directory__selection" : undefined} {...cell(column, true)}>{column.render(vendor, context)}</td>)}</tr>;
    })}</tbody>
  </table></div>;
}

export function VendorDirectoryPagination({ offset, total, count, pageSize, busy, onPage, onPageSize }: { offset: number; total: number; count: number; pageSize: VendorDirectoryPageSize; busy: boolean; onPage: (offset: number) => void; onPageSize: (size: VendorDirectoryPageSize) => void }) {
  const id = useId();
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const reach = 2;
  const visible = Array.from(new Set([1, pages, ...Array.from({ length: reach * 2 + 1 }, (_, index) => page + index - reach).filter((value) => value >= 1 && value <= pages)])).sort((a, b) => a - b);
  return <div className="vendor-directory__footer"><div className="vendor-directory__range"><p>Showing {count ? offset + 1 : 0} to {Math.min(offset + count, total)} of {total} vendors</p><Field id={id} label="Rows per page" className="vendor-directory__page-size">{(props) => <Select {...props} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value) as VendorDirectoryPageSize)}>{vendorDirectoryPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</Select>}</Field></div><nav aria-label="Vendor pages"><Button variant="secondary" aria-label="Previous" disabled={busy || page <= 1} onClick={() => onPage(offset - pageSize)}><DirectoryIcon name="previous" /></Button>{visible.map((value, index) => <span key={value} className="vendor-directory__page-entry">{index > 0 && value - visible[index - 1] > 1 ? <span className="vendor-directory__ellipsis" aria-hidden="true">…</span> : null}<Button variant={value === page ? "primary" : "secondary"} aria-label={`Page ${value}`} aria-current={value === page ? "page" : undefined} disabled={busy} onClick={() => onPage((value - 1) * pageSize)}>{value}</Button></span>)}<Button variant="secondary" aria-label="Next" disabled={busy || page >= pages} onClick={() => onPage(offset + pageSize)}><DirectoryIcon name="next" /></Button></nav></div>;
}
