import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { KnowledgeListParams } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemStatus, KnowledgeMaster, KnowledgeMasterType } from "../../../../shared/knowledge/knowledgeTypes";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Field, StateView } from "../../ui/primitives";
import { KnowledgeBasketDeletion, KnowledgeBasketEditor, KnowledgeCatalogManagement } from "./KnowledgeCatalogManagement";
import { KnowledgeReusableValues } from "./KnowledgeReusableValues";
import { KnowledgeItemWorkspace } from "./KnowledgeItemWorkspace";
import { allKnowledgePages, useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";
import { useScreenBack } from "../../navigation/useScreenBack";
import { KnowledgeCatalogHeader, type KnowledgeCatalogAction } from "./KnowledgeCatalogHeader";
import { KnowledgeBasketCarousel } from "./KnowledgeBasketCarousel";
import { KnowledgeCatalogMenu, type KnowledgeMenuAction, type KnowledgeMenuAnchor } from "./KnowledgeCatalogMenu";

const PAGE_SIZE = 20;
const FILTER_TYPES = ["uoms", "vendors", "priorities", "surfaces", "modes"] as const;
type Filter = "basketId" | "status" | "priorityId" | "modeId" | "surfaceId" | "uomId" | "vendorId";
type Filters = Record<Filter, string>;
const EMPTY_FILTERS: Filters = { basketId: "", status: "", priorityId: "", modeId: "", surfaceId: "", uomId: "", vendorId: "" };
const REFERENCE_FILTERS: readonly { key: Exclude<Filter, "status" | "basketId">; type: KnowledgeMasterType; label: string }[] = [
  { key: "priorityId", type: "priorities", label: "Priority" }, { key: "modeId", type: "modes", label: "Mode" }, { key: "surfaceId", type: "surfaces", label: "Surface" }, { key: "uomId", type: "uoms", label: "UOM" }, { key: "vendorId", type: "vendors", label: "Vendor" }
];

export interface KnowledgeCatalogWorkspaceProps { readonly session: AuthenticatedSession }

export function KnowledgeCatalogWorkspace({ session }: KnowledgeCatalogWorkspaceProps) {
  const context = useKnowledgeContext(session);
  if (!context.canRead) return <StateView title="Configuration access required" message="Your current access does not allow you to read configuration." tone="denied" />;
  return <KnowledgeCatalogContent key={context.scopeKey} session={session} context={context} />;
}

function KnowledgeCatalogContent({ session, context }: KnowledgeCatalogWorkspaceProps & { readonly context: KnowledgeMobileContext }) {
  const back = useScreenBack();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expandedBaskets, setExpandedBaskets] = useState<Readonly<Record<string, boolean>>>({});
  const [menu, setMenu] = useState<{ kind: "basket" | "item"; id: string; anchor: KnowledgeMenuAnchor } | null>(null);
  const [editingBasket, setEditingBasket] = useState<KnowledgeBasket | null>(null);
  const [deletingBasket, setDeletingBasket] = useState<KnowledgeBasket | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createItem, setCreateItem] = useState<{ itemType: "main_line" | "temporary"; basketId: string } | null>(null);
  const [createBasket, setCreateBasket] = useState(false);
  const [management, setManagement] = useState(false);
  const [reusable, setReusable] = useState(false);
  const params: KnowledgeListParams = { search: appliedSearch, ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)), limit: PAGE_SIZE, offset };
  const items = useQuery({ queryKey: context.key("catalog", params), queryFn: () => context.api.listKnowledgeItems(params), enabled: context.ready && context.canRead });
  const baskets = useQuery({ queryKey: context.key("baskets", "catalog"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets(page)), enabled: context.ready && context.canRead });
  const masters = useQuery({ queryKey: context.key("masters", "catalog-filters"), queryFn: async () => Object.fromEntries(await Promise.all(FILTER_TYPES.map(async type => [type, await allKnowledgePages(page => context.api.listKnowledgeMasters(type, { ...page, includeArchived: true }))] as const))) as Record<KnowledgeMasterType, readonly KnowledgeMaster[]>, enabled: context.ready && context.canRead });
  const groups = new Map<string, { basket: KnowledgeBasket | undefined; name: string; items: NonNullable<typeof items.data>["items"][number][] }>();
  const filtered = Boolean(appliedSearch || Object.values(appliedFilters).some(Boolean));
  if (!filtered) for (const basket of baskets.data ?? []) groups.set(basket.id, { basket, name: basket.name, items: [] });
  for (const item of items.data?.items ?? []) {
    const group = groups.get(item.basketId) ?? { basket: baskets.data?.find(basket => basket.id === item.basketId), name: item.basketName, items: [] };
    group.items.push(item); groups.set(item.basketId, group);
  }
  const catalogState = masters.isPending ? "loading" : masters.isError ? "error" : "ready";
  useEffect(() => {
    if (items.isSuccess && !items.isFetching && offset > 0 && offset >= items.data.pagination.total) {
      setOffset(Math.max(0, Math.floor((items.data.pagination.total - 1) / PAGE_SIZE) * PAGE_SIZE));
    }
  }, [items.isSuccess, items.isFetching, items.data, offset]);
  const firstBasketId = groups.keys().next().value;
  const menuBasket = menu?.kind === "basket" ? baskets.data?.find(basket => basket.id === menu.id) : undefined;
  const menuItem = menu?.kind === "item" ? items.data?.items.find(item => item.mainLineId === menu.id) : undefined;
  const menuActions: KnowledgeMenuAction[] = [];
  if (context.ready && context.canRead && menuBasket) {
    if (context.canUpdate && menuBasket.status !== "archived") menuActions.push({ id: "edit", label: "Edit main line", icon: "edit", onPress: () => setEditingBasket(menuBasket) });
    if (context.canCreate && menuBasket.status === "active") {
      menuActions.push({ id: "add", label: "Add estimation item", icon: "add", onPress: () => setCreateItem({ itemType: "main_line", basketId: menuBasket.id }) });
      menuActions.push({ id: "temporary", label: "Add temporary item", icon: "temporary", onPress: () => setCreateItem({ itemType: "temporary", basketId: menuBasket.id }) });
    }
    if (context.canLifecycle) menuActions.push({ id: "delete", label: "Delete main line", icon: "delete", destructive: true, onPress: () => setDeletingBasket(menuBasket) });
  }
  if (context.ready && context.canRead && menuItem) menuActions.push({ id: "open", label: "Open item", icon: "open", onPress: () => setSelectedId(menuItem.mainLineId) });
  if (selectedId) return <KnowledgeItemWorkspace session={session} mainLineId={selectedId} onBack={() => setSelectedId(null)} onOpenItem={setSelectedId} />;
  const apply = () => { setAppliedSearch(search.trim()); setAppliedFilters({ ...filters }); setOffset(0); setFilterOpen(false); };
  function openAction(action: KnowledgeCatalogAction) {
    if (action === "values") setReusable(true);
    else if (action === "baskets") setManagement(true);
    else if (context.canCreate && action === "basket") setCreateBasket(true);
    else if (context.canCreate) setCreateItem({ itemType: action === "temporary" ? "temporary" : "main_line", basketId: "" });
  }
  return <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={items.isRefetching} onRefresh={() => { void context.refresh(); void items.refetch(); void baskets.refetch(); void masters.refetch(); }} />}>
    <KnowledgeCatalogHeader
      search={search} onSearchChange={setSearch} onSearch={apply}
      onFilters={() => { setFilters({ ...appliedFilters }); setFilterOpen(true); }}
      filterCount={Object.values(appliedFilters).filter(Boolean).length}
      canCreate={context.canCreate} onAction={openAction}
      onBack={back.onBack} backVisible={back.visible} backDisabled={back.disabled}
    />
    {filtered ? <Button label="Clear filters" variant="quiet" onPress={() => { setSearch(""); setAppliedSearch(""); setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setOffset(0); }} /> : null}
    {items.isPending ? <KnowledgeText>Loading configuration…</KnowledgeText> : null}
    {items.isError ? <StateView title="Configuration unavailable" message={catalogError(items.error)} actionLabel="Retry configuration" onAction={() => void items.refetch()} /> : null}
    {baskets.isError ? <StateView title="Main baskets unavailable" message="Some basket actions are unavailable until the catalog loads." actionLabel="Retry main baskets" onAction={() => void baskets.refetch()} /> : null}
    <View style={{ gap: 8 }}>
      {Array.from(groups, ([basketId, group]) => {
        const expanded = expandedBaskets[basketId] ?? basketId === firstBasketId;
        const canManage = context.ready && group.basket && ((context.canCreate && group.basket.status === "active") || (context.canUpdate && group.basket.status !== "archived") || context.canLifecycle);
        return <KnowledgeBasketCarousel key={basketId} basketId={basketId} name={group.name} items={group.items} expanded={expanded}
          onToggle={() => setExpandedBaskets(current => ({ ...current, [basketId]: !expanded }))}
          onOpenItem={setSelectedId} onItemMenu={(item, anchor) => setMenu({ kind: "item", id: item.mainLineId, anchor })}
          {...(canManage ? { onBasketMenu: (anchor: KnowledgeMenuAnchor) => setMenu({ kind: "basket", id: basketId, anchor }) } : {})}
          uoms={masters.data?.uoms ?? []} priorities={masters.data?.priorities ?? []} catalogState={catalogState} isLoading={items.isPending} />;
      })}
    </View>
    {items.isSuccess && !groups.size ? <StateView title="No matching items" message="Try another search or clear your filters." /> : null}
    {items.data ? <><KnowledgeText>{items.data.pagination.total ? `Showing ${offset + 1}–${offset + items.data.items.length} of ${items.data.pagination.total}` : "No items"}</KnowledgeText><View style={s.row}><Button label="Previous page" variant="secondary" disabled={offset === 0 || items.isFetching} onPress={() => setOffset(current => Math.max(0, current - PAGE_SIZE))} /><Button label="Next page" variant="secondary" disabled={!items.data.pagination.hasMore || items.isFetching} onPress={() => setOffset(current => current + PAGE_SIZE)} /></View></> : null}
    {menu && menuActions.length > 0 ? <KnowledgeCatalogMenu key={`${menu.kind}:${menu.id}`} name={menuBasket?.name ?? menuItem?.mainLineName ?? "Configuration"} anchor={menu.anchor} actions={menuActions} onClose={() => setMenu(null)} /> : null}
    {editingBasket ? <KnowledgeBasketEditor context={context} basket={editingBasket} onClose={() => setEditingBasket(null)} onSaved={() => { setEditingBasket(null); void baskets.refetch(); }} /> : null}
    {deletingBasket ? <KnowledgeBasketDeletion context={context} basket={deletingBasket} onClose={() => setDeletingBasket(null)} onDeleted={() => { setDeletingBasket(null); setOffset(0); void baskets.refetch(); void items.refetch(); }} /> : null}
    {filterOpen ? <KnowledgeModal title="Configuration filters" onClose={() => setFilterOpen(false)}>
      <KnowledgeSelect label="Main basket" value={filters.basketId} placeholder="All main baskets" options={(baskets.data ?? []).map(value => ({ value: value.id, label: value.name }))} disabled={!baskets.isSuccess} onChange={value => setFilters(current => ({ ...current, basketId: value }))} />
      <KnowledgeSelect label="Item status" value={filters.status} placeholder="All statuses" options={(["draft", "active", "inactive", "archived"] as const).map(value => ({ value, label: value }))} onChange={value => setFilters(current => ({ ...current, status: value as KnowledgeItemStatus }))} />
      {REFERENCE_FILTERS.map(filter => <KnowledgeSelect key={filter.key} label={filter.label} value={filters[filter.key]} placeholder={`All ${filter.label.toLocaleLowerCase()} values`} options={(masters.data?.[filter.type] ?? []).map(value => ({ value: value.id, label: `${value.name}${value.status === "active" ? "" : ` (${value.status})`}` }))} disabled={!masters.isSuccess} onChange={value => setFilters(current => ({ ...current, [filter.key]: value }))} />)}
      {masters.isPending ? <KnowledgeText>Loading all filter options…</KnowledgeText> : null}
      {masters.isError ? <StateView title="Filter options unavailable" message={catalogError(masters.error)} actionLabel="Retry filter options" onAction={() => void masters.refetch()} /> : null}
      <Button label="Apply filters" onPress={apply} />
    </KnowledgeModal> : null}
    {createItem ? <KnowledgeCreateItem context={context} initialBasketId={createItem.basketId} itemType={createItem.itemType} onClose={() => setCreateItem(null)} onCreated={id => { setCreateItem(null); setSelectedId(id); }} /> : null}
    {createBasket ? <KnowledgeBasketEditor context={context} onClose={() => setCreateBasket(false)} onSaved={() => { setCreateBasket(false); void baskets.refetch(); }} /> : null}
    {management ? <KnowledgeCatalogManagement context={context} onClose={() => setManagement(false)} /> : null}
    {reusable ? <KnowledgeReusableValues context={context} onClose={() => setReusable(false)} /> : null}
  </ScrollView>;
}

