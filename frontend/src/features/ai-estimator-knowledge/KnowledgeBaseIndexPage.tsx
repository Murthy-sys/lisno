import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { Archive, Pencil, Plus, Settings2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  createKnowledgeBasket,
  createKnowledgeMainLine,
  archiveKnowledgeBasket,
  listKnowledgeBaskets,
  listKnowledgeItems,
  listKnowledgeMasters,
  updateKnowledgeBasket,
  type KnowledgeListParams
} from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KNOWLEDGE_ITEM_STATUS_LABELS } from "./knowledgePresentation";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import type {
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeItemStatus,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";
import "./ai-estimator-knowledge.css";

const PAGE_SIZE = 20;
const FILTER_MASTER_TYPES = [
  "priorities",
  "modes",
  "surfaces",
  "uoms",
  "vendors"
] as const satisfies readonly KnowledgeMasterType[];

type FilterState = Omit<KnowledgeListParams, "limit" | "offset">;

const emptyFilters: FilterState = {
  search: "",
  basketId: "",
  status: undefined,
  priorityId: "",
  modeId: "",
  surfaceId: "",
  uomId: "",
  vendorId: ""
};

function statusTone(status: KnowledgeItemStatus): StatusTone {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  if (status === "archived") return "danger";
  return "neutral";
}

function errorMessage(error: Error | null): string {
  return error?.message ?? "The knowledge base could not be loaded.";
}

export function KnowledgeBaseIndexPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [basketDialogOpen, setBasketDialogOpen] = useState(false);
  const [basketEditor, setBasketEditor] = useState<KnowledgeBasket | null>(null);
  const [basketArchive, setBasketArchive] = useState<KnowledgeBasket | null>(null);
  const [basketArchiveReason, setBasketArchiveReason] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  const canCreate = hasFrontendPermission(
    auth.authorization,
    "ai_estimator_knowledge.configuration.create"
  );
  const canUpdate = hasFrontendPermission(
    auth.authorization,
    "ai_estimator_knowledge.configuration.update"
  );
  const canLifecycle = hasFrontendPermission(
    auth.authorization,
    "ai_estimator_knowledge.configuration.lifecycle"
  );
  const request = { ...appliedFilters, limit: PAGE_SIZE, offset };
  const itemsQuery = useQuery({
    queryKey: knowledgeQueryKeys.itemList(request),
    queryFn: () => listKnowledgeItems(request),
    placeholderData: keepPreviousData
  });
  const basketsQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketList({ limit: 100, offset: 0 }),
    queryFn: () => listKnowledgeBaskets({ limit: 100, offset: 0 })
  });
  const masterQueries = useQueries({
    queries: FILTER_MASTER_TYPES.map((type) => ({
      queryKey: knowledgeQueryKeys.masterList(type, { limit: 100, offset: 0 }),
      queryFn: () => listKnowledgeMasters(type, { limit: 100, offset: 0 })
    }))
  });
  const masters = useMemo(
    () =>
      Object.fromEntries(
        FILTER_MASTER_TYPES.map((type, index) => [
          type,
          masterQueries[index].data?.items ?? []
        ])
      ) as Readonly<Record<(typeof FILTER_MASTER_TYPES)[number], readonly KnowledgeMaster[]>>,
    [masterQueries]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { basketName: string; items: KnowledgeItemListItem[] }>();
    for (const item of itemsQuery.data?.items ?? []) {
      const group = groups.get(item.basketId) ?? {
        basketName: item.basketName,
        items: []
      };
      group.items.push(item);
      groups.set(item.basketId, group);
    }
    return [...groups.entries()];
  }, [itemsQuery.data?.items]);
  const total = itemsQuery.data?.pagination.total ?? 0;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setOffset(0);
  }

  return (
    <div className="knowledge-page">
      <PageHeader
        id="knowledge-base-title"
        eyebrow="Configuration"
        title="AI Estimator Knowledge Base"
        description="Maintain structured cost, time, scope, quality, and recommendation rules for future AI estimation."
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Settings2 />}
              onClick={() => navigate("/admin/configuration/estimation/reusable-values")}
            >
              Manage reusable values
            </Button>
            {canCreate ? (
              <Button
                variant="secondary"
                leadingIcon={<Plus />}
                onClick={() => setBasketDialogOpen(true)}
              >
                Add main basket
              </Button>
            ) : null}
            {canCreate ? (
              <Button leadingIcon={<Plus />} onClick={() => setItemDialogOpen(true)}>
                Add estimation item
              </Button>
            ) : null}
          </>
        }
      />
      <KnowledgeSafetyNotice />

      {basketsQuery.isError || masterQueries.some(({ isError }) => isError) ? (
        <InlineMessage tone="warning" title="Some filters are unavailable">
          Knowledge items remain available, but one or more reusable-value filters could not be loaded.
        </InlineMessage>
      ) : null}

      <Surface as="section" className="knowledge-filter-panel" variant="subtle">
        <form onSubmit={applyFilters}>
          <div className="knowledge-filter-grid">
            <Field id="knowledge-search" label="Search Basket or Main Line">
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="search"
                  value={filters.search ?? ""}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, search: event.target.value }))
                  }
                />
              )}
            </Field>
            <FilterSelect
              id="knowledge-basket-filter"
              label="Basket"
              value={filters.basketId}
              options={(basketsQuery.data?.items ?? []).map(({ id, name }) => ({ id, name }))}
              onChange={(basketId) => setFilters((current) => ({ ...current, basketId }))}
            />
            <FilterSelect
              id="knowledge-status-filter"
              label="Status"
              value={filters.status}
              options={(["draft", "active", "inactive", "archived"] as const).map(
                (status) => ({ id: status, name: KNOWLEDGE_ITEM_STATUS_LABELS[status] })
              )}
              onChange={(status) =>
                setFilters((current) => ({
                  ...current,
                  status: status ? (status as KnowledgeItemStatus) : undefined
                }))
              }
            />
            {FILTER_MASTER_TYPES.map((type) => (
              <FilterSelect
                key={type}
                id={`knowledge-${type}-filter`}
                label={filterLabel(type)}
                value={filters[filterKey(type)]}
                options={masters[type].map(({ id, name }) => ({ id, name }))}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, [filterKey(type)]: value }))
                }
              />
            ))}
          </div>
          <div className="knowledge-filter-actions">
            <Button type="button" variant="quiet" onClick={resetFilters}>
              Clear filters
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </Surface>

      {itemsQuery.isFetching && itemsQuery.data ? (
        <p className="knowledge-refresh-status" role="status">
          Refreshing knowledge items…
        </p>
      ) : null}
      {itemsQuery.isPending ? (
        <PageState state="loading" message="Loading knowledge items…" />
      ) : itemsQuery.isError ? (
        <PageState
          state="error"
          message={errorMessage(itemsQuery.error)}
          action={{ label: "Try again", onAction: () => void itemsQuery.refetch() }}
        />
      ) : groupedItems.length === 0 ? (
        <PageState
          state="empty"
          message={
            Object.values(appliedFilters).some(Boolean)
              ? "No estimation items match these filters."
              : "No AI estimator knowledge items have been added yet."
          }
          action={canCreate ? { label: "Add estimation item", onAction: () => setItemDialogOpen(true) } : undefined}
        />
      ) : (
        <div className="knowledge-basket-groups" aria-label="Knowledge items">
          {groupedItems.map(([basketId, group]) => (
            <Surface key={basketId} as="section" className="knowledge-basket-group">
              <div className="knowledge-section-heading">
                <h2>{group.basketName}</h2>
                <div className="knowledge-row-actions">
                  {canUpdate ? <Button size="compact" variant="quiet" leadingIcon={<Pencil />} onClick={() => setBasketEditor((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null)}>Edit basket</Button> : null}
                  {canLifecycle ? <Button size="compact" variant="destructive-outline" leadingIcon={<Archive />} onClick={() => { setBasketArchive((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null); setBasketArchiveReason(""); }}>Archive basket</Button> : null}
                </div>
              </div>
              <div className="knowledge-item-grid">
                {group.items.map((item) => (
                  <article key={item.id} className="knowledge-item-card">
                    <div className="knowledge-item-card__heading">
                      <div>
                        <p className="knowledge-breadcrumb">{item.basketName} → Main Line</p>
                        <h3>
                          <Link
                            className="knowledge-item-link"
                            to={`/admin/configuration/estimation/items/${encodeURIComponent(item.mainLineId)}`}
                          >
                            {item.mainLineName}
                          </Link>
                        </h3>
                      </div>
                      <StatusBadge
                        label={KNOWLEDGE_ITEM_STATUS_LABELS[item.status]}
                        tone={statusTone(item.status)}
                      />
                    </div>
                    <p>{item.description ?? "No description provided."}</p>
                    <div className="knowledge-item-card__progress">
                      <span>{item.completeness.percentage}% complete</span>
                      <ProgressBar
                        value={item.completeness.percentage}
                        label={`${item.mainLineName} completeness`}
                        valueText={`${item.completeness.percentage}% complete`}
                      />
                    </div>
                    <dl className="knowledge-item-metadata">
                      <div><dt>Revision</dt><dd>{item.revisionNumber ?? "Not available"}</dd></div>
                      <div><dt>UOM</dt><dd>{nameFor(masters.uoms, item.uomId)}</dd></div>
                      <div><dt>Priority</dt><dd>{nameFor(masters.priorities, item.priorityId)}</dd></div>
                      <div><dt>Modes</dt><dd>{namesFor(masters.modes, item.modeIds)}</dd></div>
                      <div><dt>Surfaces</dt><dd>{namesFor(masters.surfaces, item.surfaceIds)}</dd></div>
                      <div><dt>Updated</dt><dd>{new Date(item.updatedAt).toLocaleDateString("en-IN")}</dd></div>
                    </dl>
                    <div className="knowledge-item-card__actions">
                      <Button variant="secondary" onClick={() => navigate(`/admin/configuration/estimation/items/${encodeURIComponent(item.mainLineId)}`)}>Open workspace</Button>
                    </div>
                  </article>
                ))}
              </div>
            </Surface>
          ))}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <nav className="knowledge-pagination" aria-label="Knowledge item pages">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button
            variant="secondary"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Next
          </Button>
        </nav>
      ) : null}

      {basketDialogOpen ? (
        <BasketEditorDialog
          onClose={() => setBasketDialogOpen(false)}
          onCreated={async () => {
            await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() });
            setBasketDialogOpen(false);
          }}
        />
      ) : null}
      {basketEditor ? (
        <BasketEditorDialog
          existing={basketEditor}
          onClose={() => setBasketEditor(null)}
          onCreated={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }),
              queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() })
            ]);
            setBasketEditor(null);
          }}
        />
      ) : null}
      {basketArchive ? (
        <ArchiveBasketDialog
          basket={basketArchive}
          reason={basketArchiveReason}
          onReasonChange={setBasketArchiveReason}
          onClose={() => setBasketArchive(null)}
          onArchived={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }),
              queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() })
            ]);
            setBasketArchive(null);
          }}
        />
      ) : null}
      {itemDialogOpen ? (
        <CreateItemDialog
          baskets={(basketsQuery.data?.items ?? []).filter(({ status }) => status === "active")}
          onClose={() => setItemDialogOpen(false)}
          onCreated={async (mainLineId) => {
            await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() });
            setItemDialogOpen(false);
            navigate(`/admin/configuration/estimation/items/${encodeURIComponent(mainLineId)}`);
          }}
        />
      ) : null}
    </div>
  );
}

