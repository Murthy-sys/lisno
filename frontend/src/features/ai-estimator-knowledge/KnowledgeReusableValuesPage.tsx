import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Pencil, Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { archiveKnowledgeMaster, listKnowledgeMasters } from "./knowledgeApi";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import { KnowledgeMasterEditorDialog } from "./KnowledgeMasterEditorDialog";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { syncKnowledgeMasterMutation } from "./knowledgeMutationSync";
import { KNOWLEDGE_MASTER_LABELS, formatKnowledgeDateTime } from "./knowledgePresentation";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeMaster, KnowledgeMasterStatus, KnowledgeMasterType } from "./knowledgeTypes";
import "./ai-estimator-knowledge.css";

const PAGE_SIZE = 25;
const MASTER_TYPES = Object.keys(KNOWLEDGE_MASTER_LABELS) as KnowledgeMasterType[];

export function KnowledgeReusableValuesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [masterType, setMasterType] = useState<KnowledgeMasterType>("uoms");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<KnowledgeMasterStatus | "">("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<KnowledgeMasterStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<"create" | KnowledgeMaster | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<KnowledgeMaster | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const canCreate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const canUpdate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update");
  const canLifecycle = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle");
  const params = {
    search: appliedSearch || undefined,
    status: appliedStatus || undefined,
    includeArchived: appliedStatus === "archived" || undefined,
    limit: PAGE_SIZE,
    offset
  };
  const query = useQuery({
    queryKey: knowledgeQueryKeys.masterList(masterType, params),
    queryFn: () => listKnowledgeMasters(masterType, params),
    placeholderData: keepPreviousData
  });
  const archiveMutation = useMutation({
    mutationFn: (target: KnowledgeMaster) =>
      archiveKnowledgeMaster(masterType, target.id, {
        expectedVersion: target.version,
        reason: archiveReason.trim()
      }),
    onSuccess: async () => {
      await syncKnowledgeMasterMutation(queryClient, masterType);
      setArchiveTarget(null);
      setArchiveReason("");
    }
  });
  const total = query.data?.pagination.total ?? 0;
  const label = KNOWLEDGE_MASTER_LABELS[masterType];
  const archiveError = archiveMutation.error instanceof ApiError && archiveMutation.error.code === "VERSION_CONFLICT"
    ? "This reusable value changed elsewhere. Close this dialog, refresh the list, and review the latest version."
    : archiveMutation.error?.message ?? null;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setAppliedSearch(search.trim());
    setAppliedStatus(status);
  }

  function chooseType(next: KnowledgeMasterType) {
    setMasterType(next);
    setOffset(0);
    setEditor(null);
    setArchiveTarget(null);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % MASTER_TYPES.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + MASTER_TYPES.length) % MASTER_TYPES.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = MASTER_TYPES.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    chooseType(MASTER_TYPES[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="knowledge-page">
      <PageHeader
        id="knowledge-reusable-title"
        eyebrow="Configuration"
        title="Reusable estimation values"
        description="Manage shared UOM, vendor, tax, priority, surface, and mode values for the additive AI estimator knowledge base."
        actions={
          <>
            <Button variant="secondary" leadingIcon={<ArrowLeft />} onClick={() => navigate("/admin/configuration/estimation")}>Back to knowledge base</Button>
            {canCreate ? <Button leadingIcon={<Plus />} onClick={() => setEditor("create")}>Add {label.replace(/s$/u, "")}</Button> : null}
          </>
        }
      />
      <KnowledgeSafetyNotice />

      <Surface as="section" className="knowledge-master-navigation" variant="subtle" aria-label="Reusable value categories">
        <div className="knowledge-master-tabs" role="tablist" aria-label="Reusable value categories">
          {MASTER_TYPES.map((type, index) => (
            <button key={type} id={`${tabsId}-tab-${type}`} aria-controls={`${tabsId}-panel-${type}`} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" aria-selected={masterType === type} tabIndex={masterType === type ? 0 : -1} className="knowledge-master-tab" onKeyDown={(event) => handleTabKey(event, index)} onClick={() => chooseType(type)}>
              {KNOWLEDGE_MASTER_LABELS[type]}
            </button>
          ))}
        </div>
        <Field id="master-type-mobile" label="Reusable value category" className="knowledge-master-select">
          {(props) => <Select {...props} value={masterType} onChange={(event) => chooseType(event.target.value as KnowledgeMasterType)}>{MASTER_TYPES.map((type) => <option key={type} value={type}>{KNOWLEDGE_MASTER_LABELS[type]}</option>)}</Select>}
        </Field>
      </Surface>

      <Surface as="section" variant="subtle" className="knowledge-filter-panel">
        <form className="knowledge-inline-filter" onSubmit={applyFilters}>
          <Field id="master-search" label={`Search ${label}`}>
            {(props) => <Input {...props} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />}
          </Field>
          <Field id="master-filter-status" label="Status">
            {(props) => <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as KnowledgeMasterStatus | "")}><option value="">All current</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></Select>}
          </Field>
          <div className="knowledge-filter-actions">
            <Button type="button" variant="quiet" onClick={() => { setSearch(""); setStatus(""); setAppliedSearch(""); setAppliedStatus(""); setOffset(0); }}>Clear</Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </Surface>

      <section id={`${tabsId}-panel-${masterType}`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${masterType}`} tabIndex={0}>
      {query.isFetching && query.data ? <p className="knowledge-refresh-status" role="status">Refreshing {label.toLowerCase()}…</p> : null}
      {query.isPending ? (
        <PageState state="loading" message={`Loading ${label.toLowerCase()}…`} />
      ) : query.isError ? (
        <PageState state="error" message={query.error.message} action={{ label: "Try again", onAction: () => void query.refetch() }} />
      ) : query.data.items.length === 0 ? (
        <PageState state="empty" message={`No ${label.toLowerCase()} match this view.`} action={canCreate ? { label: `Add ${label.replace(/s$/u, "")}`, onAction: () => setEditor("create") } : undefined} />
      ) : (
        <Surface as="section" padding="compact" aria-labelledby="master-list-title">
          <div className="knowledge-section-heading">
            <div><h2 id="master-list-title">{label}</h2><p>{total} configured value{total === 1 ? "" : "s"}</p></div>
          </div>
          <div className="knowledge-table-scroll">
            <table className="knowledge-table">
              <thead><tr><th scope="col">Code and name</th><th scope="col">Status</th><th scope="col">Details</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{query.data.items.map((master) => (
                <tr key={master.id}>
                  <td><strong>{master.name}</strong><span>{master.code}</span></td>
                  <td><StatusBadge label={capitalize(master.status)} tone={master.status === "active" ? "success" : master.status === "archived" ? "danger" : "neutral"} /></td>
                  <td><MasterDetails master={master} masterType={masterType} /></td>
                  <td>{formatKnowledgeDateTime(master.updatedAt)}</td>
                  <td><div className="knowledge-row-actions">
                    {canUpdate && master.status !== "archived" ? <Button size="compact" variant="quiet" leadingIcon={<Pencil />} onClick={() => setEditor(master)}>Edit<span className="sr-only"> {master.name}</span></Button> : null}
                    {canLifecycle && master.status !== "archived" ? <Button size="compact" variant="destructive-outline" leadingIcon={<Archive />} onClick={() => { setArchiveTarget(master); setArchiveReason(""); archiveMutation.reset(); }}>Archive<span className="sr-only"> {master.name}</span></Button> : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Surface>
      )}
      </section>

      {total > PAGE_SIZE ? <nav className="knowledge-pagination" aria-label={`${label} pages`}><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>Previous</Button><span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span><Button variant="secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Next</Button></nav> : null}

      {editor ? <KnowledgeMasterEditorDialog masterType={masterType} existing={editor === "create" ? undefined : editor} onClose={() => setEditor(null)} /> : null}
      {archiveTarget ? <KnowledgeLifecycleDialog action="archive" reason={archiveReason} onReasonChange={setArchiveReason} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveMutation.mutate(archiveTarget)} busy={archiveMutation.isPending} error={archiveError} /> : null}
      <Link className="sr-only" to="/admin/configuration/estimation">Return to AI estimator knowledge base</Link>
    </div>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function MasterDetails({ master, masterType }: { readonly master: KnowledgeMaster; readonly masterType: KnowledgeMasterType }) {
  if (masterType === "uoms") return <>{master.decimalScale ?? "Unavailable"} decimal places</>;
  if (masterType !== "taxes") return <>{master.description ?? "No description"}</>;
  const versions = master.taxVersions ?? [];
  return versions.length ? (
    <details className="knowledge-tax-history">
      <summary>{versions.length} immutable tax version{versions.length === 1 ? "" : "s"}</summary>
      <ol>
        {versions.map((version) => (
          <li key={version.id}>
            <strong>Version {version.versionNumber} · {version.rateBps / 100}% · {version.treatment}</strong>
            <span>{formatKnowledgeDateTime(version.effectiveFrom)} to {version.effectiveTo ? formatKnowledgeDateTime(version.effectiveTo) : "Open ended"} · {version.status}</span>
          </li>
        ))}
      </ol>
    </details>
  ) : <>No tax versions</>;
}