export function KnowledgeCreateItem({ context, initialBasketId = "", itemType, onClose, onCreated }: { readonly context: KnowledgeMobileContext; readonly initialBasketId?: string; readonly itemType: "main_line" | "temporary"; readonly onClose: () => void; readonly onCreated: (mainLineId: string) => void }) {
  const [basketId, setBasketId] = useState(initialBasketId);
  const [subBasketId, setSubBasketId] = useState("");
  const [subBasketName, setSubBasketName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedType, setSelectedType] = useState(itemType);
  const baskets = useQuery({ queryKey: context.key("baskets", "create-item"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets({ ...page, status: "active" })), enabled: context.ready && context.canRead });
  const subBaskets = useQuery({ queryKey: context.key("sub-baskets", basketId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(basketId, page)), enabled: context.ready && context.canRead && Boolean(basketId) });
  const valid = context.ready && context.canRead && context.canCreate && name.trim().length > 0 && baskets.isSuccess && baskets.data.some(basket => basket.id === basketId && basket.status === "active") && subBaskets.isSuccess && (!subBasketId || (subBasketId === "__new" ? subBasketName.trim().length > 0 : subBaskets.data.some(subBasket => subBasket.id === subBasketId && subBasket.basketId === basketId)));
  const mutation = useMutation({ mutationFn: async () => {
    if (!valid) throw new Error("Choose a main basket and enter an item name.");
    return context.api.createKnowledgeMainLine(basketId, { itemType: selectedType, name: name.trim(), description: description.trim() || null, ...(subBasketId === "__new" ? { subBasketName: subBasketName.trim() } : subBasketId ? { subBasketId } : {}) });
  }, retry: false, onSuccess: async item => { await context.refresh(); onCreated(item.mainLineId); } });
  const dirty = basketId !== initialBasketId || Boolean(subBasketId || subBasketName || name || description) || selectedType !== itemType;
  return <KnowledgeModal title={`Add ${selectedType === "temporary" ? "temporary" : "estimation"} item`} busy={mutation.isPending} onClose={() => closeCatalogDraft(dirty, onClose)}>
    <KnowledgeSelect label="Item type" value={selectedType} allowEmpty={false} disabled={mutation.isPending} onChange={value => setSelectedType(value as typeof itemType)} options={[{ value: "main_line", label: "Estimation item" }, { value: "temporary", label: "Temporary item" }]} />
    <KnowledgeSelect label="Main basket" value={basketId} placeholder="Select main basket" options={(baskets.data ?? []).map(basket => ({ value: basket.id, label: basket.name }))} disabled={!baskets.isSuccess || mutation.isPending} onChange={value => { setBasketId(value); setSubBasketId(""); setSubBasketName(""); }} />
    {baskets.isPending ? <KnowledgeText>Loading main baskets…</KnowledgeText> : null}
    {baskets.isError ? <StateView title="Main baskets unavailable" message={catalogError(baskets.error)} actionLabel="Retry main baskets" onAction={() => void baskets.refetch()} /> : null}
    <KnowledgeSelect label="Sub-basket (optional)" value={subBasketId} placeholder="No sub-basket" disabled={!basketId || !subBaskets.isSuccess || mutation.isPending} options={[...(subBaskets.data ?? []).map(subBasket => ({ value: subBasket.id, label: subBasket.name })), { value: "__new", label: "Create a new sub-basket with this item" }]} onChange={setSubBasketId} />
    {basketId && subBaskets.isPending ? <KnowledgeText>Loading sub-baskets…</KnowledgeText> : null}
    {subBaskets.isError ? <StateView title="Sub-baskets unavailable" message={catalogError(subBaskets.error)} actionLabel="Retry sub-baskets" onAction={() => void subBaskets.refetch()} /> : null}
    {subBasketId === "__new" ? <Field label="New sub-basket name" value={subBasketName} onChangeText={setSubBasketName} maxLength={240} editable={!mutation.isPending} /> : null}
    <Field label="Item name" value={name} onChangeText={setName} maxLength={240} editable={!mutation.isPending} />
    <Field label="Description" value={description} onChangeText={setDescription} maxLength={4000} multiline editable={!mutation.isPending} />
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label="Create item" disabled={!valid} loading={mutation.isPending} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}
