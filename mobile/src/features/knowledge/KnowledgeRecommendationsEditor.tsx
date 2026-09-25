import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetAlterationIssues, budgetAlterationRows, recommendationItemRequiresCompletion, recommendationTargetKind } from "../../../../shared/knowledge/knowledgeBudgetAlterations";
import { RECOMMENDATION_GROUPS, newRecommendationRule, recommendationAction, recommendationGroup } from "../../../../shared/knowledge/knowledgeRecommendationPresentation";
import type { KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, IconButton, KnowledgeDisclosure } from "./knowledgeDetailUi";
import type { KnowledgeEditorProps } from "./knowledgeEditorContracts";
import { allKnowledgePages } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeDetailUi";
import { knowledgeText as text, nativeRecommendationCatalogIssues, nativeRuleTarget, nativeRuleTargetKind } from "./knowledgeNativeRules";

export function KnowledgeRecommendationsEditor({ item, payload, onChange, readOnly, context, masters, onValidityChange, onBusyChange }: KnowledgeEditorProps) {
  const client = useQueryClient();
  const itemsQuery = useQuery({ queryKey: context.key("recommendation-items"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeItems(page)), enabled: context.ready });
  const basketsQuery = useQuery({ queryKey: context.key("recommendation-baskets"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets(page)), enabled: context.ready });
  const rows = budgetAlterationRows(payload.budgetAlterations);
  const invalidShape = payload.budgetAlterations !== undefined && (!Array.isArray(payload.budgetAlterations) || payload.budgetAlterations.length !== rows.length);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [create, setCreate] = useState<"item" | "basket" | "group" | null>(null);
  const [name, setName] = useState("");
  const [createGroup, setCreateGroup] = useState("");
  const [createType, setCreateType] = useState<"main_line" | "temporary">("temporary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdItems, setCreatedItems] = useState<readonly KnowledgeItemListItem[]>([]);
  useEffect(() => {
    setCreatedItems(current => {
      const pending = current.filter(created => !(itemsQuery.data ?? []).some(listed => listed.mainLineId === created.mainLineId && listed.version >= created.version));
      return pending.length === current.length ? current : pending;
    });
  }, [itemsQuery.data]);
  const operation = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  const byId = new Map((itemsQuery.data ?? []).map(candidate => [candidate.mainLineId, candidate]));
  for (const created of createdItems) if ((byId.get(created.mainLineId)?.version ?? -1) < created.version) byId.set(created.mainLineId, created);
  const items = [...byId.values()];
  const editingIndex = rows.findIndex((row, index) => String(row.id ?? index) === editingId);
  const editing = rows[editingIndex];
  const basketIds = [...new Set(rows.map(row => text(row.targetBasketId)).filter(Boolean))];
  const subQueries = useQueries({ queries: basketIds.map(basketId => ({ queryKey: context.key("recommendation-sub-baskets", basketId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(basketId, page)), enabled: context.ready })) });
  const subBaskets = subQueries.flatMap(query => query.data ?? []);
  const catalogsReady = !!itemsQuery.data && !!basketsQuery.data && !itemsQuery.isError && !basketsQuery.isError;
  const issues = [...budgetAlterationIssues(payload.budgetAlterations, item.mainLineId).map(issue => issue.message), ...(catalogsReady ? nativeRecommendationCatalogIssues(payload.budgetAlterations, items, item.mainLineId) : rows.some(row => row.active !== false) ? ["Load the complete related-item catalog before saving rules."] : [])];
  useEffect(() => onValidityChange?.(!busy && !issues.length), [onValidityChange, busy, issues.join("\n")]);
  const disabled = readOnly || invalidShape || busy;
  const changeRows = (next: readonly KnowledgeJsonObject[]) => { if (!disabled) onChange({ ...payload, budgetAlterations: next }); };
  const update = (next: KnowledgeJsonObject) => changeRows(rows.map((row, index) => index === editingIndex ? next : row));
  const set = (key: string, value: KnowledgeJsonValue) => { if (editing) update({ ...editing, targetKind: recommendationTargetKind(editing), [key]: value }); };
  const refreshCatalog = async () => { await Promise.all([itemsQuery.refetch(), basketsQuery.refetch(), ...subQueries.map(query => query.refetch())]); };
  const startCreate = (kind: "item" | "basket" | "group") => { setCreate(kind); setName(""); setCreateGroup(""); setError(""); };

  async function createRelated() {
    if (!editing || !create || !context.canCreate || disabled || operation.current || !name.trim()) return;
    operation.current = true; setBusy(true); setError("");
    try {
      if (create === "basket") {
        const basket = await context.api.createKnowledgeBasket({ name: name.trim() });
        if (!alive.current) return;
        client.setQueryData(context.key("recommendation-baskets"), [...(basketsQuery.data ?? []), basket]);
        onChange({ ...payload, budgetAlterations: rows.map((row, index) => index === editingIndex ? { ...row, targetBasketId: basket.id, targetSubBasketId: null, targetMainLineId: null } : row) });
      } else if (create === "group") {
        const group = await context.api.createKnowledgeSubBasket(text(editing.targetBasketId), { name: name.trim() });
        if (!alive.current) return;
        await client.invalidateQueries({ queryKey: context.key("recommendation-sub-baskets", group.basketId) });
        onChange({ ...payload, budgetAlterations: rows.map((row, index) => index === editingIndex ? { ...row, targetSubBasketId: group.id, targetMainLineId: null } : row) });
      } else {
        const input = { name: name.trim(), itemType: createType, ...(createGroup.trim() ? { subBasketName: createGroup.trim() } : text(editing.targetSubBasketId) ? { subBasketId: text(editing.targetSubBasketId) } : {}) };
        let created;
        try { created = await context.api.createKnowledgeMainLine(text(editing.targetBasketId), input); }
        catch (failure) {
          // A timed-out creation may have committed. Reconcile identity before allowing a retry.
          if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 409].includes(failure.status)) throw failure;
          const lines = await allKnowledgePages(page => context.api.listKnowledgeMainLines(text(editing.targetBasketId), { ...page, includeArchived: true }));
          const groups = createGroup.trim() ? await allKnowledgePages(page => context.api.listKnowledgeSubBaskets(text(editing.targetBasketId), page)) : [];
          const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
          const groupId = createGroup.trim() ? groups.find(group => normalize(group.name) === normalize(createGroup))?.id : editing.targetSubBasketId ?? null;
          const matches = lines.filter(line => line.id !== item.mainLineId && normalize(line.name) === normalize(input.name) && (line.itemType ?? "main_line") === createType && (line.subBasketId ?? null) === groupId && ["active", "draft"].includes(line.status));
          if (matches.length !== 1) throw new Error("Creation could not be confirmed. Refresh the catalog and check the name and classification before retrying.");
          created = await context.api.getKnowledgeItem(matches[0]!.id);
          if (created.basketId !== editing.targetBasketId || (created.subBasketId ?? null) !== groupId || created.mainLineId === item.mainLineId || normalize(created.mainLineName) !== normalize(input.name) || (created.itemType ?? "main_line") !== createType || !["active", "draft"].includes(created.status)) throw new Error("The matching item changed. Refresh the catalog before retrying.");
        }
        if (!alive.current) return;
        setCreatedItems(current => [...current.filter(entry => entry.mainLineId !== created.mainLineId), created]);
        const target = recommendationTargetKind(editing) === "sub_basket" ? { ...editing, targetSubBasketId: created.subBasketId ?? null, targetMainLineId: null, targetType: null } : nativeRuleTarget(editing, created);
        onChange({ ...payload, budgetAlterations: rows.map((row, index) => index === editingIndex ? target : row) });
      }
      if (alive.current) setCreate(null);
      await Promise.allSettled([context.refresh(), client.invalidateQueries({ queryKey: context.key() })]);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "The related value could not be created."); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }

  return <View style={s.stack}>
    <View style={s.row}><Text style={s.subtitle}>Priority</Text><KnowledgeText>{masters.priorities?.find(priority => priority.id === item.priorityId)?.name ?? (item.priorityId ? "Unavailable saved priority" : "Not configured")}</KnowledgeText></View>
    {!catalogsReady ? <KnowledgeCard><KnowledgeText error={itemsQuery.isError || basketsQuery.isError}>Related items {itemsQuery.isError || basketsQuery.isError ? "could not be loaded. Existing rules are preserved." : "are loading…"}</KnowledgeText><Button label="Retry related catalog" variant="secondary" onPress={() => { void refreshCatalog(); }} /></KnowledgeCard> : null}
    {subQueries.some(query => query.isError) ? <KnowledgeCard><KnowledgeText error>Some Sub-Basket values could not be loaded. Saved selections are preserved.</KnowledgeText><Button label="Retry related Sub-Baskets" variant="secondary" onPress={() => { void Promise.all(subQueries.map(query => query.refetch())); }} /></KnowledgeCard> : null}
    {invalidShape ? <KnowledgeText error>The saved rules have an unsupported structure. They are preserved and cannot be edited here.</KnowledgeText> : null}
    {RECOMMENDATION_GROUPS.map(group => <KnowledgeCard key={group.key} title={`${group.title} (${rows.filter(row => recommendationGroup(row) === group.key).length})`} actions={!readOnly ? <IconButton label={group.addLabel} icon="add" disabled={disabled || rows.length >= 100} onPress={() => { const rule = newRecommendationRule(group.key); changeRows([...rows, rule]); setEditingId(String(rule.id)); }} /> : null}>
      <KnowledgeText>{group.description}</KnowledgeText>
      {rows.map((row, index) => ({ row, index })).filter(({ row }) => recommendationGroup(row) === group.key).map(({ row, index }) => {
        const target = items.find(candidate => candidate.mainLineId === row.targetMainLineId);
        const whole = recommendationTargetKind(row) === "sub_basket";
        const children = items.filter(candidate => candidate.basketId === row.targetBasketId && candidate.subBasketId === row.targetSubBasketId && ["draft", "active"].includes(candidate.status));
        const label = whole ? subBaskets.find(group => group.id === row.targetSubBasketId)?.name ?? children[0]?.subBasketName : target?.mainLineName;
        return <View key={String(row.id ?? index)} style={s.row}><View style={{ flex: 1, gap: 3 }}><KnowledgeText>{label ?? (row.targetMainLineId || row.targetSubBasketId ? "Unavailable saved target" : "Select related scope")}</KnowledgeText><KnowledgeText>{recommendationAction(row)} · When source is {text(row.trigger)} · {row.active === false ? "Disabled" : "Enabled"}</KnowledgeText><KnowledgeText>{text(row.reason) || "Reason not entered"}</KnowledgeText>{whole && (children.length === 0 || children.some(recommendationItemRequiresCompletion)) ? <KnowledgeText>Some children need completed, active knowledge before AI analysis.</KnowledgeText> : null}</View><IconButton label={`${readOnly ? "View" : "Edit"} rule ${index + 1}`} icon={readOnly ? "right" : "edit"} onPress={() => setEditingId(String(row.id ?? index))} /></View>;
      })}
      {!rows.some(row => recommendationGroup(row) === group.key) ? <KnowledgeText>No rules added.</KnowledgeText> : null}
    </KnowledgeCard>)}
    {issues.length ? <KnowledgeCard title="Rules need attention">{[...new Set(issues)].map(issue => <KnowledgeText key={issue} error>{issue}</KnowledgeText>)}</KnowledgeCard> : null}
    {(["recommendations", "exclusions"] as const).filter(key => payload[key] !== undefined).map(key => <LegacyRules key={key} kind={key} value={payload[key]} readOnly={readOnly || busy} priorities={(masters.priorities ?? []).map(priority => ({ value: priority.id, label: priority.name }))} onChange={value => onChange({ ...payload, [key]: value })} />)}
    {editing ? <KnowledgeModal title={`Rule ${editingIndex + 1}`} busy={busy} onClose={() => { setEditingId(null); setCreate(null); }}>
      <KnowledgeSelect label="When this item is" value={text(editing.trigger)} options={[{ value: "added", label: "Added" }, { value: "removed", label: "Removed" }]} disabled={disabled} allowEmpty={false} onChange={value => set("trigger", value)} />
      <KnowledgeSelect label="Related action" value={text(editing.action)} options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }]} disabled={disabled} allowEmpty={false} onChange={value => set("action", value)} />
      <KnowledgeSelect label="Requirement" value={text(editing.requirement)} options={[{ value: "must", label: "Required" }, { value: "can", label: "Optional" }]} disabled={disabled} allowEmpty={false} onChange={value => set("requirement", value)} />
      <KnowledgeSelect label="Addition type" value={recommendationTargetKind(editing)} options={[{ value: "main_line", label: "Main Line" }, { value: "sub_basket", label: "Whole Sub-Basket" }]} disabled={disabled} allowEmpty={false} onChange={kind => update(nativeRuleTargetKind(editing, kind as "main_line" | "sub_basket"))} />
      <KnowledgeSelect label="Main Basket" value={text(editing.targetBasketId)} options={(basketsQuery.data ?? []).filter(basket => basket.status === "active").map(basket => ({ value: basket.id, label: basket.name }))} disabled={disabled || !catalogsReady} onChange={basketId => update({ ...editing, targetBasketId: basketId, targetSubBasketId: null, targetMainLineId: null })} />
      <KnowledgeSelect label="Sub-Basket" value={text(editing.targetSubBasketId)} options={subBaskets.filter(group => group.basketId === editing.targetBasketId).map(group => ({ value: group.id, label: group.name }))} disabled={disabled || !catalogsReady} onChange={groupId => update({ ...editing, targetSubBasketId: groupId || null, targetMainLineId: null })} />
      {recommendationTargetKind(editing) === "main_line" ? <KnowledgeSelect label="Related item" value={text(editing.targetMainLineId)} options={items.filter(candidate => candidate.mainLineId !== item.mainLineId && candidate.basketId === editing.targetBasketId && (candidate.subBasketId ?? null) === (editing.targetSubBasketId ?? null) && ["active", "draft"].includes(candidate.status)).map(candidate => ({ value: candidate.mainLineId, label: `${candidate.mainLineName}${candidate.itemType === "temporary" ? " (Temporary)" : ""}` }))} disabled={disabled || !catalogsReady} onChange={id => { const target = items.find(candidate => candidate.mainLineId === id); if (target) update(nativeRuleTarget(editing, target)); else set("targetMainLineId", null); }} /> : null}
      {!readOnly && context.canCreate ? <View style={s.row}><Button label="Create Main Basket" variant="secondary" disabled={busy} onPress={() => startCreate("basket")} /><Button label="Create Sub-Basket" variant="secondary" disabled={busy || !editing.targetBasketId} onPress={() => startCreate("group")} /><Button label="Create related item" variant="secondary" disabled={busy || !editing.targetBasketId} onPress={() => startCreate("item")} /></View> : null}
      <Field label="Reason" value={text(editing.reason)} editable={!disabled} maxLength={4000} multiline onChangeText={reason => set("reason", reason)} />
      <KnowledgeChoice label="Rule enabled" multiple selected={editing.active !== false} disabled={disabled} onPress={() => set("active", editing.active === false)} />
      {!readOnly ? <Button label="Remove rule" variant="danger" disabled={busy} onPress={() => { changeRows(rows.filter((_, index) => index !== editingIndex)); setEditingId(null); }} /> : null}
      {create ? <KnowledgeCard title={`Create ${create === "basket" ? "Main Basket" : create === "group" ? "Sub-Basket" : "related item"}`}><Field label="Name" value={name} onChangeText={setName} editable={!busy} maxLength={240} />{create === "item" ? <><KnowledgeSelect label="Item type" value={createType} allowEmpty={false} options={[{ value: "temporary", label: "Temporary" }, { value: "main_line", label: "Estimation item" }]} disabled={busy} onChange={value => setCreateType(value as "main_line" | "temporary")} /><Field label="New Sub-Basket name (optional)" value={createGroup} onChangeText={setCreateGroup} editable={!busy} /></> : null}{error ? <KnowledgeText error>{error}</KnowledgeText> : null}<Button label="Create" disabled={!name.trim() || busy} loading={busy} onPress={() => { void createRelated(); }} /><Button label="Cancel creation" variant="quiet" disabled={busy} onPress={() => setCreate(null)} /></KnowledgeCard> : null}
    </KnowledgeModal> : null}
  </View>;
}