function filterKey(type: (typeof FILTER_MASTER_TYPES)[number]) {
  return ({
    priorities: "priorityId",
    modes: "modeId",
    surfaces: "surfaceId",
    uoms: "uomId",
    vendors: "vendorId"
  } as const)[type];
}

function filterLabel(type: (typeof FILTER_MASTER_TYPES)[number]) {
  return ({ priorities: "Priority", modes: "Mode", surfaces: "Surface", uoms: "UOM", vendors: "Vendor" } as const)[type];
}

function nameFor(masters: readonly KnowledgeMaster[], id: string | null) {
  if (!id) return "Not configured";
  return masters.find((master) => master.id === id)?.name ?? "Unavailable";
}

function namesFor(masters: readonly KnowledgeMaster[], ids: readonly string[]) {
  if (!ids.length) return "Not configured";
  return ids.map((id) => masters.find((master) => master.id === id)?.name ?? "Unavailable").join(", ");
}

function FilterSelect({ id, label, value, options, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly value?: string;
  readonly options: readonly { id: string; name: string }[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label}>
      {(controlProps) => (
        <Select {...controlProps} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">All</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      )}
    </Field>
  );
}

function BasketEditorDialog({ existing, onClose, onCreated }: {
  readonly existing?: KnowledgeBasket;
  readonly onClose: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(existing?.displayOrder ?? 0));
  const [status, setStatus] = useState<"active" | "inactive">(existing?.status === "inactive" ? "inactive" : "active");
  const mutation = useMutation({
    mutationFn: () => existing
      ? updateKnowledgeBasket(existing.id, { expectedVersion: existing.version, name, description: description.trim() || null, displayOrder: Number(displayOrder), status })
      : createKnowledgeBasket({ name, description: description.trim() || null, displayOrder: Number(displayOrder) }),
    onSuccess: onCreated
  });
  return (
    <Dialog title={existing ? "Edit main basket" : "Add main basket"} eyebrow="Estimation configuration" onClose={onClose} busy={mutation.isPending}>
      <form className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <div className="knowledge-dialog-body">
          {mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
          <Field id="basket-name" label="Basket name" required>{(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field id="basket-description" label="Description" hint="Optional context shown alongside the basket in the knowledge base.">{(props) => <Textarea {...props} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
          <div className="knowledge-form-grid">
            <Field id="basket-order" label="Display order" required hint="Lower numbers appear first.">{(props) => <Input {...props} type="number" min={0} step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />}</Field>
            {existing ? <Field id="basket-status" label="Status">{(props) => <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}</Field> : null}
          </div>
        </div>
        <div className="knowledge-dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" busy={mutation.isPending} disabled={!name.trim() || !Number.isInteger(Number(displayOrder)) || Number(displayOrder) < 0}>{existing ? "Save basket" : "Add main basket"}</Button></div>
      </form>
    </Dialog>
  );
}

function ArchiveBasketDialog({ basket, reason, onReasonChange, onClose, onArchived }: {
  readonly basket: KnowledgeBasket;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onArchived: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: () => archiveKnowledgeBasket(basket.id, { expectedVersion: basket.version, reason: reason.trim() }),
    onSuccess: onArchived
  });
  const error = mutation.error instanceof ApiError && mutation.error.code === "VERSION_CONFLICT" ? "This basket changed elsewhere. Refresh the list before retrying." : mutation.error?.message ?? null;
  return <KnowledgeLifecycleDialog action="archive" reason={reason} onReasonChange={onReasonChange} onClose={onClose} onConfirm={() => mutation.mutate()} busy={mutation.isPending} error={error} />;
}

function CreateItemDialog({ baskets, onClose, onCreated }: {
  readonly baskets: readonly { id: string; name: string }[];
  readonly onClose: () => void;
  readonly onCreated: (mainLineId: string) => Promise<void>;
}) {
  const [basketId, setBasketId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useMutation({
    mutationFn: () => createKnowledgeMainLine(basketId, { name, description: description.trim() || null }),
    onSuccess: (item) => onCreated(item.mainLineId)
  });
  return (
    <Dialog title="Add estimation item" eyebrow="Estimation configuration" onClose={onClose} busy={mutation.isPending}>
      <form className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <div className="knowledge-dialog-body">
          {mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
          {baskets.length === 0 ? <InlineMessage tone="warning">Add a main basket before creating an estimation item.</InlineMessage> : null}
          <Field id="item-basket" label="Main basket" required>{(props) => <Select {...props} value={basketId} onChange={(event) => setBasketId(event.target.value)}><option value="">Select a basket</option>{baskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</Select>}</Field>
          <Field id="item-name" label="Main Line name" required>{(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field id="item-description" label="Description" hint="Optional context for estimators reviewing this item.">{(props) => <Textarea {...props} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
        </div>
        <div className="knowledge-dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" busy={mutation.isPending} disabled={!basketId || !name.trim()}>Add estimation item</Button></div>
      </form>
    </Dialog>
  );
}
