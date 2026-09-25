import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  ChevronDown,
  Layers,
  ListTree,
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import {
  createKnowledgeBasket,
  getKnowledgeBasketDeletionImpact,
  listKnowledgeBaskets,
  listKnowledgeItems,
  listKnowledgeMasters,
  permanentlyDeleteKnowledgeBasket,
  updateKnowledgeBasket,
  type KnowledgeListParams
} from "./knowledgeApi";
import { syncKnowledgeBasketDeletion, syncKnowledgeBasketMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KNOWLEDGE_ITEM_STATUS_LABELS } from "./knowledgePresentation";
import { KnowledgeBasketManagementDialog } from "./KnowledgeBasketManagementDialog";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { KnowledgeIndexItemCard } from "./KnowledgeIndexItemCard";
import type { CatalogState } from "./knowledgeIndexPresentation";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import type {
  KnowledgeBasket,
  KnowledgeBasketDeletionImpact,
  KnowledgeItemListItem,
  KnowledgeItemStatus,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgePermanentDeleteBasketResult
} from "./knowledgeTypes";
import "./ai-estimator-knowledge.css";
import "./knowledge-configuration-ui.css";
import "./knowledge-index.css";

const PAGE_SIZE = 20;
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
  const [basketDelete, setBasketDelete] = useState<KnowledgeBasket | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [temporaryBasketId, setTemporaryBasketId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [collapsedBaskets, setCollapsedBaskets] = useState<readonly string[]>([]);
  /* Component state only: the safety notice returns on the next visit. */
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const manageBasketsButtonRef = useRef<HTMLButtonElement>(null);
  const filterCountDescriptionId = useId();

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
  const canManageBaskets = auth.user?.role === "super_admin" && (canCreate || canUpdate || canLifecycle);
  const canCreateBasketInline = auth.user?.role === "super_admin" && canCreate;
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
  /* Cards resolve unit and priority names from these two catalogs, so they share
     one state: still loading while either loads, degraded when either failed. */
  const priorityCatalogQuery = masterQueries[FILTER_MASTER_TYPES.indexOf("priorities")];
  const uomCatalogQuery = masterQueries[FILTER_MASTER_TYPES.indexOf("uoms")];
  const cardCatalogState: CatalogState =
    priorityCatalogQuery.isPending || uomCatalogQuery.isPending
      ? "loading"
      : priorityCatalogQuery.isError || uomCatalogQuery.isError
        ? "error"
        : "ready";
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

  function dismissNotice() {
    setNoticeDismissed(true);
    window.setTimeout(() => document.getElementById("knowledge-search")?.focus(), 0);
  }

  function returnFocusToBasketManagerButton() {
    window.setTimeout(() => manageBasketsButtonRef.current?.focus(), 0);
  }

  function closeBasketManager() {
    setBasketManagerOpen(false);
    returnFocusToBasketManagerButton();
  }

  return (
    <div className="knowledge-page knowledge-page--index">
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
                Manage baskets
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
              <Button
                variant="secondary"
                leadingIcon={<Plus />}
                onClick={() => setTemporaryBasketId("")}
              >
                Add temporary item
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
      {noticeDismissed ? null : (
        <KnowledgeSafetyNotice onDismiss={dismissNotice} />
      )}
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
              <span className="knowledge-filter-action-wrap">
                <IconButton
                  type="button"
                  variant="secondary"
                  className="knowledge-search-action"
                  label="Filters"
                  tooltip="Filters"
                  icon={<SlidersHorizontal aria-hidden="true" />}
                  aria-expanded={advancedFiltersOpen}
                  aria-controls="knowledge-advanced-filters"
                  aria-describedby={advancedFilterCount > 0 ? filterCountDescriptionId : undefined}
                  onClick={() => setAdvancedFiltersOpen((open) => !open)}
                />
                {advancedFilterCount > 0 ? (
                  <>
                    <span className="knowledge-filter-count" aria-hidden="true">
                      {advancedFilterCount}
                    </span>
                    <span className="sr-only" id={filterCountDescriptionId}>
                      {advancedFilterCount} {advancedFilterCount === 1 ? "filter" : "filters"} selected
                    </span>
                  </>
                ) : null}
              </span>
              <IconButton
                type="submit"
                className="knowledge-search-action"
                label="Search"
                tooltip="Search"
                icon={<Search aria-hidden="true" />}
              />
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
            /* A filtered group whose basket record is not loaded has no description. */
            const basketDescription = (basketsQuery.data?.items ?? [])
              .find(({ id }) => id === basketId)?.description?.trim();
            return (
            <Surface
              key={basketId}
              as="section"
              className="knowledge-basket-group knowledge-basket-panel"
              data-expanded={expanded || undefined}
            >
              <div className="knowledge-section-heading knowledge-basket-panel__header">
                <span className="knowledge-basket-panel__icon" aria-hidden="true">
                  <Layers />
                </span>
                <div className="knowledge-basket-panel__heading">
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
                  {basketDescription ? (
                    <p className="knowledge-basket-panel__description">{basketDescription}</p>
                  ) : null}
                </div>
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
                    {canCreate ? <Button size="compact" variant="secondary" leadingIcon={<Plus />} onClick={() => setTemporaryBasketId(basketId)}>Add temporary item<span className="sr-only"> to {group.basketName}</span></Button> : null}
                    {/* Icon-only: the name carries the basket, the tooltip the command. */}
                    {canUpdate ? (
                      <Button
                        variant="quiet"
                        className="knowledge-icon-action"
                        aria-label={`Edit basket ${group.basketName}`}
                        title="Edit basket"
                        leadingIcon={<Pencil />}
                        onClick={() => setBasketEditor((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null)}
                      />
                    ) : null}
                    {canLifecycle ? (
                      <Button
                        variant="destructive-outline"
                        className="knowledge-icon-action knowledge-icon-action--danger"
                        aria-label={`Delete ${group.basketName}`}
                        title="Delete basket"
                        leadingIcon={<Trash2 />}
                        onClick={() => setBasketDelete((basketsQuery.data?.items ?? []).find(({ id }) => id === basketId) ?? null)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              <div id={panelId} className="knowledge-basket-panel__body" hidden={!expanded}>
              <div className="knowledge-item-grid">
                {group.items.map((item) => (
                  <KnowledgeIndexItemCard
                    key={item.id}
                    item={item}
                    uoms={masters.uoms}
                    priorities={masters.priorities}
                    catalogState={cardCatalogState}
                    onOpen={() => navigate(`/admin/configuration/estimation/items/${encodeURIComponent(item.mainLineId)}`)}
                  />
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
          onCreated={async (basket) => {
            await syncKnowledgeBasketMutation(queryClient, basket);
            setBasketDialogOpen(false);
          }}
        />
      ) : null}
      {basketManagerOpen ? (
        <KnowledgeBasketManagementDialog
          canCreate={canCreate}
          onCreate={() => setBasketDialogOpen(true)}
          canUpdate={canUpdate}
          canLifecycle={canLifecycle}
          onClose={closeBasketManager}
          onEdit={setBasketEditor}
          onDelete={setBasketDelete}
          childDialogOpen={Boolean(basketDialogOpen || basketEditor || basketDelete)}
        />
      ) : null}
      {basketEditor ? (
        <BasketEditorDialog
          existing={basketEditor}
          onClose={() => setBasketEditor(null)}
          onCreated={async (basket) => {
            await syncKnowledgeBasketMutation(queryClient, basket);
            setAnnouncement(`Main basket renamed to “${basket.name}”.`);
            setBasketEditor(null);
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
            /* Only return focus to the manager if the deletion started there. */
            if (basketManagerOpen) {
              setBasketManagerOpen(false);
              returnFocusToBasketManagerButton();
            }
          }}
        />
      ) : null}
      {temporaryBasketId !== null && <CreateKnowledgeItemDialog itemType="temporary" initialBasketId={temporaryBasketId}
        canCreateBasket={canCreateBasketInline}
        onClose={() => setTemporaryBasketId(null)} onCreated={async (id) => {
          setTemporaryBasketId(null);
          navigate(`/admin/configuration/estimation/items/${encodeURIComponent(id)}`);
        }} />}
      {itemDialogOpen ? (
        <CreateKnowledgeItemDialog
          canCreateBasket={canCreateBasketInline}
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
  const [saved, setSaved] = useState<KnowledgePermanentDeleteBasketResult | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [conflictRefresh, setConflictRefresh] = useState<
    "none" | "refreshed" | "failed"
  >("none");
  const [requiresFreshImpact, setRequiresFreshImpact] = useState(false);
  const impactQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketDeletionImpact(basket.id),
    queryFn: () => getKnowledgeBasketDeletionImpact(basket.id),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    enabled: !saved
  });
  const impact = impactQuery.data;

  async function finishDeletion(result: KnowledgePermanentDeleteBasketResult) {
    setRefreshing(true);
    setRefreshError("");
    try {
      await onDeleted(result, impact?.basketName ?? basket.name);
    } catch {
      setRefreshError("The Main Basket was permanently deleted, but the catalog could not refresh. Retry the refresh; deletion will not run again.");
    } finally { setRefreshing(false); }
  }

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
    onSuccess: async (result) => { setSaved(result); await finishDeletion(result); },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setConfirmationName("");
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() });
        setConflictRefresh(await refreshImpact() ? "refreshed" : "failed");
      }
    }
  });
  const busy = impactQuery.isFetching || mutation.isPending || requiresFreshImpact || refreshing;
  const nameMatches = Boolean(impact && confirmationName === impact.basketName);
  const canSubmit = Boolean(
    impact && !(impact.vendorReferenceCount ?? 0) && nameMatches && reason.trim() && !busy && !impactQuery.isError && !saved
  );
  const mutationError = mutation.error;
  const mutationErrorMessage =
    mutationError instanceof ApiError && mutationError.code === "VERSION_CONFLICT"
      ? null
      : mutationError?.message ?? null;

  return (
    <Dialog
      title="Delete basket?"
      eyebrow="Irrecoverable action"
      description={`“${impact?.basketName ?? basket.name}” and everything inside it will be permanently deleted. This cannot be undone.`}
      onClose={onClose}
      busy={mutation.isPending || refreshing}
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
          {refreshError ? <InlineMessage tone="warning" title="Main Basket deleted" role="status">{refreshError}</InlineMessage> : null}
          {!saved && impactQuery.isPending ? (
            <PageState state="loading" message="Checking whether this basket can be deleted…" />
          ) : !saved && impactQuery.isError ? (
            <PageState
              state="error"
              message={errorMessage(impactQuery.error)}
              action={{
                label: "Retry impact check",
                onAction: () => void retryImpact()
              }}
            />
          ) : !saved && impact ? (
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

          {impact && !saved ? (
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
          <Button type="button" variant={saved ? "quiet" : "destructive-outline"} onClick={onClose} disabled={mutation.isPending || refreshing}>
            {saved ? "Done" : "Cancel"}
          </Button>
          {saved ? <Button variant="secondary" busy={refreshing} onClick={() => void finishDeletion(saved)}>Retry catalog refresh</Button> : <Button
            type="submit"
            variant="destructive"
            busy={mutation.isPending}
            busyLabel="Deleting…"
            disabled={!canSubmit}
          >
            Delete
          </Button>}
        </div>
      </form>
    </Dialog>
  );
}

/* Retained vendor classifications block deletion; other references describe its impact. */
function BasketDeletionImpactSummary({ impact }: {
  readonly impact: KnowledgeBasketDeletionImpact;
}) {
  const plural = (count: number, one: string, many: string) => count === 1 ? one : many;
  return (
    <div className="knowledge-basket-delete__impact">
      <dl>
        <div>
          <dt>Main Lines deleted with it</dt>
          <dd>{impact.mainLineCount}</dd>
        </div>
        <div>
          <dt>Sub Baskets to delete</dt>
          <dd>{impact.subBasketCount ?? 0}</dd>
        </div>
        <div>
          <dt>References removed elsewhere</dt>
          <dd>{impact.historicalReferenceCount}</dd>
        </div>
      </dl>
      {(impact.vendorReferenceCount ?? 0) > 0 ? <InlineMessage tone="error" title="Permanent deletion is blocked">{impact.vendorReferenceCount} retained vendors reference this Main Basket. Reassign their classification before deleting it.</InlineMessage> : null}
      <InlineMessage tone="warning" title="This action cannot be undone">
        <p>
          {impact.mainLineCount === 0
            ? (impact.subBasketCount ?? 0) > 0
              ? "Deleting this basket also deletes its Sub Baskets."
              : "This basket is empty. Deleting it removes the basket itself."
            : `Deleting this basket also deletes ${impact.mainLineCount} ${plural(impact.mainLineCount, "Main Line", "Main Lines")} inside it, together with every revision, section and price version they own.`}
        </p>
        {impact.historicalReferenceCount > 0 ? (
          <p>
            {impact.historicalReferenceCount} {plural(impact.historicalReferenceCount, "exclusion or dependency", "exclusions and dependencies")} in other
            configurations point at this basket. {plural(impact.historicalReferenceCount, "It", "They")} will be removed so
            nothing is left pointing at something that no longer exists.
          </p>
        ) : null}
        <p>A Super Admin can add this basket again afterwards; nothing is restored with it.</p>
      </InlineMessage>
      {impact.bootstrapOwned ? (
        <InlineMessage tone="warning" title="Supplied with the system">
          This basket was seeded when the knowledge base was set up. Deleting it is
          permitted, and it will not come back on its own.
        </InlineMessage>
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
  readonly onCreated: (basket: KnowledgeBasket) => Promise<void>;
}) {
  const formId = useId();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(existing?.displayOrder ?? ""));
  const [status, setStatus] = useState<"active" | "inactive">(existing?.status === "inactive" ? "inactive" : "active");
  const [saved, setSaved] = useState<KnowledgeBasket | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const displayOrderValid = !existing || (
    displayOrder.trim() !== "" &&
    Number.isSafeInteger(Number(displayOrder)) &&
    Number(displayOrder) >= 0
  );
  async function finishSave(basket: KnowledgeBasket) {
    setRefreshing(true);
    setRefreshError("");
    try { await onCreated(basket); }
    catch { setRefreshError("The Main Basket was saved, but the catalog could not refresh. Retry the refresh to see the latest list."); }
    finally { setRefreshing(false); }
  }
  const mutation = useMutation({
    mutationFn: () => existing
      ? updateKnowledgeBasket(existing.id, { expectedVersion: existing.version, name, description: description.trim() || null, displayOrder: Number(displayOrder), status })
      : createKnowledgeBasket({ name }),
    onSuccess: async (basket) => { setSaved(basket); await finishSave(basket); }
  });
  const busy = mutation.isPending || refreshing;
  return (
    <ContextPanel title={existing ? "Edit main basket" : "Add main basket"} eyebrow="Estimation configuration" onClose={onClose} busy={busy}
      width="medium"
      className="knowledge-context-panel"
      dirty={!saved && (name !== (existing?.name ?? "") || description !== (existing?.description ?? "") || displayOrder !== String(existing?.displayOrder ?? "") || status !== (existing?.status === "inactive" ? "inactive" : "active"))}
      footer={({ requestClose }) => (<div className="knowledge-dialog-actions"><Button type="button" variant={saved ? "quiet" : "destructive-outline"} onClick={requestClose}>{saved ? "Done" : "Cancel"}</Button>{saved ? <Button variant="secondary" busy={busy} onClick={() => void finishSave(saved)}>Retry catalog refresh</Button> : <Button type="submit" form={formId} busy={busy} disabled={!name.trim() || !displayOrderValid}>{existing ? "Save basket" : "Add main basket"}</Button>}</div>)}>
      <form id={formId} className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); if (!saved && !busy && name.trim() && displayOrderValid) mutation.mutate(); }}>
        <div className="knowledge-dialog-body">
          {refreshError ? <InlineMessage tone="warning" title="Main Basket saved" role="status">{refreshError}</InlineMessage> : null}
          {mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
          <Field id="basket-name" label="Basket name" required>{(props) => <Input {...props} value={name} disabled={busy || Boolean(saved)} onChange={(event) => setName(event.target.value)} />}</Field>
          {existing ? <Field id="basket-description" label="Description" hint="Optional context shown alongside the basket in the knowledge base.">{(props) => <Textarea {...props} value={description} disabled={busy || Boolean(saved)} onChange={(event) => setDescription(event.target.value)} />}</Field> : null}
          {existing ? (
            <div className="knowledge-form-grid">
              <Field id="basket-order" label="Display order" required hint="Lower numbers appear first.">{(props) => <Input {...props} type="number" min={0} step={1} value={displayOrder} disabled={busy || Boolean(saved)} onChange={(event) => setDisplayOrder(event.target.value)} />}</Field>
              <Field id="basket-status" label="Status">{(props) => <Select {...props} value={status} disabled={busy || Boolean(saved)} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}</Field>
            </div>
          ) : null}
        </div>

      </form>
    </ContextPanel>
  );
}
