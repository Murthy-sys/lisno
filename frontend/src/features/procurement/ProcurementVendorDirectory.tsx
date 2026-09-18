import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { archiveKnowledgeMaster, listKnowledgeMasters } from "../ai-estimator-knowledge/knowledgeApi";
import { KnowledgeMasterEditorDialog } from "../ai-estimator-knowledge/KnowledgeMasterEditorDialog";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster, KnowledgeMasterStatus } from "../ai-estimator-knowledge/knowledgeTypes";
import { procurementError } from "./procurementPresentation";
import { VendorKpiPlaceholder } from "./VendorKpiPlaceholder";

export function ProcurementVendorDirectory() {
  const auth = useAuth();
  const client = useQueryClient();
  const id = useId();
  const canRead = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read");
  const canCreate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const canUpdate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update");
  const canArchive = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "" as KnowledgeMasterStatus | "" });
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<KnowledgeMaster | "new" | null>(null);
  const [archive, setArchive] = useState<KnowledgeMaster | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const params = { search: filters.search || undefined, status: filters.status || undefined, includeArchived: filters.status === "archived" || undefined, offset, limit: 20 };
  const query = useQuery({ queryKey: knowledgeQueryKeys.masterList("vendors", params), queryFn: () => listKnowledgeMasters("vendors", params), enabled: canRead });
  const mutation = useMutation({
    mutationFn: (vendor: KnowledgeMaster) => archiveKnowledgeMaster("vendors", vendor.id, { expectedVersion: vendor.version, reason: reason.trim() }),
    onSuccess: async (vendor) => { await syncKnowledgeMasterMutation(client, "vendors"); setArchive(null); setNotice(`${vendor.name} archived.`); },
    onError: () => { void client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }); }
  });
  function apply(event: FormEvent) { event.preventDefault(); setFilters((current) => ({ ...current, search: search.trim() })); setOffset(0); }
  if (!canRead) return <PageState state="error" message="You do not have permission to configure vendors." />;
  const total = query.data?.pagination.total ?? 0;
  return <>
    <Surface as="section" className="vendor-procurement__surface" aria-labelledby={`${id}-title`}>
      <div className="vendor-procurement__heading"><div><h2 id={`${id}-title`}>Configured vendors</h2><p>Active vendors are available to Sales Managers and Procurement.</p></div>
        {canCreate ? <Button size="compact" leadingIcon={<Plus />} onClick={() => setEditor("new")}>Add vendor</Button> : null}</div>
      <form className="vendor-procurement__filters" role="search" aria-label="Search configured vendors" onSubmit={apply}>
        <Field id={`${id}-search`} label="Search vendors">{(props) => <Input {...props} type="search" value={search} maxLength={100} placeholder="Vendor name or code" onChange={(event) => setSearch(event.target.value)} />}</Field>
        <Field id={`${id}-status`} label="Status">{(props) => <Select {...props} value={filters.status} onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value as KnowledgeMasterStatus | "" })); setOffset(0); }}><option value="">All current</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></Select>}</Field>
        <Button type="submit" variant="secondary" size="compact" leadingIcon={<Search />}>Search</Button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {query.isPending ? <PageState state="loading" message="Loading vendors…" /> : query.isError ? <PageState state="error" message={procurementError(query.error, "Vendors could not be loaded.")} action={{ label: "Retry vendors", onAction: () => void query.refetch() }} /> : !query.data.items.length ? <PageState state="empty" message="No vendors match this view. Add a vendor or adjust the search." /> : <div className="vendor-procurement__table-wrap">
        <table className="vendor-procurement__table"><caption className="sr-only">Configured vendors and KPI availability</caption><thead><tr><th scope="col">Vendor</th><th scope="col">Details</th><th scope="col">Status</th><th scope="col">Vendor KPI</th><th scope="col">Actions</th></tr></thead>
          <tbody>{query.data.items.map((vendor) => <tr key={vendor.id}><th scope="row"><strong>{vendor.name}</strong><small>{vendor.code}</small></th><td data-label="Details">{vendor.description || "No details added"}</td><td data-label="Status"><StatusBadge label={vendor.status} tone={vendor.status === "active" ? "success" : "neutral"} /></td><td data-label="Vendor KPI"><span className="vendor-procurement__muted-chip">Not rated yet</span></td><td data-label="Actions"><div className="vendor-procurement__actions">
            {canUpdate && vendor.status !== "archived" ? <Button size="compact" variant="quiet" leadingIcon={<Pencil />} onClick={() => setEditor(vendor)} aria-label={`Edit ${vendor.name}`}>Edit</Button> : null}
            {canArchive && vendor.status !== "archived" ? <Button size="compact" variant="quiet" leadingIcon={<Archive />} onClick={() => { setArchive(vendor); setReason(""); mutation.reset(); }} aria-label={`Archive ${vendor.name}`}>Archive</Button> : null}
          </div></td></tr>)}</tbody></table>
      </div>}
      {!query.isError && (total > 20 || offset > 0) ? <nav className="vendor-procurement__pagination" aria-label="Vendor pages"><Button size="compact" variant="secondary" disabled={!offset || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</Button><span>{total} vendors</span><Button size="compact" variant="secondary" disabled={offset + 20 >= total || query.isFetching} onClick={() => setOffset((value) => value + 20)}>Next</Button></nav> : null}
    </Surface>
    <VendorKpiPlaceholder />
    {editor && (editor === "new" ? canCreate : canUpdate) ? <KnowledgeMasterEditorDialog key={editor === "new" ? "new" : editor.id} masterType="vendors" usage="procurement" existing={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={(vendor) => setNotice(`${vendor.name} saved.`)} /> : null}
    {archive && canArchive ? <Dialog title="Archive vendor?" eyebrow="Vendor directory" description={`${archive.name} will no longer be available for new selections. Existing project records remain available.`} onClose={() => setArchive(null)} busy={mutation.isPending} role="alertdialog">
      <Field id={`${id}-reason`} label="Reason" required>{(props) => <Textarea {...props} disabled={mutation.isPending} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
      {mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error, "The vendor could not be archived. Refresh and try again.")}</InlineMessage> : null}
      <div className="vendor-procurement__actions"><Button variant="secondary" disabled={mutation.isPending} onClick={() => setArchive(null)}>Cancel</Button><Button variant="destructive" disabled={!reason.trim()} busy={mutation.isPending} onClick={() => mutation.mutate(archive)}>Archive vendor</Button></div>
    </Dialog> : null}
  </>;
}
