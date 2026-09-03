import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  ListTree,
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  getKnowledgeBasketDeletionImpact,
  listKnowledgeBaskets,
  listKnowledgeItems,
  listKnowledgeMasters,
  permanentlyDeleteKnowledgeBasket,
  updateKnowledgeBasket,
  type KnowledgeListParams
} from "./knowledgeApi";
import { syncKnowledgeBasketDeletion } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KNOWLEDGE_ITEM_STATUS_LABELS } from "./knowledgePresentation";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import type {
  KnowledgeBasket,
  KnowledgeBasketDeletionImpact,
  KnowledgeItemListItem,
  KnowledgeItemStatus,
  KnowledgeMaster,
  KnowledgeMasterStatus,
  KnowledgeMasterType,
  KnowledgePermanentDeleteBasketResult
} from "./knowledgeTypes";
import "./ai-estimator-knowledge.css";

/*
 * Priority is hidden on the Main Line cards for now and will be switched back
 * on if it is needed. Flip this to true to restore the row. The Priority filter
 * below is deliberately unaffected, and Recommendation rows still require a
 * Priority, so the master itself stays in use.
 */
const ITEM_CARD_PRIORITY_ENABLED = false;

const PAGE_SIZE = 20;
const BASKET_MANAGEMENT_PAGE_SIZE = 100;
const FILTER_MASTER_TYPES = [
  "priorities",
  "modes",
  "surfaces",
  "uoms",
  "vendors"
] as const satisfies readonly KnowledgeMasterType[];

type FilterState = Omit<KnowledgeListParams, "limit" | "offset">;

