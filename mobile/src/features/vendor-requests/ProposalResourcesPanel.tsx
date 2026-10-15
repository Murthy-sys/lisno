import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { closeCatalogDraft } from "../knowledge/knowledgeCatalogForms";
import { Button, Field, KnowledgeCard, KnowledgeModal, KnowledgeText, knowledgeStyles as s } from "../knowledge/knowledgeDetailUi";
import { proposalDenied, proposalError, proposalUncertain, type ProposalContext } from "./proposalRuntime";
import type { ProposalDetail, ProposalHierarchyNode, ProposalMasterKind, ProposalMutationResult, ProposalSnapshot } from "./proposalTypes";

type Edit = { kind: "basket" | "sub_basket" | "main_line" | ProposalMasterKind; id?: string; parentId?: string; name: string; description: string; decimalScale: string; version: number; requestVersion: number | null };
export function ProposalResourcesPanel({ context, detail, nodes, snapshot, disabled, onSaved, onEditingChange }: { context: ProposalContext; detail: ProposalDetail; nodes: readonly ProposalHierarchyNode[]; snapshot: ProposalSnapshot; disabled: boolean; onSaved: (result: ProposalMutationResult) => Promise<void>; onEditingChange: (editing: boolean) => void }) {
  const [edit, setEdit] = useState<Edit | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false); const [denied, setDenied] = useState(false); const lock = useRef(false); const alive = useRef(true); const command = useRef<(() => Promise<ProposalMutationResult>) | null>(null); const navigation = useScaffoldNavigationGuard();
  const masters = useQuery({ queryKey: context.key("masters", detail.id, snapshot, detail.head.version), queryFn: async () => [...await context.api.collectProposalPages(offset => context.api.getProposalMasters(context.scope, detail.id, "uoms", snapshot, offset)), ...await context.api.collectProposalPages(offset => context.api.getProposalMasters(context.scope, detail.id, "surfaces", snapshot, offset))], enabled: context.ready && context.canRead && !denied, gcTime: 0 });
  const editingAllowed = snapshot === "current" && detail.capabilities.edit && context.canUpdate && !disabled && !denied;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onEditingChange(Boolean(edit)); navigation?.setBlocked(Boolean(edit)); return () => { onEditingChange(false); navigation?.setBlocked(false); }; }, [edit, onEditingChange, navigation]);
  function open(kind: Edit["kind"], value?: { id?: string; parentId?: string; name?: string; description?: string | null; decimalScale?: number }) { setError(""); setStale(false); setEdit({ kind, ...value, name: value?.name ?? "", description: value?.description ?? "", decimalScale: String(value?.decimalScale ?? 2), version: detail.version, requestVersion: detail.requestVersion }); }
  async function save(remove = false) {
    if (!edit || lock.current || stale || denied) return;
    if (!command.current) {
      if (!remove && !edit.name.trim()) { setError("Enter a name."); return; }
      if (edit.kind === "uoms" && !remove && (!Number.isSafeInteger(Number(edit.decimalScale)) || Number(edit.decimalScale) < 0 || Number(edit.decimalScale) > 6)) { setError("Enter quantity decimal places from 0 to 6."); return; }
      const target = { expectedVersion: edit.version, ...(context.scope === "admin" && edit.requestVersion !== null ? { expectedRequestVersion: edit.requestVersion } : {}) };
      const input = { ...target, name: edit.name.trim(), description: edit.description.trim() || null };
      const api = context.api; const id = detail.id; const scope = context.scope; const value = edit;
      command.current = () => value.kind === "uoms" || value.kind === "surfaces" ? remove ? api.removeProposalMaster(scope, id, value.kind, value.id!, target) : value.id ? api.saveProposalMaster(scope, id, value.kind, value.id, { ...input, ...(value.kind === "uoms" ? { decimalScale: Number(value.decimalScale) } : {}) }) : api.addProposalMaster(scope, id, value.kind, { ...input, ...(value.kind === "uoms" ? { decimalScale: Number(value.decimalScale) } : {}) })
        : value.kind === "basket" ? api.saveProposalBasket(scope, id, input)
          : value.kind === "sub_basket" ? remove ? api.removeProposalSubBasket(scope, id, value.id!, target) : value.id ? api.saveProposalSubBasket(scope, id, value.id, input) : api.addProposalSubBasket(scope, id, input)
            : remove ? api.removeProposalMainLine(scope, id, value.id!, target) : value.id ? api.saveProposalMainLine(scope, id, value.id, input) : api.addProposalMainLine(scope, id, value.parentId!, input);
    }
    lock.current = true; setBusy(true); setError("");
    try { const result = await command.current(); if (!alive.current) return; command.current = null; setEdit(null); await onSaved(result); }
    catch (cause) { if (alive.current) { setError(proposalError(cause)); if (proposalDenied(cause)) setDenied(true); if (!proposalUncertain(cause)) { command.current = null; if (cause instanceof ApiError && cause.status === 409) setStale(true); } } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  if (denied || proposalDenied(masters.error)) return <KnowledgeText error>Request configuration access is unavailable.</KnowledgeText>;
  return <View style={s.stack}>
    {editingAllowed ? <View style={s.row}>{detail.capabilities.editParent !== false ? <Button label="Edit Main Basket details" variant="secondary" onPress={() => open("basket", { name: detail.basket.payload.name, description: detail.basket.payload.description })} /> : null}{detail.capabilities.manageSubBaskets !== false ? <Button label="Add requested Sub Basket" variant="secondary" onPress={() => open("sub_basket")} /> : null}</View> : null}
    {editingAllowed ? nodes.filter(node => node.kind === "sub_basket").map(sub => <View key={sub.resourceId} style={s.stack}><Button label={`Edit ${sub.payload.name} details`} variant="quiet" onPress={() => open("sub_basket", { id: sub.resourceId, name: sub.payload.name, description: sub.payload.description })} /><Button label={`Add Main Line in ${sub.payload.name}`} variant="secondary" onPress={() => open("main_line", { parentId: sub.resourceId })} />{nodes.filter(node => node.kind === "main_line" && node.parentId === sub.resourceId).map(line => <Button key={line.resourceId} label={`Edit ${line.payload.name} name`} variant="quiet" onPress={() => open("main_line", { id: line.resourceId, name: line.payload.name, description: line.payload.description })} />)}</View>) : null}
    <KnowledgeCard title="Requested reusable values"><KnowledgeText>These values remain inside this request until publication.</KnowledgeText>{masters.isPending ? <KnowledgeText>Loading requested values…</KnowledgeText> : null}{masters.isError ? <Button label="Retry requested values" variant="secondary" onPress={() => void masters.refetch()} /> : null}{masters.data?.map(master => <View key={master.resourceId} style={s.stack}><KnowledgeText>{master.payload.name} · {master.kind === "uom" ? "Unit of measure" : "Surface"}</KnowledgeText>{editingAllowed ? <Button label={`Edit requested ${master.payload.name}`} variant="quiet" onPress={() => open(master.kind === "uom" ? "uoms" : "surfaces", { id: master.resourceId, ...master.payload })} /> : null}</View>)}{editingAllowed ? <View style={s.row}><Button label="Add requested UOM" variant="secondary" onPress={() => open("uoms")} /><Button label="Add requested Surface" variant="secondary" onPress={() => open("surfaces")} /></View> : null}</KnowledgeCard>
    {edit ? <KnowledgeModal title="Request configuration details" busy={busy || Boolean(command.current)} onClose={() => closeCatalogDraft(Boolean(edit.name || edit.description), () => setEdit(null))}>
      <Field label="Name" value={edit.name} maxLength={240} editable={!busy && !command.current && !stale} onChangeText={name => setEdit({ ...edit, name })} /><Field label="Description" value={edit.description} multiline maxLength={4000} editable={!busy && !command.current && !stale} onChangeText={description => setEdit({ ...edit, description })} />{edit.kind === "uoms" ? <Field label="Quantity decimal places" value={edit.decimalScale} keyboardType="number-pad" editable={!busy && !command.current && !stale} onChangeText={decimalScale => setEdit({ ...edit, decimalScale })} /> : null}
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}{stale ? <KnowledgeText>Close this form and reload the saved request before editing again.</KnowledgeText> : null}
      {command.current ? <Button label="Retry same configuration change" loading={busy} onPress={() => void save()} /> : <><Button label="Save request configuration" disabled={stale} loading={busy} onPress={() => void save()} />{edit.id && edit.kind !== "basket" ? <Button label="Remove from request" variant="danger" disabled={stale} loading={busy} onPress={() => void save(true)} /> : null}</>}
    </KnowledgeModal> : null}
  </View>;
}
