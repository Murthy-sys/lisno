import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import type { ProcurementEstimateItem, ProjectProcurementItem } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProjectProcurementItemEditor } from "./ProjectProcurementItemEditor";
import { PROCUREMENT_ITEMS_PAGE_SIZE, getProjectProcurementItems, projectProcurementKeys, type ProcurementParentSource, type ProcurementParentOption } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";
import { procurementKeys } from "./procurementApi";
import "./projectProcurementItems.css";

interface Props {
  projectId: string;
  projectName: string;
  source?: ProcurementParentSource;
  estimateItem?: ProcurementEstimateItem;
  unassigned?: boolean;
  assignmentOptions?: ProcurementParentOption[];
  onEditorRequested?: (item: ProjectProcurementItem | null, opener: HTMLElement) => void;
}

export function ProjectProcurementItems(props: Props) {
  const { projectId, source, unassigned } = props;
  return <ProjectProcurementItemsTable key={JSON.stringify([projectId, source, unassigned])} {...props} />;
}

function ProjectProcurementItemsTable({ projectId, projectName, source, estimateItem, unassigned = false, assignmentOptions, onEditorRequested }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(!estimateItem);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.items.read");
  const canManage = hasFrontendPermission(auth.authorization, "procurement.items.manage");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<{ item: ProjectProcurementItem | null } | null>(null);
  const [notice, setNotice] = useState("");
  const returnFocusRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scope = source ?? (unassigned ? { unassigned: true as const } : undefined);
  const query = useQuery({
    queryKey: projectProcurementKeys.list(projectId, q, offset, scope),
    queryFn: ({ signal }) => getProjectProcurementItems(projectId, q, offset, signal, scope),
    enabled: canRead && expanded,
    staleTime: 30_000
  });
  const page = query.data;
  // Revoked access must not keep previously cached project items visible.
  const accessDenied = !canRead || (query.error && "status" in query.error && [401, 403].includes(Number(query.error.status)));
  const projectUnavailable = query.error instanceof ApiError && (
    query.error.status === 404 ||
    (query.error.status === 409 && ["PROCUREMENT_APPROVAL_SOURCE_CONFLICT", "PROCUREMENT_ITEM_SOURCE_CONFLICT"].includes(query.error.code))
  );
  useEffect(() => {
    if (!projectUnavailable) return;
    setEditor(null);
    void queryClient.invalidateQueries({ queryKey: procurementKeys.projects });
  }, [projectUnavailable, query.error, queryClient]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQ(searchInput.normalize("NFKC").trim().replace(/\s+/gu, " "));
    setOffset(0);
    setNotice("");
  }

  function clearSearch() {
    setSearchInput("");
    setQ("");
    setOffset(0);
  }

  if (unassigned && query.isSuccess && !q && page?.total === 0) return null;
  const parentLabel = estimateItem ? `${estimateItem.specification} — ${estimateItem.roomName}` : undefined;
  const title = estimateItem?.specification ?? (unassigned ? "Items needing assignment" : "Procurement items");
  const Heading = estimateItem ? "h4" : "h3";

  return (
    <Surface as={estimateItem ? "div" : "section"} role={estimateItem ? "group" : undefined} data-expanded={estimateItem ? expanded : undefined} className={`project-procurement-items${estimateItem ? " project-procurement-items--estimate" : ""}${unassigned ? " project-procurement-items--unassigned" : ""}`} aria-label={parentLabel} aria-labelledby={estimateItem ? undefined : `${id}-title`}>
      <div className="project-procurement-items__heading">
        <div>
          {estimateItem ? <p className="project-procurement-items__eyebrow">{estimateItem.roomName}</p> : null}
          <Heading id={`${id}-title`} ref={headingRef} tabIndex={-1}>{title}</Heading>
          <p>{estimateItem ? `${estimateItem.quantity} ${estimateItem.unit} · ${estimateItem.catalogueId}` : unassigned ? "Saved items without a matching current estimate item. Edit an unlinked item to assign it." : "Manage item, brand, vendor and unit prices for this project."}</p>
        </div>
        {estimateItem ? <div className="project-procurement-items__budget"><span>Estimated budget</span><strong>{formatPaise(estimateItem.estimatedAmountPaise)}</strong></div> : null}
        {canManage && source && !accessDenied && !projectUnavailable ? <Button size="compact" leadingIcon={<Plus />} aria-label={parentLabel ? `Add item under ${parentLabel}` : undefined} onClick={(event) => {
          returnFocusRef.current = event.currentTarget;
          setNotice("");
          setExpanded(true);
          if (onEditorRequested) onEditorRequested(null, event.currentTarget);
          else setEditor({ item: null });
        }}>Add item</Button> : null}
        {estimateItem ? <Button variant="quiet" size="compact" className="project-procurement-items__disclosure" aria-expanded={expanded} aria-controls={`${id}-items`}
          aria-label={`${expanded ? "Hide" : "View"} procurement items for ${parentLabel}`} onClick={() => setExpanded((value) => !value)} leadingIcon={<ChevronDown aria-hidden="true" />}>{expanded ? "Hide items" : "View items"}</Button> : null}
      </div>
      <div id={`${id}-items`} className="project-procurement-items__body" hidden={!expanded}>{expanded ? <>
      {accessDenied ? <PageState state="error" message="You do not have permission to view procurement items." /> : projectUnavailable ? (
        <PageState state="error" message="Procurement items are no longer available for this project."
          action={{ label: "Refresh project", onAction: () => {
            void queryClient.invalidateQueries({ queryKey: procurementKeys.projects });
            void query.refetch();
          } }} />
      ) : <>
        <form className="project-procurement-items__search" role="search" aria-label={`Search procurement items${parentLabel ? ` for ${parentLabel}` : unassigned ? " needing assignment" : ""}`} onSubmit={search}>
          <label className="sr-only" htmlFor={`${id}-search`}>Search by item, brand, vendor or unit</label>
          <Input id={`${id}-search`} type="search" placeholder="Search item, brand, vendor or unit" maxLength={100}
            value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <Button type="submit" variant="secondary" size="compact" leadingIcon={<Search />}>Search</Button>
          {q ? <Button variant="quiet" size="compact" onClick={clearSearch}>Clear</Button> : null}
        </form>
        {notice ? <InlineMessage tone="success" role="status">{notice}</InlineMessage> : null}
        {query.isError ? <InlineMessage tone="error" action={<Button variant="secondary" size="compact" onClick={() => void query.refetch()}>Retry items</Button>}>
          {page ? "The project items could not be refreshed. Showing the last loaded items; prices may be out of date." : procurementError(query.error, "Procurement items could not be loaded.")}
        </InlineMessage> : null}
        {query.isPending ? <PageState state="loading" message="Loading procurement items…" /> : page ? <>
          <div className="project-procurement-items__summary" role="status">
            <span>{page.total} {page.total === 1 ? "item" : "items"}{q ? ` matching “${q}”` : source ? " under this estimate item" : " needing assignment"}</span>
            {query.isFetching ? <span>Updating…</span> : null}
          </div>
          {page.items.length ? <div className="project-procurement-items__table-region" role="region" aria-label={`Procurement items table${parentLabel ? ` for ${parentLabel}` : unassigned ? " needing assignment" : ""}`} tabIndex={0} aria-busy={query.isFetching || undefined}>
            <table className="project-procurement-items__table">
              <caption className="sr-only">Procurement items and prices per unit of measure</caption>
              <thead><tr><th scope="col">Item name</th><th scope="col">Brand</th><th scope="col">Vendor</th><th scope="col">UOM</th><th scope="col">Allocated work (INR)</th><th scope="col">Price (INR)</th>{canManage ? <th scope="col">Actions</th> : null}</tr></thead>
              <tbody>{page.items.map((item) => <tr key={item.id}>
                <th scope="row" className="project-procurement-items__name"><span className="project-procurement-items__chip">{item.itemName}</span>{unassigned && item.estimateSource ? <small>From a previous estimate item</small> : null}</th>
                <td data-label="Brand"><span className="project-procurement-items__chip project-procurement-items__chip--brand">{item.brand}</span></td>
                <td data-label="Vendor">{item.vendor ? <><span className="project-procurement-items__chip project-procurement-items__chip--vendor">{item.vendor.name}</span>{item.vendor.status !== "active" ? <small>Unavailable for new items</small> : null}</> : <span className="project-procurement-items__chip project-procurement-items__chip--neutral">Not selected</span>}</td>
                <td data-label="UOM"><span className="project-procurement-items__chip project-procurement-items__chip--uom" title={item.uom.name}>{item.uom.code}</span>{item.uom.status !== "active" ? <small>Unavailable for new items</small> : null}</td>
                <td data-label="Allocated work (INR)">{item.allocatedWorkPaise == null ? "Not recorded" : formatPaise(item.allocatedWorkPaise)}</td>
                <td data-label="Price (INR)" className="project-procurement-items__price"><span className="project-procurement-items__chip project-procurement-items__chip--price">{formatPaise(item.pricePaise)}</span></td>
                {canManage ? <td className="project-procurement-items__actions">{unassigned && item.estimateSource ? <span className="project-procurement-items__muted">Review assignment</span> : <IconButton variant="quiet" icon={<Pencil aria-hidden="true" />} label={`Edit ${item.itemName}, ${item.brand}`} title={`Edit ${item.itemName}`} onClick={(event) => {
                  returnFocusRef.current = event.currentTarget;
                  setNotice("");
                  if (onEditorRequested) onEditorRequested(item, event.currentTarget);
                  else setEditor({ item });
                }} />}</td> : null}
              </tr>)}</tbody>
            </table>
          </div> : <PageState state="empty" message={q ? "No items match your search." : page.total > 0 ? "This page is empty. Return to the previous page." : source ? "Add the first procurement item under this estimate item." : "No items need assignment."}
            action={q ? { label: "Clear search", onAction: clearSearch } : undefined} />}
          {page.total > PROCUREMENT_ITEMS_PAGE_SIZE || offset > 0 ? <nav className="project-procurement-items__pagination" aria-label={`Procurement item pages${parentLabel ? ` for ${parentLabel}` : unassigned ? " needing assignment" : ""}`}>
            <span>{page.items.length ? `${offset + 1}–${offset + page.items.length} of ${page.total}` : `${page.total} items`}</span>
            <div><Button variant="secondary" size="compact" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((previous) => Math.max(0, previous - PROCUREMENT_ITEMS_PAGE_SIZE))}>Previous</Button>
              <Button variant="secondary" size="compact" disabled={offset + PROCUREMENT_ITEMS_PAGE_SIZE >= page.total || query.isFetching} onClick={() => setOffset((previous) => previous + PROCUREMENT_ITEMS_PAGE_SIZE)}>Next</Button></div>
          </nav> : null}
        </> : null}
      </>}
      </> : null}</div>
      {editor && canManage && !accessDenied && !projectUnavailable ? <ProjectProcurementItemEditor key={editor.item?.id ?? "new"} item={editor.item} projectId={projectId} projectName={projectName}
        source={source} assignmentOptions={assignmentOptions} parentLabel={parentLabel}
        onClose={() => setEditor(null)} returnFocusRef={returnFocusRef} fallbackFocusRef={headingRef}
        onSaved={(saved) => { setEditor(null); setNotice(`${saved.itemName} ${editor.item ? "updated" : "added"} in this project.`); }} /> : null}
    </Surface>
  );
}