/* Everything except the always-visible search box lives behind the "Filters" disclosure. */
const ADVANCED_FILTER_KEYS = [
  "basketId",
  "status",
  "priorityId",
  "modeId",
  "surfaceId",
  "uomId",
  "vendorId"
] as const satisfies readonly (keyof FilterState)[];

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
  const [basketManagerOpen, setBasketManagerOpen] = useState(false);
  const [basketEditor, setBasketEditor] = useState<KnowledgeBasket | null>(null);
  const [basketArchive, setBasketArchive] = useState<KnowledgeBasket | null>(null);
  const [basketDelete, setBasketDelete] = useState<KnowledgeBasket | null>(null);
  const [basketArchiveReason, setBasketArchiveReason] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [collapsedBaskets, setCollapsedBaskets] = useState<readonly string[]>([]);
  const manageBasketsButtonRef = useRef<HTMLButtonElement>(null);

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
  const canManageBaskets = auth.user?.role === "super_admin" && canLifecycle;
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
      queryKey: type === "surfaces"
        ? knowledgeQueryKeys.masterCatalog(type)
        : knowledgeQueryKeys.masterList(type, { limit: 100, offset: 0 }),
      queryFn: () => type === "surfaces"
        ? collectAllKnowledgeMasterPages(
            (params) => listKnowledgeMasters(type, {
              ...params,
              includeArchived: true
            }),
            "Surface"
          )
        : listKnowledgeMasters(type, { limit: 100, offset: 0 })
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
  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);
  /* Unfiltered, every live basket gets a card even with no items yet — otherwise
     a freshly configured basket is invisible until its first item exists. */
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { basketName: string; items: KnowledgeItemListItem[] }>();
    if (!hasActiveFilters) {
      for (const basket of basketsQuery.data?.items ?? []) {
        if (basket.status === "archived") continue;
        groups.set(basket.id, { basketName: basket.name, items: [] });
      }
    }
    for (const item of itemsQuery.data?.items ?? []) {
      const group = groups.get(item.basketId) ?? {
        basketName: item.basketName,
        items: []
      };
      group.items.push(item);
      groups.set(item.basketId, group);
    }
    return [...groups.entries()];
  }, [itemsQuery.data?.items, basketsQuery.data?.items, hasActiveFilters]);
  const total = itemsQuery.data?.pagination.total ?? 0;
  const advancedFilterCount = ADVANCED_FILTER_KEYS.filter((key) => filters[key]).length;
  const appliedChips = useMemo(() => {
    const baskets = basketsQuery.data?.items ?? [];
    const chips: { key: keyof FilterState; label: string; value: string }[] = [];
    if (appliedFilters.search) {
      chips.push({ key: "search", label: "Search", value: appliedFilters.search });
    }
    if (appliedFilters.basketId) {
      chips.push({
        key: "basketId",
        label: "Basket",
        value: baskets.find(({ id }) => id === appliedFilters.basketId)?.name ?? "Unavailable"
      });
    }
    if (appliedFilters.status) {
      chips.push({
        key: "status",
        label: "Status",
        value: KNOWLEDGE_ITEM_STATUS_LABELS[appliedFilters.status]
      });
    }
    for (const type of FILTER_MASTER_TYPES) {
      const key = filterKey(type);
      const value = appliedFilters[key];
      if (!value) continue;
      chips.push({ key, label: filterLabel(type), value: nameFor(masters[type], value) });
    }
    return chips;
  }, [appliedFilters, basketsQuery.data?.items, masters]);

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

  function removeFilter(key: keyof FilterState) {
    const cleared = key === "status" ? undefined : "";
    setFilters((current) => ({ ...current, [key]: cleared }));
    setAppliedFilters((current) => ({ ...current, [key]: cleared }));
    setOffset(0);
  }

  function toggleBasket(basketId: string) {
    setCollapsedBaskets((current) =>
      current.includes(basketId)
        ? current.filter((id) => id !== basketId)
        : [...current, basketId]
    );
  }

  function returnFocusToBasketManagerButton() {
    window.setTimeout(() => manageBasketsButtonRef.current?.focus(), 0);
  }

  function closeBasketManager() {
    setBasketManagerOpen(false);
    returnFocusToBasketManagerButton();
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
            {canManageBaskets ? (
              <Button
                ref={manageBasketsButtonRef}
                variant="secondary"
                leadingIcon={<ListTree />}
                onClick={() => setBasketManagerOpen(true)}
              >
                Manage main baskets
              </Button>
            ) : null}
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
      {announcement ? (
        <p className="sr-only" role="status">
          {announcement}
        </p>
      ) : null}

      {basketsQuery.isError || masterQueries.some(({ isError }) => isError) ? (
        <InlineMessage tone="warning" title="Some filters are unavailable">
          Knowledge items remain available, but one or more reusable-value filters could not be loaded.
        </InlineMessage>
      ) : null}

      <Surface as="section" className="knowledge-filter-panel" variant="subtle">
        <form onSubmit={applyFilters}>
          <div className="knowledge-search-bar">
            <Field
              id="knowledge-search"
              className="knowledge-search-bar__field"
              label="Search Basket or Main Line"
            >
              {(controlProps) => (
                <div className="knowledge-search-control">
                  <Search className="knowledge-search-control__icon" aria-hidden="true" />
                  <Input
                    {...controlProps}
                    type="search"
                    placeholder="Search by basket or main line name"
                    value={filters.search ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, search: event.target.value }))
                    }
                  />
                </div>
              )}
            </Field>
            <div className="knowledge-search-bar__actions">
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<SlidersHorizontal />}
                aria-expanded={advancedFiltersOpen}
                aria-controls="knowledge-advanced-filters"
                onClick={() => setAdvancedFiltersOpen((open) => !open)}
              >
                Filters
                {advancedFilterCount > 0 ? (
                  <span className="knowledge-filter-count" aria-hidden="true">
                    {advancedFilterCount}
                  </span>
                ) : null}
              </Button>
              <Button type="submit">Search</Button>
            </div>
          </div>

          {appliedChips.length > 0 ? (
            <div className="knowledge-filter-chips">
              <span className="knowledge-filter-chips__label">Applied</span>
              <ul aria-label="Applied filters">
                {appliedChips.map((chip) => (
                  <li key={chip.key} className="knowledge-chip">
                    <span className="knowledge-chip__label">{chip.label}</span>
                    <span className="knowledge-chip__value">{chip.value}</span>
                    <button
                      type="button"
                      className="knowledge-chip__remove"
                      aria-label={`Remove ${chip.label} filter`}
                      onClick={() => removeFilter(chip.key)}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button type="button" size="compact" variant="quiet" onClick={resetFilters}>
                Clear all
              </Button>
            </div>
          ) : null}

          <div
            id="knowledge-advanced-filters"
            className="knowledge-advanced-filters"
            hidden={!advancedFiltersOpen}
          >
            <div className="knowledge-filter-grid">
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
                options={masters[type]
                  .filter((master) => type !== "surfaces" || master.status === "active")
                  .map(({ id, name }) => ({ id, name }))}
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
            hasActiveFilters
              ? "No estimation items match these filters."
              : "No main baskets have been added yet."
          }
          action={
            canCreate
              ? hasActiveFilters
                ? { label: "Add estimation item", onAction: () => setItemDialogOpen(true) }
                : { label: "Add main basket", onAction: () => setBasketDialogOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="knowledge-basket-groups" aria-label="Knowledge items">
          {groupedItems.map(([basketId, group]) => {
            const expanded = !collapsedBaskets.includes(basketId);
            const panelId = `knowledge-basket-panel-${basketId}`;
            return (
            <Surface
              key={basketId}
              as="section"
              className="knowledge-basket-group knowledge-basket-panel"
              data-expanded={expanded || undefined}
            >
              <div className="knowledge-section-heading knowledge-basket-panel__header">
                <h2 className="knowledge-basket-panel__title">
                  <button
                    type="button"
                    className="knowledge-basket-panel__toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleBasket(basketId)}
                  >
                    <ChevronDown className="knowledge-basket-panel__chevron" aria-hidden="true" />
                    <span>{group.basketName}</span>
                  </button>
                </h2>
                <div className="knowledge-basket-panel__meta">
                  <span className="knowledge-count-pill">
                    {group.items.length} {group.items.length === 1 ? "item" : "items"}
                  </span>
                  <div className="knowledge-row-actions">
                    {/* The count pill beside it already reports an empty basket, so
                        this is the only prompt the basket needs. The name is spoken
                        but not shown: several baskets each offer this command, and
                        "Add estimation item" alone would name them all alike. */}
                    {canCreate ? <Button size="compact" variant="secondary" leadingIcon={<Plus />} onClick={() => setItemDialogOpen(true)}>Add estimation item<span className="sr-only"> to {group.basketName}</span></Button> : null}
                    {canUpdate ? <Button size="compact" variant="quiet" leadingIcon={<Pencil />} onClick={() => setBasketEditor((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null)}>Edit basket</Button> : null}
                    {canLifecycle ? <Button size="compact" variant="destructive-outline" leadingIcon={<Archive />} onClick={() => { setBasketArchive((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null); setBasketArchiveReason(""); }}>Archive basket</Button> : null}
                  </div>
                </div>
              </div>
              <div id={panelId} className="knowledge-basket-panel__body" hidden={!expanded}>
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
                      {ITEM_CARD_PRIORITY_ENABLED ? <div><dt>Priority</dt><dd>{nameFor(masters.priorities, item.priorityId)}</dd></div> : null}
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
              </div>
            </Surface>
            );
          })}
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
      {basketManagerOpen ? (
        <MainBasketManagementDialog
          canUpdate={canUpdate}
          onClose={closeBasketManager}
          onEdit={setBasketEditor}
          onArchive={(basket) => {
            setBasketArchive(basket);
            setBasketArchiveReason("");
          }}
          onDelete={setBasketDelete}
          childDialogOpen={Boolean(basketEditor || basketArchive || basketDelete)}
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
      {basketDelete ? (
        <PermanentDeleteBasketDialog
          basket={basketDelete}
          onClose={() => setBasketDelete(null)}
          onDeleted={async (result, basketName) => {
            await syncKnowledgeBasketDeletion(queryClient, result.basketId);
            setAnnouncement(`Main basket “${basketName}” was permanently deleted.`);
            setBasketDelete(null);
            setBasketManagerOpen(false);
            returnFocusToBasketManagerButton();
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

function masterStatusTone(status: KnowledgeMasterStatus): StatusTone {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "neutral";
}

function masterStatusLabel(status: KnowledgeMasterStatus): string {
  return status === "active" ? "Active" : status === "inactive" ? "Inactive" : "Archived";
}

function MainBasketManagementDialog({
  canUpdate,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  childDialogOpen
}: {
  readonly canUpdate: boolean;
  readonly onClose: () => void;
  readonly onEdit: (basket: KnowledgeBasket) => void;
  readonly onArchive: (basket: KnowledgeBasket) => void;
  readonly onDelete: (basket: KnowledgeBasket) => void;
  readonly childDialogOpen: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusResultsAfterNavigationRef = useRef(false);
  const params = {
    includeArchived: true,
    limit: BASKET_MANAGEMENT_PAGE_SIZE,
    offset
  } as const;
  const basketsQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketList(params),
    queryFn: () => listKnowledgeBaskets(params),
    retry: false
  });

  useEffect(() => {
    if (basketsQuery.isFetching || !focusResultsAfterNavigationRef.current) return;
    focusResultsAfterNavigationRef.current = false;
    resultsRef.current?.focus();
  }, [basketsQuery.isFetching]);

  function goToOffset(nextOffset: number) {
    focusResultsAfterNavigationRef.current = true;
    setOffset(Math.max(0, nextOffset));
  }

  return (
    <Dialog
      title="Manage main baskets"
      eyebrow="Estimation configuration"
      description="Edit or archive existing baskets. Permanent deletion is limited to custom baskets with no items or historical references."
      onClose={onClose}
      contentInert={childDialogOpen}
    >
      <div className="knowledge-dialog-body knowledge-basket-manager">
        <div
          ref={resultsRef}
          className="knowledge-basket-manager__results"
          tabIndex={-1}
          aria-busy={basketsQuery.isFetching || undefined}
        >
          {basketsQuery.isPending ? (
            <PageState state="loading" message="Loading main baskets…" />
          ) : basketsQuery.isError ? (
            <PageState
              state="error"
              message={errorMessage(basketsQuery.error)}
              action={{ label: "Try again", onAction: () => void basketsQuery.refetch() }}
            />
          ) : (
            <>
              {basketsQuery.data.items.length === 0 ? (
                <PageState
                  state="empty"
                  message={offset === 0
                    ? "No main baskets have been added yet."
                    : "No main baskets are available on this page."}
                />
              ) : (
                <ul className="knowledge-basket-manager__list" aria-label="Main baskets">
                  {basketsQuery.data.items.map((basket) => (
                    <li key={basket.id} className="knowledge-basket-manager__row">
                      <div className="knowledge-basket-manager__summary">
                        <div>
                          <h3>{basket.name}</h3>
                          <p>{basket.description ?? "No description provided."}</p>
                        </div>
                        <StatusBadge
                          label={masterStatusLabel(basket.status)}
                          tone={masterStatusTone(basket.status)}
                        />
                      </div>
                      <div className="knowledge-basket-manager__actions">
                        {canUpdate && basket.status !== "archived" ? (
                          <Button
                            size="compact"
                            variant="quiet"
                            leadingIcon={<Pencil />}
                            aria-label={`Edit ${basket.name}`}
                            onClick={() => onEdit(basket)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {basket.status !== "archived" ? (
                          <Button
                            size="compact"
                            variant="destructive-outline"
                            leadingIcon={<Archive />}
                            aria-label={`Archive ${basket.name}`}
                            onClick={() => onArchive(basket)}
                          >
                            Archive
                          </Button>
                        ) : null}
                        <Button
                          size="compact"
                          variant="destructive-outline"
                          leadingIcon={<Trash2 />}
                          aria-label={`Delete ${basket.name} permanently`}
                          onClick={() => onDelete(basket)}
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {offset > 0 || basketsQuery.data.pagination.hasMore ? (
                <nav
                  className="knowledge-pagination knowledge-basket-manager__pagination"
                  aria-label="Main basket pages"
                >
                  <Button
                    variant="secondary"
                    aria-label="Previous basket page"
                    disabled={offset === 0 || basketsQuery.isFetching}
                    onClick={() => goToOffset(offset - BASKET_MANAGEMENT_PAGE_SIZE)}
                  >
                    Previous
                  </Button>
                  <span>
                    {basketsQuery.data.pagination.total === 0
                      ? 0
                      : basketsQuery.data.pagination.offset + 1}
                    –{Math.min(
                      basketsQuery.data.pagination.offset + basketsQuery.data.items.length,
                      basketsQuery.data.pagination.total
                    )} of {basketsQuery.data.pagination.total}
                  </span>
                  <Button
                    variant="secondary"
                    aria-label="Next basket page"
                    disabled={!basketsQuery.data.pagination.hasMore || basketsQuery.isFetching}
                    onClick={() => goToOffset(offset + BASKET_MANAGEMENT_PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="knowledge-dialog-actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}

function PermanentDeleteBasketDialog({
  basket,
  onClose,
  onDeleted
}: {
  readonly basket: KnowledgeBasket;
  readonly onClose: () => void;
  readonly onDeleted: (
    result: KnowledgePermanentDeleteBasketResult,
    basketName: string
  ) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [confirmationName, setConfirmationName] = useState("");
  const [reason, setReason] = useState("");
  const [conflictRefresh, setConflictRefresh] = useState<
    "none" | "refreshed" | "failed"
  >("none");
  const [requiresFreshImpact, setRequiresFreshImpact] = useState(false);
  const impactQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketDeletionImpact(basket.id),
    queryFn: () => getKnowledgeBasketDeletionImpact(basket.id),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always"
  });
  const impact = impactQuery.data;

  async function refreshImpact(): Promise<boolean> {
    setRequiresFreshImpact(true);
    const refreshed = await impactQuery.refetch();
    const succeeded = refreshed.isSuccess;
    setRequiresFreshImpact(!succeeded);
    return succeeded;
  }

  async function retryImpact() {
    const succeeded = await refreshImpact();
    if (conflictRefresh !== "none") {
      setConflictRefresh(succeeded ? "refreshed" : "failed");
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!impact) throw new Error("Deletion impact is unavailable.");
      return permanentlyDeleteKnowledgeBasket(basket.id, {
        expectedVersion: impact.version,
        confirmationName,
        reason: reason.trim()
      });
    },
    onSuccess: (result) => onDeleted(result, impact?.basketName ?? basket.name),
    onError: async (error) => {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setConfirmationName("");
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() });
        setConflictRefresh(await refreshImpact() ? "refreshed" : "failed");
      } else if (error instanceof ApiError && error.code === "BASKET_DELETE_BLOCKED") {
        setConfirmationName("");
        await refreshImpact();
      }
    }
  });
  const busy = impactQuery.isFetching || mutation.isPending || requiresFreshImpact;
  const nameMatches = Boolean(impact && confirmationName === impact.basketName);
  const canSubmit = Boolean(
    impact?.canDelete && nameMatches && reason.trim() && !busy && !impactQuery.isError
  );
  const mutationError = mutation.error;
  const mutationErrorMessage =
    mutationError instanceof ApiError && mutationError.code === "VERSION_CONFLICT"
      ? null
      : mutationError?.message ?? null;

  return (
    <Dialog
      title="Delete main basket permanently?"
      eyebrow="Irrecoverable action"
      description={`This can permanently remove only the “${impact?.basketName ?? basket.name}” basket. It never deletes estimation items or history.`}
      onClose={onClose}
      busy={mutation.isPending}
      role="alertdialog"
    >
      <form
        className="knowledge-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div className="knowledge-dialog-body knowledge-basket-delete">
          {impactQuery.isPending ? (
            <PageState state="loading" message="Checking whether this basket can be deleted…" />
          ) : impactQuery.isError ? (
            <PageState
              state="error"
              message={errorMessage(impactQuery.error)}
              action={{
                label: "Retry impact check",
                onAction: () => void retryImpact()
              }}
            />
          ) : impact ? (
            <BasketDeletionImpactSummary impact={impact} />
          ) : null}

          {conflictRefresh === "refreshed" ? (
            <InlineMessage tone="warning" title="Basket changed">
              Review the refreshed impact and enter the exact current basket name again. The deletion was not retried.
            </InlineMessage>
          ) : null}
          {conflictRefresh === "failed" ? (
            <InlineMessage tone="error" title="Impact refresh failed" role="alert">
              This basket changed, but its latest deletion impact could not be loaded. Retry the impact check before continuing.
            </InlineMessage>
          ) : null}
          {mutationErrorMessage ? (
            <InlineMessage tone="error" role="alert">
              {mutationErrorMessage}
            </InlineMessage>
          ) : null}

          {impact ? (
            <>
              <Field
                id="basket-delete-confirmation-name"
                label="Type basket name to confirm"
                hint={<>Enter <strong>{impact.basketName}</strong> exactly, including spaces and capitalization.</>}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    autoComplete="off"
                    maxLength={240}
                    value={confirmationName}
                    onChange={(event) => setConfirmationName(event.target.value)}
                  />
                )}
              </Field>
              <Field
                id="basket-delete-reason"
                label="Reason"
                hint="Recorded in the audit history for this permanent change."
                required
              >
                {(props) => (
                  <Textarea
                    {...props}
                    maxLength={1_000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
            </>
          ) : null}
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            busy={mutation.isPending}
            busyLabel="Deleting…"
            disabled={!canSubmit}
          >
            Delete permanently
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BasketDeletionImpactSummary({ impact }: {
  readonly impact: KnowledgeBasketDeletionImpact;
}) {
  return (
    <div className="knowledge-basket-delete__impact">
      <dl>
        <div>
          <dt>Main Lines</dt>
          <dd>{impact.mainLineCount}</dd>
        </div>
        <div>
          <dt>Historical references</dt>
          <dd>{impact.historicalReferenceCount}</dd>
        </div>
        <div>
          <dt>Bootstrap owned</dt>
          <dd>{impact.bootstrapOwned ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {!impact.canDelete ? (
        <InlineMessage tone="error" title="Permanent deletion is blocked" role="alert">
          <p>This basket is archive-only for the following reason{impact.blockers.length === 1 ? "" : "s"}:</p>
          <ul>
            {impact.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </InlineMessage>
      ) : (
        <InlineMessage tone="warning" title="This action cannot be undone">
          The basket is empty and unreferenced. Only its Basket record will be deleted.
        </InlineMessage>
      )}
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
  const [displayOrder, setDisplayOrder] = useState(String(existing?.displayOrder ?? ""));
  const [status, setStatus] = useState<"active" | "inactive">(existing?.status === "inactive" ? "inactive" : "active");
  const displayOrderValid = !existing || (
    displayOrder.trim() !== "" &&
    Number.isSafeInteger(Number(displayOrder)) &&
    Number(displayOrder) >= 0
  );
  const mutation = useMutation({
    mutationFn: () => existing
      ? updateKnowledgeBasket(existing.id, { expectedVersion: existing.version, name, description: description.trim() || null, displayOrder: Number(displayOrder), status })
      : createKnowledgeBasket({ name, description: description.trim() || null }),
    onSuccess: onCreated
  });
  return (
    <Dialog title={existing ? "Edit main basket" : "Add main basket"} eyebrow="Estimation configuration" onClose={onClose} busy={mutation.isPending}>
      <form className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <div className="knowledge-dialog-body">
          {mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
          <Field id="basket-name" label="Basket name" required>{(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field id="basket-description" label="Description" hint="Optional context shown alongside the basket in the knowledge base.">{(props) => <Textarea {...props} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
          {existing ? (
            <div className="knowledge-form-grid">
              <Field id="basket-order" label="Display order" required hint="Lower numbers appear first.">{(props) => <Input {...props} type="number" min={0} step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />}</Field>
              <Field id="basket-status" label="Status">{(props) => <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}</Field>
            </div>
          ) : null}
        </div>
        <div className="knowledge-dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" busy={mutation.isPending} disabled={!name.trim() || !displayOrderValid}>{existing ? "Save basket" : "Add main basket"}</Button></div>
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
