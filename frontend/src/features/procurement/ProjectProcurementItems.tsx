import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import type { ProjectProcurementItem } from "../../api/types";
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
import { PROCUREMENT_ITEMS_PAGE_SIZE, getProjectProcurementItems, projectProcurementKeys } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";
import { procurementKeys } from "./procurementApi";
import "./projectProcurementItems.css";

export function ProjectProcurementItems({ projectId, projectName }: { projectId: string; projectName: string }) {
  return <ProjectProcurementItemsTable key={projectId} projectId={projectId} projectName={projectName} />;
}

function ProjectProcurementItemsTable({ projectId, projectName }: { projectId: string; projectName: string }) {
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
  const query = useQuery({
    queryKey: projectProcurementKeys.list(projectId, q, offset),
    queryFn: ({ signal }) => getProjectProcurementItems(projectId, q, offset, signal),
    enabled: canRead,
    staleTime: 30_000
  });
  const page = query.data;
  // Revoked access must not keep previously cached project items visible.
  const accessDenied = !canRead || (query.error && "status" in query.error && [401, 403].includes(Number(query.error.status)));
  const projectUnavailable = query.error instanceof ApiError && (
    query.error.status === 404 ||
    (query.error.status === 409 && query.error.code === "PROCUREMENT_APPROVAL_SOURCE_CONFLICT")
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

  return (
    <Surface as="section" className="project-procurement-items" aria-labelledby="project-procurement-items-title">
      <div className="project-procurement-items__heading">
        <div>
          <p className="project-procurement-items__eyebrow">Project procurement</p>
          <h2 id="project-procurement-items-title" ref={headingRef} tabIndex={-1}>Procurement items</h2>
          <p>Manage item, brand, vendor and unit prices for this project.</p>
        </div>
        {canManage && !accessDenied && !projectUnavailable ? <Button size="compact" leadingIcon={<Plus />} onClick={(event) => {
          returnFocusRef.current = event.currentTarget;
          setNotice("");
          setEditor({ item: null });
        }}>Add item</Button> : null}
      </div>
      {accessDenied ? <PageState state="error" message="You do not have permission to view procurement items." /> : projectUnavailable ? (
        <PageState state="error" message="Procurement items are no longer available for this project."
          action={{ label: "Refresh project", onAction: () => {
            void queryClient.invalidateQueries({ queryKey: procurementKeys.projects });
            void query.refetch();
          } }} />
      ) : <>
        <form className="project-procurement-items__search" role="search" aria-label="Search procurement items" onSubmit={search}>
          <label className="sr-only" htmlFor="project-procurement-items-search">Search by item, brand, vendor or unit</label>
          <Input id="project-procurement-items-search" type="search" placeholder="Search item, brand, vendor or unit" maxLength={100}
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
            <span>{page.total} {page.total === 1 ? "item" : "items"}{q ? ` matching “${q}”` : " in this project"}</span>
            {query.isFetching ? <span>Updating…</span> : null}
          </div>
          {page.items.length ? <div className="project-procurement-items__table-region" role="region" aria-label="Procurement items table" tabIndex={0} aria-busy={query.isFetching || undefined}>
            <table className="project-procurement-items__table">
              <caption className="sr-only">Procurement items and prices per unit of measure</caption>
              <thead><tr><th scope="col">Item name</th><th scope="col">Brand</th><th scope="col">Vendor</th><th scope="col">UOM</th><th scope="col">Price (INR)</th>{canManage ? <th scope="col">Actions</th> : null}</tr></thead>
              <tbody>{page.items.map((item) => <tr key={item.id}>
                <th scope="row" className="project-procurement-items__name">{item.itemName}</th>
                <td data-label="Brand">{item.brand}</td>
                <td data-label="Vendor">{item.vendor ? <span>{item.vendor.name}{item.vendor.status !== "active" ? <small>Unavailable for new items</small> : null}</span> : <span className="project-procurement-items__muted">Not selected</span>}</td>
                <td data-label="UOM"><span title={item.uom.name}>{item.uom.code}</span>{item.uom.status !== "active" ? <small>Unavailable for new items</small> : null}</td>
                <td data-label="Price (INR)" className="project-procurement-items__price">{formatPaise(item.pricePaise)}</td>
                {canManage ? <td className="project-procurement-items__actions"><IconButton variant="quiet" icon={<Pencil aria-hidden="true" />} label={`Edit ${item.itemName}, ${item.brand}`} title={`Edit ${item.itemName}`} onClick={(event) => {
                  returnFocusRef.current = event.currentTarget;
                  setNotice("");
                  setEditor({ item });
                }} /></td> : null}
              </tr>)}</tbody>
            </table>
          </div> : <PageState state="empty" message={q ? "No items match your search." : page.total > 0 ? "This page is empty. Return to the previous page." : "Add the first procurement item for this project."}
            action={q ? { label: "Clear search", onAction: clearSearch } : undefined} />}
          {page.total > PROCUREMENT_ITEMS_PAGE_SIZE || offset > 0 ? <nav className="project-procurement-items__pagination" aria-label="Procurement item pages">
            <span>{page.items.length ? `${offset + 1}–${offset + page.items.length} of ${page.total}` : `${page.total} items`}</span>
            <div><Button variant="secondary" size="compact" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((previous) => Math.max(0, previous - PROCUREMENT_ITEMS_PAGE_SIZE))}>Previous</Button>
              <Button variant="secondary" size="compact" disabled={offset + PROCUREMENT_ITEMS_PAGE_SIZE >= page.total || query.isFetching} onClick={() => setOffset((previous) => previous + PROCUREMENT_ITEMS_PAGE_SIZE)}>Next</Button></div>
          </nav> : null}
        </> : null}
      </>}
      {editor && canManage && !accessDenied && !projectUnavailable ? <ProjectProcurementItemEditor key={editor.item?.id ?? "new"} item={editor.item} projectId={projectId} projectName={projectName}
        onClose={() => setEditor(null)} returnFocusRef={returnFocusRef} fallbackFocusRef={headingRef}
        onSaved={(saved) => { setEditor(null); setNotice(`${saved.itemName} ${editor.item ? "updated" : "added"} in this project.`); }} /> : null}
    </Surface>
  );
}
