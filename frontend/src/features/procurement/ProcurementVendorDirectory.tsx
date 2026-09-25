import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { archiveKnowledgeMaster, listKnowledgeMasters, listKnowledgeBaskets, listKnowledgeSubBaskets } from "../ai-estimator-knowledge/knowledgeApi";
import { collectAllKnowledgeMasterPages } from "../ai-estimator-knowledge/knowledgeMasterPagination";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster, KnowledgeMasterStatus } from "../ai-estimator-knowledge/knowledgeTypes";
import { ProcurementVendorEditor } from "./ProcurementVendorEditor";
import { procurementError } from "./procurementPresentation";
import { DirectoryIcon, VendorDirectoryHeader, VendorDirectoryOverview } from "./VendorDirectoryOverview";
import { VendorDirectoryPagination, VendorDirectoryTable, type VendorDirectoryPageSize } from "./VendorDirectoryTable";
import "./vendorDirectory.css";

const emptyFilters = { search: "", status: "" as KnowledgeMasterStatus | "", vendorType: "" as "" | "execution" | "supplier", mainBasketId: "", subBasketId: "" };
const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);

export function ProcurementVendorDirectory() {
  const auth = useAuth();
  const client = useQueryClient();
  const id = useId();
  const canRead = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read");
  const canCreate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const canUpdate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update");
  const canArchive = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<VendorDirectoryPageSize>(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ vendor: KnowledgeMaster; readOnly: boolean } | "new" | null>(null);
  const [archive, setArchive] = useState<KnowledgeMaster | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baskets = useQuery({ queryKey: [...knowledgeQueryKeys.basketLists(), "directory-catalog"], queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, includeArchived: true }), "Main Basket"), enabled: canRead });
  const subs = useQuery({ queryKey: [...knowledgeQueryKeys.subBasketLists(filters.mainBasketId), "directory-catalog"], queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(filters.mainBasketId, page), "Sub Basket"), enabled: canRead && Boolean(filters.mainBasketId) });
  const params = { vendorType: filters.vendorType || undefined, mainBasketId: filters.mainBasketId || undefined, subBasketId: filters.subBasketId || undefined, search: filters.search || undefined, status: filters.status || undefined, includeArchived: filters.status === "archived" || undefined, offset, limit: pageSize };
  const query = useQuery({ queryKey: knowledgeQueryKeys.masterList("vendors", params), queryFn: () => listKnowledgeMasters("vendors", params), enabled: canRead });
  const overview = useQuery({ queryKey: knowledgeQueryKeys.vendorDirectoryOverview(), queryFn: () => listKnowledgeMasters("vendors", { includeDirectoryOverview: true, limit: 1, offset: 0 }), enabled: canRead });
  const mutation = useMutation({
    mutationFn: (vendor: KnowledgeMaster) => archiveKnowledgeMaster("vendors", vendor.id, { expectedVersion: vendor.version, reason: reason.trim() }),
    onSuccess: async (vendor) => { await syncKnowledgeMasterMutation(client, "vendors"); setArchive(null); setNotice(`${vendor.name} archived.`); },
    onError: () => { void client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }); }
  });
  function cancelSearch() { if (searchTimer.current !== null) { clearTimeout(searchTimer.current); searchTimer.current = null; } }
  useEffect(() => () => { if (searchTimer.current !== null) clearTimeout(searchTimer.current); }, []);
  const total = query.data?.pagination.total;
  const visibleIds = query.isError ? "" : query.data?.items.map((vendor) => vendor.id).join("\u0000") ?? "";
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((vendorId) => visibleIds.split("\u0000").includes(vendorId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);
  useEffect(() => {
    if (total !== undefined && !query.isError && !query.isFetching && offset >= total && offset > 0) {
      setOffset(Math.max(0, Math.ceil(total / pageSize) - 1) * pageSize); setSelected(new Set());
    }
  }, [total, offset, pageSize, query.isError, query.isFetching]);
  function changeFilters(next: Partial<typeof filters>) { setFilters((current) => ({ ...current, ...next })); setOffset(0); setSelected(new Set()); }
  function searchChanged(value: string) { setSearch(value); cancelSearch(); searchTimer.current = setTimeout(() => { changeFilters({ search: value.trim() }); searchTimer.current = null; }, 300); }
  function apply(event: FormEvent) { event.preventDefault(); cancelSearch(); changeFilters({ search: search.trim() }); }
  function reset() { cancelSearch(); setSearch(""); setFilters(emptyFilters); setOffset(0); setSelected(new Set()); }
  function pageChanged(next: number) { setOffset(next); setSelected(new Set()); }
  function pageSizeChanged(next: VendorDirectoryPageSize) { setPageSize(next); setOffset(0); setSelected(new Set()); }
  if (!canRead || denied(query.error) || denied(overview.error) || denied(baskets.error) || denied(subs.error)) return <PageState state="error" message="You do not have permission to configure vendors." />;
  return <div className="vendor-directory">
    <VendorDirectoryHeader />
    <VendorDirectoryOverview overview={overview.data?.directoryOverview} loading={overview.isPending} error={overview.isError} refreshing={overview.isFetching} retry={() => void overview.refetch()} />
    <section className="vendor-directory__workspace" aria-labelledby={`${id}-title`}>
      <div className="vendor-directory__heading"><div><h2 id={`${id}-title`}>Configured vendors</h2><p>Active vendors are available to Sales Managers and Procurement.</p></div>{canCreate ? <Button leadingIcon={<DirectoryIcon name="plus" />} onClick={() => setEditor("new")}>Add vendor</Button> : null}</div>
      <form className="vendor-directory__filters" role="search" aria-label="Search configured vendors" onSubmit={apply}>
        <Field id={`${id}-search`} label="Search vendors" className="vendor-directory__search">{(props) => <div className="vendor-directory__search-control"><DirectoryIcon name="search" /><Input {...props} type="search" value={search} maxLength={100} placeholder="Vendor name or code" onChange={(event) => searchChanged(event.target.value)} /></div>}</Field>
        <Field id={`${id}-status`} label="Status">{(props) => <Select {...props} value={filters.status} onChange={(event) => changeFilters({ status: event.target.value as KnowledgeMasterStatus | "" })}><option value="">All current</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></Select>}</Field>
        <Field id={`${id}-type`} label="Vendor Type">{(props) => <Select {...props} value={filters.vendorType} onChange={(event) => changeFilters({ vendorType: event.target.value as typeof filters.vendorType })}><option value="">All types</option><option value="execution">Execution</option><option value="supplier">Supplier</option></Select>}</Field>
        <Field id={`${id}-main`} label="Main Basket">{(props) => <Select {...props} disabled={baskets.isPending || baskets.isError} value={filters.mainBasketId} onChange={(event) => changeFilters({ mainBasketId: event.target.value, subBasketId: "" })}><option value="">{baskets.isPending ? "Loading Main Baskets…" : "All Main Baskets"}</option>{filters.mainBasketId && !baskets.data?.items.some((basket) => basket.id === filters.mainBasketId) ? <option value={filters.mainBasketId}>Unavailable Main Basket</option> : null}{baskets.data?.items.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</Select>}</Field>
        <Field id={`${id}-sub`} label="Sub Basket">{(props) => <Select {...props} disabled={!filters.mainBasketId || subs.isPending || subs.isError} value={filters.subBasketId} onChange={(event) => changeFilters({ subBasketId: event.target.value })}><option value="">{filters.mainBasketId && subs.isPending ? "Loading Sub Baskets…" : "All Sub Baskets"}</option>{filters.subBasketId && !subs.data?.items.some((sub) => sub.id === filters.subBasketId && sub.basketId === filters.mainBasketId) ? <option value={filters.subBasketId}>Unavailable Sub Basket</option> : null}{subs.data?.items.filter((sub) => sub.basketId === filters.mainBasketId).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</Select>}</Field>
        <Button variant="secondary" leadingIcon={<DirectoryIcon name="reset" />} onClick={reset}>Reset</Button>
      </form>
      {baskets.isError || (filters.mainBasketId && subs.isError) ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => { void baskets.refetch(); if (filters.mainBasketId) void subs.refetch(); }}>Retry classification filters</Button>}>Classification filters could not be loaded.</InlineMessage> : null}
      {notice ? <p className="vendor-directory__notice" role="status">{notice}</p> : null}
      {selected.size ? <div className="vendor-directory__selected"><span role="status">{selected.size} {selected.size === 1 ? "vendor" : "vendors"} selected on this page</span><Button variant="quiet" onClick={() => setSelected(new Set())}>Clear selection</Button></div> : null}
      {query.isPending ? <PageState state="loading" message="Loading vendors…" /> : query.isError ? <PageState state="error" message={procurementError(query.error, "Vendors could not be loaded.")} action={{ label: "Retry vendors", onAction: () => void query.refetch() }} /> : !query.data.items.length ? <PageState state="empty" message={Object.values(filters).some(Boolean) ? "No vendors match this view. Adjust the filters or reset your search." : "No vendors configured yet. Add a vendor to get started."} /> : <VendorDirectoryTable items={query.data.items} selected={selected} onSelection={setSelected} canUpdate={canUpdate} canArchive={canArchive} onEdit={(vendor) => setEditor({ vendor, readOnly: false })} onView={(vendor) => setEditor({ vendor, readOnly: true })} onArchive={(vendor) => { setArchive(vendor); setReason(""); mutation.reset(); }} />}
      {query.isFetching && !query.isPending ? <p className="vendor-directory__notice" role="status">Refreshing vendors…</p> : null}
      {!query.isError && query.data ? <VendorDirectoryPagination offset={offset} count={query.data.items.length} total={query.data.pagination.total} pageSize={pageSize} busy={query.isFetching} onPage={pageChanged} onPageSize={pageSizeChanged} /> : null}
    </section>
    {editor && (editor === "new" ? canCreate : canRead) ? <ProcurementVendorEditor key={editor === "new" ? "new" : `${editor.vendor.id}-${editor.readOnly}`} canCreateBasket={canCreate && (editor === "new" || !editor.readOnly)} canUpdate={canUpdate && (editor === "new" || !editor.readOnly)} existing={editor === "new" ? undefined : editor.vendor} onClose={() => setEditor(null)} onSaved={(vendor) => setNotice(`${vendor.name} saved.`)} /> : null}
    {archive && canArchive ? <Dialog title="Archive vendor?" eyebrow="Vendor directory" description={`${archive.name} will no longer be available for new selections. Existing project records remain available.`} onClose={() => setArchive(null)} busy={mutation.isPending} role="alertdialog">
      <Field id={`${id}-reason`} label="Reason" required>{(props) => <Textarea {...props} disabled={mutation.isPending} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
      {mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error, "The vendor could not be archived. Refresh and try again.")}</InlineMessage> : null}
      <div className="vendor-procurement__actions"><Button variant="secondary" disabled={mutation.isPending} onClick={() => setArchive(null)}>Cancel</Button><Button variant="destructive" disabled={!reason.trim()} busy={mutation.isPending} onClick={() => mutation.mutate(archive)}>Archive vendor</Button></div>
    </Dialog> : null}
  </div>;
}
