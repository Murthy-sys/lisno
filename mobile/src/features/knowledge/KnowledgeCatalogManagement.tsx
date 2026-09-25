import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import type { KnowledgeBasket, KnowledgeSubBasket, KnowledgeBasketDeletionImpact, KnowledgeSubBasketDeletionImpact } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, StateView } from "../../ui/primitives";
import { allKnowledgePages, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";

type BasketEditor = { basket?: KnowledgeBasket; parent?: KnowledgeBasket; subBasket?: KnowledgeSubBasket };
type DeleteTarget = { basket: KnowledgeBasket; subBasket?: KnowledgeSubBasket };

export function KnowledgeCatalogManagement({ context, onClose, initialBasketId = "" }: { readonly context: KnowledgeMobileContext; readonly onClose: () => void; readonly initialBasketId?: string }) {
  const [selectedId, setSelectedId] = useState(initialBasketId);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<BasketEditor | null>(null);
  const [deletion, setDeletion] = useState<DeleteTarget | null>(null);
  const baskets = useQuery({ queryKey: context.key("baskets", "management"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets({ ...page, includeArchived: true })), enabled: context.ready && context.canRead });
  const selected = baskets.data?.find(basket => basket.id === selectedId);
  const subBaskets = useQuery({ queryKey: context.key("sub-baskets", selectedId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(selectedId, page)), enabled: context.ready && context.canRead && Boolean(selected) });
  const visible = (baskets.data ?? []).filter(basket => basket.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <KnowledgeModal title="Manage baskets" onClose={onClose}>
    {context.canCreate ? <Button label="Add main basket" onPress={() => setEditor({})} /> : null}
    <Field label="Search main baskets" value={search} onChangeText={setSearch} />
    {baskets.isPending ? <KnowledgeText>Loading main baskets…</KnowledgeText> : null}
    {baskets.isError ? <StateView title="Main baskets unavailable" message={catalogError(baskets.error)} actionLabel="Retry main baskets" onAction={() => void baskets.refetch()} /> : null}
    {visible.map(basket => <KnowledgeCard key={basket.id} title={basket.name}>
      <KnowledgeText>{basket.status}{basket.description ? ` · ${basket.description}` : ""}</KnowledgeText>
      <View style={s.row}><Button label={`Manage sub-baskets in ${basket.name}`} variant="secondary" onPress={() => setSelectedId(basket.id)} />
        {context.canUpdate && basket.status !== "archived" ? <Button label={`Edit ${basket.name}`} variant="quiet" onPress={() => setEditor({ basket })} /> : null}
        {context.canLifecycle ? <Button label={`Delete ${basket.name}`} variant="danger" onPress={() => setDeletion({ basket })} /> : null}
      </View>
    </KnowledgeCard>)}
    {baskets.isSuccess && !visible.length ? <KnowledgeText>No main baskets match.</KnowledgeText> : null}
    {selected ? <KnowledgeCard title={`Sub-baskets · ${selected.name}`}>
      {context.canCreate && selected.status === "active" ? <Button label="Add sub-basket" onPress={() => setEditor({ parent: selected })} /> : null}
      {subBaskets.isPending ? <KnowledgeText>Loading sub-baskets…</KnowledgeText> : null}
      {subBaskets.isError ? <StateView title="Sub-baskets unavailable" message={catalogError(subBaskets.error)} actionLabel="Retry sub-baskets" onAction={() => void subBaskets.refetch()} /> : null}
      {subBaskets.data?.map(subBasket => <View key={subBasket.id} style={s.card}>
        <Text style={s.subtitle}>{subBasket.name}</Text>
        <View style={s.row}>{context.canUpdate && selected.status !== "archived" ? <Button label={`Edit sub-basket ${subBasket.name}`} variant="quiet" onPress={() => setEditor({ parent: selected, subBasket })} /> : null}
          {context.canLifecycle && selected.status !== "archived" ? <Button label={`Delete sub-basket ${subBasket.name}`} variant="danger" onPress={() => setDeletion({ basket: selected, subBasket })} /> : null}</View>
      </View>)}
      {subBaskets.isSuccess && !subBaskets.data.length ? <KnowledgeText>No sub-baskets yet.</KnowledgeText> : null}
    </KnowledgeCard> : null}
    {editor ? <KnowledgeBasketEditor context={context} {...editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void baskets.refetch(); void subBaskets.refetch(); }} /> : null}
    {deletion ? <KnowledgeBasketDeletion context={context} {...deletion} onClose={() => setDeletion(null)} onDeleted={() => { setDeletion(null); void baskets.refetch(); void subBaskets.refetch(); }} /> : null}
  </KnowledgeModal>;
}

export function KnowledgeBasketEditor({ context, basket, parent, subBasket, onClose, onSaved }: BasketEditor & { readonly context: KnowledgeMobileContext; readonly onClose: () => void; readonly onSaved: () => void }) {
  const existing = subBasket ?? basket;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(basket?.description ?? "");
  const [order, setOrder] = useState(String(basket?.displayOrder ?? 0));
  const [status, setStatus] = useState(basket?.status === "inactive" ? "inactive" : "active");
  const canWrite = context.ready && context.canRead && (existing ? context.canUpdate : context.canCreate);
  const [conflict, setConflict] = useState(false);
  const valid = canWrite && !conflict && name.trim().length > 0 && name.trim().length <= 240 && (parent || (Number.isSafeInteger(Number(order)) && Number(order) >= 0));
  const mutation = useMutation({ mutationFn: async () => {
    if (!valid) throw new Error("Review the basket fields before saving.");
    if (parent) return subBasket ? context.api.updateKnowledgeSubBasket(parent.id, subBasket.id, { expectedVersion: subBasket.version, name: name.trim(), managementContext: "configuration" }) : context.api.createKnowledgeSubBasket(parent.id, { name: name.trim() });
    const input = { name: name.trim(), description: description.trim() || null, displayOrder: Number(order) };
    return basket ? context.api.updateKnowledgeBasket(basket.id, { ...input, expectedVersion: basket.version, status: status as "active" | "inactive" }) : context.api.createKnowledgeBasket(input);
  }, retry: false, onSuccess: async () => { await context.refresh(); onSaved(); }, onError: error => { if (error instanceof ApiError && error.code === "VERSION_CONFLICT") setConflict(true); } });
  const dirty = name !== (existing?.name ?? "") || description !== (basket?.description ?? "") || order !== String(basket?.displayOrder ?? 0) || status !== (basket?.status === "inactive" ? "inactive" : "active");
  return <KnowledgeModal title={`${existing ? "Edit" : "Add"} ${parent ? "sub-basket" : "main basket"}`} busy={mutation.isPending} onClose={() => closeCatalogDraft(dirty, onClose)}>
    <Field label="Name" value={name} onChangeText={setName} maxLength={240} editable={!mutation.isPending && !conflict} />
    {!parent ? <><Field label="Description" value={description} onChangeText={setDescription} maxLength={4000} multiline editable={!mutation.isPending && !conflict} />
      <Field label="Display order" value={order} onChangeText={setOrder} keyboardType="number-pad" editable={!mutation.isPending && !conflict} />
      {basket ? <KnowledgeSelect label="Status" value={status} allowEmpty={false} onChange={setStatus} disabled={mutation.isPending || conflict} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /> : null}</> : <KnowledgeText>Main basket: {parent.name}</KnowledgeText>}
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label={existing ? "Save changes" : parent ? "Add sub-basket" : "Add main basket"} disabled={!valid} loading={mutation.isPending} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}

export function KnowledgeBasketDeletion({ context, basket, subBasket, onClose, onDeleted }: DeleteTarget & { readonly context: KnowledgeMobileContext; readonly onClose: () => void; readonly onDeleted: () => void }) {
  const [confirmationName, setConfirmationName] = useState("");
  const [reason, setReason] = useState("");
  const [stale, setStale] = useState(false);
  const impact = useQuery<KnowledgeBasketDeletionImpact | KnowledgeSubBasketDeletionImpact>({ queryKey: context.key("deletion-impact", basket.id, subBasket?.id ?? "basket"), queryFn: () => subBasket ? context.api.getKnowledgeSubBasketDeletionImpact(basket.id, subBasket.id) : context.api.getKnowledgeBasketDeletionImpact(basket.id), enabled: context.ready && context.canRead && context.canLifecycle, staleTime: 0 });
  const name = impact.data ? ("subBasketName" in impact.data ? impact.data.subBasketName : impact.data.basketName) : subBasket?.name ?? basket.name;
  const valid = context.ready && context.canRead && context.canLifecycle && impact.isSuccess && !impact.isFetching && !stale && confirmationName === name && reason.trim().length > 0;
  const mutation = useMutation({ mutationFn: async () => {
    if (!valid || !impact.data) throw new Error("Review the deletion impact and confirmation first.");
    const command = { expectedVersion: impact.data.version, confirmationName, reason: reason.trim() };
    if (subBasket && "impactToken" in impact.data) return context.api.permanentlyDeleteKnowledgeSubBasket(basket.id, subBasket.id, { ...command, impactToken: impact.data.impactToken });
    if (subBasket) throw new Error("Refresh the sub-basket deletion impact.");
    return context.api.permanentlyDeleteKnowledgeBasket(basket.id, command);
  }, retry: false, onSuccess: async () => { await context.refresh(); onDeleted(); }, onError: () => setStale(true) });
  return <KnowledgeModal title={`Delete ${subBasket ? "sub-basket" : "main basket"}`} busy={mutation.isPending} onClose={onClose}>
    <KnowledgeText error>This permanently deletes {name} and its items and revision history. This cannot be undone.</KnowledgeText>
    {impact.isPending ? <KnowledgeText>Loading deletion impact…</KnowledgeText> : null}
    {impact.isError ? <KnowledgeText error>{catalogError(impact.error)}</KnowledgeText> : null}
    {impact.data ? <KnowledgeCard title="Deletion impact"><KnowledgeText>Items: {impact.data.mainLineCount}</KnowledgeText><KnowledgeText>References: {"referenceCount" in impact.data ? impact.data.referenceCount : impact.data.historicalReferenceCount}</KnowledgeText><KnowledgeText>Vendor references: {impact.data.vendorReferenceCount ?? 0}</KnowledgeText>{"subBasketCount" in impact.data ? <KnowledgeText>Sub-baskets: {impact.data.subBasketCount ?? 0}</KnowledgeText> : null}{"bootstrapOwned" in impact.data && impact.data.bootstrapOwned ? <KnowledgeText>This is a seeded main basket.</KnowledgeText> : null}</KnowledgeCard> : null}
    {(stale || impact.isError) ? <Button label="Refresh deletion impact" variant="secondary" disabled={mutation.isPending || impact.isFetching} onPress={() => { setConfirmationName(""); void impact.refetch().then(result => { if (result.isSuccess) { setStale(false); mutation.reset(); } }); }} /> : null}
    <Field label={`Type ${name} to confirm`} value={confirmationName} onChangeText={setConfirmationName} editable={!mutation.isPending} />
    <Field label="Reason for deletion" value={reason} onChangeText={setReason} multiline maxLength={4000} editable={!mutation.isPending} />
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label="Permanently delete" variant="danger" loading={mutation.isPending} disabled={!valid} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}