function LegacyRules({ kind, value, readOnly, priorities, onChange }: {
  readonly kind: "recommendations" | "exclusions"; readonly value: KnowledgeJsonValue | undefined;
  readonly readOnly: boolean; readonly priorities: readonly { value: string; label: string }[];
  readonly onChange: (value: readonly KnowledgeJsonObject[]) => void;
}) {
  const rows = budgetAlterationRows(value);
  const unsupported = !Array.isArray(value) || value.length !== rows.length;
  const disabled = readOnly || unsupported;
  const update = (index: number, key: string, next: KnowledgeJsonValue) => { if (!disabled) onChange(rows.map((row, position) => position === index ? { ...row, [key]: next } : row)); };
  return <KnowledgeDisclosure title={`Previous ${kind}`}>
    <KnowledgeText>These saved rows are retained independently of the related-scope rules.</KnowledgeText>
    {unsupported ? <KnowledgeText error>Unsupported saved rows are preserved. They cannot be edited here.</KnowledgeText> : null}
    {rows.map((row, index) => <View key={String(row.id ?? index)} style={s.stack}>
      <Field label={`${kind === "recommendations" ? "Recommendation" : "Exclusion"} ${index + 1}`} value={text(row.name)} editable={!disabled} onChangeText={name => update(index, "name", name)} />
      <Field label={`Reason ${index + 1}`} value={text(row.reason)} editable={!disabled} multiline onChangeText={reason => update(index, "reason", reason)} />
      {kind === "recommendations" ? <KnowledgeSelect label={`Priority ${index + 1}`} value={text(row.priorityId)} options={priorities} disabled={disabled} onChange={priorityId => update(index, "priorityId", priorityId)} /> : null}
      {!disabled ? <Button label={`Remove previous ${kind === "recommendations" ? "recommendation" : "exclusion"} ${index + 1}`} variant="danger" onPress={() => onChange(rows.filter((_, position) => position !== index))} /> : null}
    </View>)}
  </KnowledgeDisclosure>;
}
