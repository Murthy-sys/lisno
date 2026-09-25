import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, CircleHelp, LockKeyhole, MoreVertical, Pencil, Plus, ShieldCheck, ShieldMinus, ShieldPlus, Trash2 } from "lucide-react";
import { ADD_MAIN_BASKET, CreateKnowledgeBasketFields } from "./CreateKnowledgeBasketFields";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { Checkbox, Field, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeCatalogRenameDialog, KnowledgeSubItemRemovalDialog } from "./KnowledgeDraftSubBasketDialogs";
import { KnowledgeSubBasketDeleteDialog } from "./KnowledgeSubBasketDialogs";
import {
  listKnowledgeSubBaskets,
  permanentlyDeleteKnowledgeMainLine,
  updateKnowledgeMainLine,
  updateKnowledgeSubBasket
} from "./knowledgeApi";
import { BUDGET_ACTIONS, budgetAlterationRows, recommendationItemRequiresCompletion, recommendationTargetKind, withExplicitRecommendationTargetKind } from "./knowledgeBudgetAlterations";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import {
  commitKnowledgeMainLineMutation,
  commitKnowledgeMainLineRemoval,
  commitKnowledgeSubBasketMutation,
  refreshKnowledgeSubBasketCatalog
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { relatedItemSuggestions } from "./knowledgeRelatedItemSuggestions";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue, KnowledgePermanentDeleteSubBasketResult, KnowledgeSubBasket, KnowledgeSubBasketListResponse } from "./knowledgeTypes";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";
import { RECOMMENDATION_GROUPS, newRecommendationRule, recommendationAction, recommendationGroup, type RecommendationGroup } from "./knowledgeRecommendationPresentation";
import "./knowledge-recommendations.css";

const SUB_BASKET_CATALOG_STALE_TIME_MS = 30_000;

interface Props {
  value: KnowledgeJsonValue | undefined;
  mainLineId: string;
  mainLineName: string;
  baskets: readonly KnowledgeBasket[];
  items: readonly KnowledgeItemListItem[];
  catalogState?: KnowledgeBudgetCatalogState;
  readOnly: boolean;
  canCreate: boolean;
  canUpdate?: boolean;
  canLifecycle?: boolean;
  canReadCatalog?: boolean;
  issues: readonly KnowledgeValidationIssue[];
  validationAttempt?: number;
  resetKey?: string;
  savedValue?: KnowledgeJsonValue;
  onItemConfirmed?: (item: KnowledgeItemDetail) => void;
  onChange: (value: KnowledgeJsonValue) => void;
}

type CatalogDialogIntent =
  | { readonly kind: "rename_sub_basket" }
  | { readonly kind: "rename_child" | "remove_child"; readonly mainLineId: string };

type CatalogGroupScope = {
  readonly scope: "grouped";
  readonly subBasketId: string;
  readonly aggregateVersion: number;
};
type CatalogDirectScope = {
  readonly scope: "direct";
  readonly subBasketId: null;
};
type CatalogDialogState = {
  readonly snapshotId: number;
  readonly basketId: string;
  readonly name: string;
  readonly refreshed?: boolean;
} & (
  | ({ readonly kind: "rename_sub_basket" } & CatalogGroupScope)
  | ({
      readonly kind: "rename_child" | "remove_child";
      readonly mainLineId: string;
      readonly childVersion: number;
      readonly lastChild: boolean;
    } & (CatalogGroupScope | CatalogDirectScope))
);

type PendingGroupVersion = { readonly basketId: string; readonly subBasketId: string; readonly version: number };

export function KnowledgeBudgetAlterationBuilder({ value, mainLineName, catalogState = { status: "ready" }, validationAttempt = 0, resetKey, savedValue, ...props }: Props) {
  const id = useId();
  const [createdBaskets, setCreatedBaskets] = useState<readonly KnowledgeBasket[]>([]);
  const [createdItems, setCreatedItems] = useState<readonly KnowledgeItemDetail[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [removedSubBasketIds, setRemovedSubBasketIds] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<{ owner: string; resetKey?: string; ruleId: string } | null>(null);
  const [basketCreationBusy, setBasketCreationBusy] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const fallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const validationFocus = useRef(false);
  const lastValidationAttempt = useRef(0);
  // Keep returned details available to every rule until the catalog acknowledges them.
  // Once acknowledged, the catalog owns future lifecycle changes and removals.
  useEffect(() => {
    setCreatedItems((current) => {
      const pending = current.filter((item) => !props.items.some((listed) => listed.mainLineId === item.mainLineId && listed.version >= item.version));
      return pending.length === current.length ? current : pending;
    });
  }, [props.items]);
  useEffect(() => {
    setCreatedBaskets((current) => {
      const pending = current.filter((basket) => !props.baskets.some((listed) => listed.id === basket.id && listed.version >= basket.version));
      return pending.length === current.length ? current : pending;
    });
  }, [props.baskets]);
  const basketsById = new Map(props.baskets.map((basket) => [basket.id, basket]));
  for (const basket of createdBaskets) {
    const listed = basketsById.get(basket.id);
    if (!listed || listed.version < basket.version) basketsById.set(basket.id, basket);
  }
  const baskets = [...basketsById.values()];
  const byId = new Map(props.items.map((item) => [item.mainLineId, item]));
  for (const item of createdItems) {
    const listed = byId.get(item.mainLineId);
    if (!listed || listed.version < item.version) byId.set(item.mainLineId, item);
  }
  const items = [...byId.values()].filter((item) => !removedItemIds.has(item.mainLineId)
    && (!item.subBasketId || !removedSubBasketIds.has(item.subBasketId)));
  const rows = budgetAlterationRows(value);
  const targetSubBasketBasketIds = [...new Set(rows.flatMap((row) => recommendationTargetKind(row) === "sub_basket"
    && typeof row.targetBasketId === "string" && row.targetBasketId
    ? [row.targetBasketId]
    : []))];
  const targetSubBasketQueries = useQueries({
    queries: targetSubBasketBasketIds.map((basketId) => ({
      queryKey: [...knowledgeQueryKeys.subBasketLists(basketId), "catalog"],
      queryFn: () => collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(basketId, params), "Sub Basket"),
      staleTime: SUB_BASKET_CATALOG_STALE_TIME_MS
    }))
  });
  const targetSubBaskets = new Map<string, KnowledgeSubBasket>();
  for (const query of targetSubBasketQueries) {
    for (const subBasket of query.data?.items ?? []) {
      if (!removedSubBasketIds.has(subBasket.id)) targetSubBaskets.set(subBasket.id, subBasket);
    }
  }
  const initialValue = useRef({ owner: props.mainLineId, value });
  if (initialValue.current.owner !== props.mainLineId) initialValue.current = { owner: props.mainLineId, value };
  const savedRows = budgetAlterationRows(savedValue ?? initialValue.current.value);
  const rowKey = (row: KnowledgeJsonObject, index: number) => String(row.id ?? index);
  const invalidShape = value !== undefined && (!Array.isArray(value) || rows.length !== value.length);
  const editingIndex = editing?.owner === props.mainLineId
    ? rows.findIndex((row, index) => rowKey(row, index) === editing.ruleId) : -1;
  const editingRow = rows[editingIndex];
  const readOnly = props.readOnly || invalidShape;
  const openEditor = (row: KnowledgeJsonObject, index: number, trigger?: HTMLElement) => {
    validationFocus.current = false;
    initialFocusRef.current = null;
    returnFocusRef.current = trigger ?? fallbackFocusRef.current;
    setEditing({ owner: props.mainLineId, resetKey, ruleId: rowKey(row, index) });
  };
  const addRule = (group: RecommendationGroup, trigger: HTMLElement) => {
    const row = newRecommendationRule(group);
    props.onChange([...rows, row]);
    if (group === "other") setOtherOpen(true);
    openEditor(row, rows.length, trigger);
  };
  useEffect(() => {
    if (validationAttempt === 0) { lastValidationAttempt.current = 0; return; }
    if (validationAttempt <= lastValidationAttempt.current) return;
    const issue = props.issues.find((entry) => /^budgetAlterations\.\d+(?:\.|$)/.test(entry.path));
    if (!issue) return;
    const index = Number(issue.path.split(".")[1]);
    const row = rows[index];
    if (!row) return;
    lastValidationAttempt.current = validationAttempt;
    validationFocus.current = true;
    returnFocusRef.current = fallbackFocusRef.current;
    if (recommendationGroup(row) === "other") setOtherOpen(true);
    setEditing({ owner: props.mainLineId, resetKey, ruleId: rowKey(row, index) });
    const timer = window.setTimeout(() => {
      const invalid = editorRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid");
      (invalid ?? editorRef.current)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [validationAttempt, props.issues, props.mainLineId, resetKey, value]);
  const renderGroup = (group: typeof RECOMMENDATION_GROUPS[number]) => {
    const entries = rows.map((row, index) => ({ row, index })).filter(({ row }) => recommendationGroup(row) === group.key);
    const isExclusion = group.key === "exclusions";
    const Icon = group.key === "mandatory" ? ShieldCheck : group.key === "probable" ? ShieldPlus : group.key === "exclusions" ? ShieldMinus : CircleHelp;
    return <section key={group.key} className={`knowledge-recommendations__group knowledge-recommendations__group--${group.key}`} aria-labelledby={`${id}-${group.key}`}>
      <div className="knowledge-recommendations__group-heading">
        <Icon aria-hidden="true" />
        <div><h4 id={`${id}-${group.key}`}>{group.title}<span className="knowledge-recommendations__count">{entries.length}</span></h4><p>{group.description}</p></div>
        {!readOnly && <Button type="button" variant="secondary" size="compact" leadingIcon={<Plus aria-hidden="true" />} disabled={rows.length >= 100} onClick={(event) => addRule(group.key, event.currentTarget)}>{group.addLabel}</Button>}
      </div>
      {entries.length ? <table className={`knowledge-recommendations__table${isExclusion ? " knowledge-recommendations__table--exclusions" : ""}`} aria-label={group.title}>
        <thead><tr><th scope="col">#</th><th scope="col">Related item</th><th scope="col">Relationship</th><th scope="col">{isExclusion ? "Effect" : "Action"}</th><th scope="col">{isExclusion ? "Condition" : "Applicability"}</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{entries.map(({ row, index }, position) => {
          const targetKind = recommendationTargetKind(row);
          const item = items.find((candidate) => candidate.mainLineId === row.targetMainLineId);
          const subBasketItems = targetKind === "sub_basket" ? items.filter((candidate) => candidate.basketId === row.targetBasketId
            && candidate.subBasketId === row.targetSubBasketId && ["active", "draft"].includes(candidate.status)) : [];
          const targetSubBasket = typeof row.targetSubBasketId === "string" ? targetSubBaskets.get(row.targetSubBasketId) : undefined;
          const subBasketName = targetSubBasket?.name ?? subBasketItems[0]?.subBasketName ?? items.find((candidate) => candidate.basketId === row.targetBasketId
            && candidate.subBasketId === row.targetSubBasketId)?.subBasketName;
          const targetName = targetKind === "sub_basket" ? subBasketName : item?.mainLineName;
          const unresolved = targetKind === "sub_basket"
            ? !targetSubBasket && !items.some((candidate) => candidate.basketId === row.targetBasketId && candidate.subBasketId === row.targetSubBasketId)
            : !item || !["active", "draft"].includes(item.status);
          const completionRequired = targetKind === "sub_basket"
            && (subBasketItems.length === 0 || subBasketItems.some(recommendationItemRequiresCompletion));
          const hasTemporaryChild = targetKind === "sub_basket" && subBasketItems.some((candidate) => candidate.itemType === "temporary");
          const overlap = row.active !== false && (targetKind === "sub_basket"
            ? rows.some((candidate) => candidate !== row && candidate.active !== false && candidate.trigger === row.trigger
              && recommendationTargetKind(candidate) === "main_line" && subBasketItems.some((candidateItem) => candidateItem.mainLineId === candidate.targetMainLineId))
            : Boolean(item?.subBasketId) && rows.some((candidate) => candidate !== row && candidate.active !== false && candidate.trigger === row.trigger
              && recommendationTargetKind(candidate) === "sub_basket" && candidate.targetBasketId === item?.basketId && candidate.targetSubBasketId === item?.subBasketId));
          const rowIssues = props.issues.filter((issue) => issue.path === `budgetAlterations.${index}` || issue.path.startsWith(`budgetAlterations.${index}.`));
          const saved = savedRows.find((candidate) => candidate.id === row.id);
          const unsaved = JSON.stringify(saved) !== JSON.stringify(row);
          const relationship = group.key === "mandatory" ? "Mandatory" : group.key === "probable" ? "Probable" : row.requirement === "must" ? "Required" : row.requirement === "can" ? "Optional" : "Needs review";
          return <tr key={rowKey(row, index)} className={row.active === false ? "knowledge-recommendations__row--disabled" : undefined}>
            <td data-label="#">{position + 1}</td>
            <th scope="row" className="knowledge-recommendations__item"><button type="button" aria-label={`${readOnly ? "View" : "Edit"} rule ${index + 1}: ${targetName ?? (targetKind === "sub_basket" ? "Choose Sub-Basket" : "Choose related item")}`} onClick={(event) => openEditor(row, index, event.currentTarget)}>{targetName ?? ((targetKind === "sub_basket" ? row.targetSubBasketId : row.targetMainLineId) ? `Unavailable ${targetKind === "sub_basket" ? "Sub-Basket" : "related item"}` : `Choose ${targetKind === "sub_basket" ? "Sub-Basket" : "related item"}`)}</button><span>{targetKind === "sub_basket" ? `Whole Sub-Basket · ${basketsLabel(baskets, row.targetBasketId, items)}` : `Line item · ${item?.subBasketName ?? basketsLabel(baskets, row.targetBasketId, items)}`}</span></th>
            <td data-label="Relationship"><span className="knowledge-recommendations__relationship">{relationship}</span></td>
            <td data-label={isExclusion ? "Effect" : "Action"}>{recommendationAction(row)}</td>
            <td data-label={isExclusion ? "Condition" : "Applicability"}>{row.action === "add" ? "When missing from scope" : row.action === "remove" ? "When present in scope" : "Needs review"}</td>
            <td data-label="Status" className="knowledge-recommendations__statuses">
              <span className={`knowledge-recommendations__status${rowIssues.length || unresolved || overlap ? " knowledge-recommendations__status--attention" : unsaved ? " knowledge-recommendations__status--draft" : ""}`}>{rowIssues.length ? "Needs attention" : unresolved ? "Unavailable target" : overlap ? "Overlapping target" : unsaved ? "Unsaved" : savedValue !== undefined ? "Saved" : "Configured"}</span>
              {completionRequired && <span className="knowledge-recommendations__status knowledge-recommendations__status--attention">{hasTemporaryChild ? "Temporary child" : subBasketItems.length ? "Incomplete child" : "Sub-Basket"} · Must be completed</span>}
              {unsaved && (rowIssues.length > 0 || unresolved) && <span className="knowledge-recommendations__status knowledge-recommendations__status--draft">Unsaved</span>}
              {row.active === false && <span className="knowledge-recommendations__status knowledge-recommendations__status--disabled">Disabled</span>}
            </td>
            <td className="knowledge-recommendations__actions"><RuleActions index={index} readOnly={readOnly} active={row.active === true}
              onEdit={(trigger) => openEditor(row, index, trigger)}
              onToggle={() => props.onChange(rows.map((current, i) => i === index ? { ...current, active: !current.active } : current))}
              onRemove={() => { props.onChange(rows.filter((_, i) => i !== index)); fallbackFocusRef.current?.focus(); }} /></td>
          </tr>;
        })}</tbody>
      </table> : <p className="knowledge-recommendations__empty">No {group.key === "mandatory" ? "mandatory additions" : group.key === "probable" ? "probable additions" : group.key === "exclusions" ? "exclusions" : "other scope rules"} configured.</p>}
    </section>;
  };
  return <section className="knowledge-recommendations" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={fallbackFocusRef} tabIndex={-1} className="sr-only">Related scope rules</h3>
    <p className="knowledge-recommendations__intro"><CircleHelp aria-hidden="true" /><span>Define required additions, optional suggestions and exclusions for <strong>{mainLineName}</strong>.</span></p>
    {catalogState.status !== "ready" || catalogState.refreshErrorMessage ? <InlineMessage tone={catalogState.status === "loading" ? "info" : "warning"}>
      {catalogState.status === "loading" ? "Loading related items…" : "Related items could not be fully loaded. Saved selections are retained."}
      {catalogState.onRetry && <Button type="button" variant="secondary" onClick={catalogState.onRetry}>Retry related items</Button>}
    </InlineMessage> : null}
    {invalidShape && <InlineMessage tone="error">Saved rules contain unsupported data. Reload the configuration before editing these rules.</InlineMessage>}
    {RECOMMENDATION_GROUPS.slice(0, 3).map(renderGroup)}
    <details className="knowledge-recommendations__other" open={otherOpen} onToggle={(event) => setOtherOpen(event.currentTarget.open)}>
      <summary>Other scope rules <span className="knowledge-recommendations__count">{rows.filter((row) => recommendationGroup(row) === "other").length}</span><ChevronDown aria-hidden="true" /></summary>
      {renderGroup(RECOMMENDATION_GROUPS[3])}
    </details>
    {editingRow && <Drawer id={`${id}-editor`} open variant="contextual" width="wide" className="knowledge-recommendations__editor" title={`${readOnly ? "View" : "Edit"} scope rule ${editingIndex + 1}`} eyebrow="Recommendations & exclusions"
      description="Changes stay in this section's draft. Select Done to return, then save the section to keep your changes."
      busy={basketCreationBusy} onClose={() => setEditing(null)} initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
      footer={<Button type="button" disabled={basketCreationBusy} onClick={() => setEditing(null)}>Done</Button>}>
      <div ref={(element) => {
        editorRef.current = element;
        if (element && validationFocus.current) initialFocusRef.current = element.querySelector<HTMLElement>("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid") ?? element;
      }} tabIndex={-1}>
        {props.issues.filter((issue) => issue.path === `budgetAlterations.${editingIndex}` || issue.path === `budgetAlterations.${editingIndex}.id` || issue.path === `budgetAlterations.${editingIndex}.active`).map((issue) => <InlineMessage key={issue.path} tone="error">{issue.message}</InlineMessage>)}
        <BudgetAlterationRow key={`${props.mainLineId}:${rowKey(editingRow, editingIndex)}`} {...props} row={editingRow} index={editingIndex}
          baskets={baskets} onBasketBusyChange={setBasketCreationBusy} onBasketCreated={(basket) => {
            setCreatedBaskets((current) => [...current.filter((entry) => entry.id !== basket.id), basket]);
          }}
          items={items} removedSubBasketIds={removedSubBasketIds} mainLineName={mainLineName} catalogState={catalogState} readOnly={readOnly}
          onItemCreated={(item) => {
            setCreatedItems((current) => [...current.filter((entry) => entry.mainLineId !== item.mainLineId), item]);
            props.onItemConfirmed?.(item);
          }}
          onItemUpdated={(item) => {
            if (removedItemIds.has(item.mainLineId)) return;
            setCreatedItems((current) => [...current.filter((entry) => entry.mainLineId !== item.mainLineId), item]);
          }}
          onItemRemoved={(mainLineId) => {
            // Retain saved Line item rules for explicit repair before deletion refreshes their source.
            if (value !== undefined && rows.some((row) => recommendationTargetKind(row) === "main_line" && row.targetMainLineId === mainLineId)) props.onChange(value);
            setCreatedItems((current) => current.filter((entry) => entry.mainLineId !== mainLineId));
            setRemovedItemIds((current) => new Set(current).add(mainLineId));
          }}
          onSubBasketRemoved={(result) => {
            // Preserve even a clean, empty-group rule before reference cleanup refreshes its saved section.
            if (value !== undefined) props.onChange(value);
            const deletedIds = new Set(result.deletedMainLineIds);
            setCreatedItems((current) => current.filter((item) => !deletedIds.has(item.mainLineId)));
            setRemovedItemIds((current) => new Set([...current, ...deletedIds]));
            setRemovedSubBasketIds((current) => new Set(current).add(result.subBasketId));
          }}
          onChange={(next) => props.onChange(rows.map((current, position) => position === editingIndex ? withExplicitRecommendationTargetKind(next) : current))}
          onRemove={() => { props.onChange(rows.filter((_, position) => position !== editingIndex)); setEditing(null); }} />
      </div>
    </Drawer>}
  </section>;
}

function basketsLabel(baskets: readonly KnowledgeBasket[], basketId: KnowledgeJsonValue | undefined, items: readonly KnowledgeItemListItem[] = []) {
  return baskets.find((basket) => basket.id === basketId)?.name
    ?? items.find((item) => item.basketId === basketId)?.basketName
    ?? "Main Basket not selected";
}

function RuleActions({ index, readOnly, active, onEdit, onToggle, onRemove }: {
  index: number; readOnly: boolean; active: boolean; onEdit: (trigger: HTMLElement) => void; onToggle: () => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  return <details ref={ref} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="knowledge-recommendations__menu" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label={`Actions for rule ${index + 1}`} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((current) => !current); }
    }}><MoreVertical aria-hidden="true" /></summary>
    {open && <div className="knowledge-recommendations__menu-items">
      <button type="button" onClick={() => { const trigger = ref.current?.querySelector("summary"); if (ref.current) ref.current.open = false; if (trigger) onEdit(trigger); }}>{readOnly ? "View" : "Edit"} rule {index + 1}</button>
      {!readOnly && <>
        <button type="button" onClick={() => { onToggle(); if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } }}>{active ? "Disable" : "Enable"} rule {index + 1}</button>
        <button type="button" className="ui-button ui-button--destructive-outline" onClick={onRemove}>Remove rule {index + 1}</button>
      </>}
    </div>}
  </details>;
}

function BudgetAlterationRow({ row, index, mainLineId, mainLineName, baskets, items, removedSubBasketIds, readOnly, canCreate, canUpdate = false, canLifecycle = false, canReadCatalog = true, issues, catalogState, onItemCreated, onItemUpdated, onItemRemoved, onSubBasketRemoved, onBasketCreated, onBasketBusyChange,
  onChange, onRemove }: Omit<Props, "value" | "onChange"> & { row: KnowledgeJsonObject; index: number; catalogState: KnowledgeBudgetCatalogState; removedSubBasketIds: ReadonlySet<string>; onSubBasketRemoved: (result: KnowledgePermanentDeleteSubBasketResult) => void; onItemCreated: (item: KnowledgeItemDetail) => void; onItemUpdated: (item: KnowledgeItemDetail) => void; onItemRemoved: (mainLineId: string) => void; onBasketCreated: (basket: KnowledgeBasket) => void; onBasketBusyChange: (busy: boolean) => void; onChange: (row: KnowledgeJsonObject) => void; onRemove: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const ownerMounted = useRef(false);
  useEffect(() => {
    ownerMounted.current = true;
    return () => { ownerMounted.current = false; };
  }, []);
  const [addingBasket, setAddingBasket] = useState(false);
  const [basketBusy, setBasketBusy] = useState(false);
  const [catalogMutationBusy, setCatalogMutationBusy] = useState(false);
  const basketSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    onBasketBusyChange(basketBusy || catalogMutationBusy);
    return () => onBasketBusyChange(false);
  }, [basketBusy, catalogMutationBusy, onBasketBusyChange]);
  const [creatingItem, setCreatingItem] = useState<{ type: "main_line" | "temporary"; name: string; subBasketName: string; purpose: "main_line" | "sub_basket" | "sub_item" } | null>(null);
  const [creationNotice, setCreationNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [highlightedChildId, setHighlightedChildId] = useState("");
  const [catalogDialog, setCatalogDialog] = useState<CatalogDialogState | null>(null);
  const [removingSubBasket, setRemovingSubBasket] = useState<{ basket: KnowledgeBasket; subBasket: KnowledgeSubBasket } | null>(null);
  const [catalogMutationError, setCatalogMutationError] = useState<{ message: string; refreshable: boolean } | null>(null);
  const [catalogDialogRefreshPending, setCatalogDialogRefreshPending] = useState(false);
  const [pendingGroupVersion, setPendingGroupVersion] = useState<PendingGroupVersion | null>(null);
  const [pendingChildFocusId, setPendingChildFocusId] = useState("");
  const catalogReturnFocusRef = useRef<HTMLElement | null>(null);
  const subItemsHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedItemHeadingRef = useRef<HTMLHeadingElement>(null);
  const relatedItemSelectRef = useRef<HTMLSelectElement>(null);
  const catalogSubmissionLocked = useRef(false);
  const addSubItemRef = useRef<HTMLButtonElement>(null);
  const childPrimaryActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const catalogDialogSequence = useRef(0);
  const text = (key: string) => typeof row[key] === "string" ? row[key] as string : "";
  const set = (key: string, next: KnowledgeJsonValue) => onChange({ ...row, [key]: next });
  const error = (key: string) => issues.find((issue) => issue.path === `budgetAlterations.${index}.${key}`)?.message;
  const basketId = text("targetBasketId");
  const subBasketId = text("targetSubBasketId");
  const lineId = text("targetMainLineId");
  const targetKind = recommendationTargetKind(row);
  const temporary = row.targetType === "temporary";
  const subBaskets = useQuery({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basketId), "catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(basketId, params), "Sub Basket"),
    enabled: Boolean(basketId),
    staleTime: SUB_BASKET_CATALOG_STALE_TIME_MS
  });
  const subOptions = (subBaskets.data?.items ?? []).filter((group) => !removedSubBasketIds.has(group.id));
  const availableBaskets = baskets.filter((basket) => basket.status === "active");
  const availableItems = items.filter((item) => item.mainLineId !== mainLineId && item.basketId === basketId
    && (temporary ? item.itemType === "temporary" : item.itemType !== "temporary")
    && (!subBasketId || item.subBasketId === subBasketId) && (item.status === "active" || item.status === "draft"));
  const selectedItem = items.find((item) => item.mainLineId === lineId);
  const selectedItemIdentityMatches = Boolean(selectedItem && selectedItem.basketId === basketId
    && selectedItem.mainLineId !== mainLineId
    && (!subBasketId || selectedItem.subBasketId === subBasketId)
    && (temporary ? selectedItem.itemType === "temporary" : selectedItem.itemType !== "temporary"));
  const selectedItemMismatch = targetKind === "main_line" && Boolean(selectedItem) && !selectedItemIdentityMatches;
  // All Sub-Baskets is a filter, not evidence that the selected item is groupless.
  const effectiveSubBasketId = targetKind === "main_line" && selectedItemIdentityMatches
    ? selectedItem?.subBasketId ?? subBasketId : subBasketId;
  const selectedSubBasket = subOptions.find((group) => group.basketId === basketId && group.id === effectiveSubBasketId);
  const selectedSubBasketName = selectedSubBasket?.name
    ?? items.find((item) => item.basketId === basketId && item.subBasketId === effectiveSubBasketId)?.subBasketName;
  const selectedSubBasketChildren = basketId && effectiveSubBasketId
    ? items.filter((item) => item.basketId === basketId && item.subBasketId === effectiveSubBasketId)
    : [];
  const selectedSubBasketFrozen = selectedSubBasketChildren.some((item) => item.status !== "draft");
  const sourceItem = items.find((item) => item.mainLineId === mainLineId);
  const selectedGroupContainsSource = Boolean(sourceItem && sourceItem.basketId === basketId && sourceItem.subBasketId === effectiveSubBasketId);
  const selectedBasket = baskets.find((basket) => basket.id === basketId);
  const minimumSubBasketVersion = pendingGroupVersion?.basketId === basketId && pendingGroupVersion.subBasketId === effectiveSubBasketId
    ? pendingGroupVersion.version : null;
  const aggregateVersionReady = minimumSubBasketVersion === null
    || Boolean(selectedSubBasket && selectedSubBasket.version > minimumSubBasketVersion);
  const selectedName = targetKind === "sub_basket" ? selectedSubBasketName : selectedItem?.mainLineName;
  const action = BUDGET_ACTIONS.find((choice) => choice.action === row.action && choice.requirement === row.requirement);
  const catalogDisabled = readOnly || basketBusy || catalogMutationBusy || catalogState.status !== "ready" || Boolean(catalogState.refreshErrorMessage);
  const subUnavailable = Boolean(basketId) && (subBaskets.isPending || subBaskets.isError);
  const itemCatalogComplete = catalogState.status === "ready" && !catalogState.refreshing && !catalogState.refreshErrorMessage;
  const catalogMembershipComplete = itemCatalogComplete && !subBaskets.isPending && !subBaskets.isFetching && !subBaskets.isError
    && Boolean(selectedSubBasket) && aggregateVersionReady && !selectedItemMismatch;
  const catalogMutationUnavailable = catalogDisabled || !catalogMembershipComplete;
  const catalogActionsReady = !catalogMutationUnavailable && !selectedSubBasketFrozen;
  const groupRemovalReady = catalogActionsReady && canReadCatalog && canLifecycle && Boolean(selectedBasket && sourceItem)
    && !selectedGroupContainsSource && !refreshWarning && !creatingItem && !catalogDialog;
  const groupRemovalBlockReason = readOnly || !canReadCatalog || !canLifecycle
    ? "You no longer have permission to remove this Sub-Basket."
    : selectedGroupContainsSource ? "This Sub-Basket contains the item whose recommendations you are editing. It cannot be removed from this drawer."
    : selectedSubBasketFrozen ? "This Sub-Basket is frozen because at least one item has left Draft. Review it in Configuration."
    : !sourceItem || !catalogMembershipComplete || refreshWarning ? "The complete current catalog must load before removing this Sub-Basket."
    : removingSubBasket && (removingSubBasket.basket.id !== basketId || removingSubBasket.subBasket.id !== selectedSubBasket?.id)
      ? "The selected Sub-Basket no longer matches the reviewed group. Close this dialog and review the rule target."
      : undefined;
  const openGroupRemoval = (trigger: HTMLElement) => {
    if (!groupRemovalReady || readOnly || !selectedSubBasket || !selectedBasket) return;
    catalogReturnFocusRef.current = trigger;
    setRemovingSubBasket({ basket: selectedBasket, subBasket: selectedSubBasket });
  };
  const directTemporaryItem = targetKind === "main_line" && selectedItemIdentityMatches
    && selectedItem?.itemType === "temporary" && !selectedItem.subBasketId;
  const selectedItemFrozen = Boolean(selectedItem && (selectedItem.status !== "draft"
    || (selectedItem.subBasketId && selectedSubBasketFrozen)));
  const selectedItemCatalogComplete = directTemporaryItem ? itemCatalogComplete : catalogMembershipComplete;
  const selectedItemActionsReady = !catalogDisabled && selectedItemIdentityMatches && selectedItemCatalogComplete
    && !selectedItemFrozen && Boolean(selectedItem?.subBasketId || directTemporaryItem);
  useEffect(() => {
    if (!pendingChildFocusId || catalogMutationBusy || !catalogActionsReady) return;
    const timer = globalThis.setTimeout(() => {
      const target = childPrimaryActionRefs.current.get(pendingChildFocusId);
      if (!target) return;
      target.focus();
      setPendingChildFocusId("");
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [catalogActionsReady, catalogMutationBusy, pendingChildFocusId]);
  useEffect(() => {
    setCatalogMutationError(null);
  }, [basketId, effectiveSubBasketId, lineId]);
  useEffect(() => {
    if (minimumSubBasketVersion !== null && aggregateVersionReady && !catalogState.refreshErrorMessage && !subBaskets.isError) {
      setRefreshWarning("");
    }
  }, [aggregateVersionReady, catalogState.refreshErrorMessage, minimumSubBasketVersion, subBaskets.isError]);
  const suggestions = !temporary && canCreate && !readOnly ? relatedItemSuggestions({
    basket: availableBaskets.find((basket) => basket.id === basketId),
    subBasket: subOptions.find((basket) => basket.id === subBasketId),
    subBasketId, items, catalogReady: !catalogDisabled && !subUnavailable
  }) : [];
  const openCreation = (type: "main_line" | "temporary", purpose: "main_line" | "sub_basket" | "sub_item" = targetKind) => setCreatingItem({
    type, purpose, name: purpose === "sub_basket" ? "Lights" : "", subBasketName: subOptions.find((basket) => basket.id === subBasketId)?.name ?? ""
  });
  const catalogDialogSnapshot = (intent: CatalogDialogIntent): CatalogDialogState | null => {
    const snapshotId = ++catalogDialogSequence.current;
    if (intent.kind === "rename_sub_basket") {
      return selectedSubBasket && !selectedItemMismatch ? {
        kind: intent.kind, snapshotId, basketId, scope: "grouped",
        subBasketId: selectedSubBasket.id, name: selectedSubBasket.name,
        aggregateVersion: selectedSubBasket.version
      } : null;
    }
    const child = targetKind === "sub_basket"
      ? selectedSubBasketChildren.find((candidate) => candidate.mainLineId === intent.mainLineId)
      : selectedItemIdentityMatches && selectedItem?.mainLineId === intent.mainLineId ? selectedItem : undefined;
    if (!child) return null;
    const base = { kind: intent.kind, snapshotId, basketId, mainLineId: child.mainLineId,
      name: child.mainLineName, childVersion: child.version, lastChild: selectedSubBasketChildren.length === 1 };
    if (child.subBasketId) {
      return selectedSubBasket?.id === child.subBasketId
        ? { ...base, scope: "grouped", subBasketId: selectedSubBasket.id, aggregateVersion: selectedSubBasket.version } : null;
    }
    return directTemporaryItem ? { ...base, scope: "direct", subBasketId: null } : null;
  };
  const openCatalogDialog = (intent: CatalogDialogIntent, trigger: HTMLElement) => {
    const snapshot = catalogDialogSnapshot(intent);
    if (!snapshot || catalogSubmissionLocked.current
      || (intent.kind === "rename_sub_basket" ? !catalogActionsReady
        : targetKind === "sub_basket" ? !catalogActionsReady : !selectedItemActionsReady)) return;
    catalogReturnFocusRef.current = trigger;
    setCatalogMutationError(null);
    setCatalogDialogRefreshPending(false);
    setCatalogDialog(snapshot);
  };
  const refreshCatalog = async (requiredVersion = minimumSubBasketVersion) => {
    await refreshKnowledgeSubBasketCatalog(queryClient, basketId);
    if (requiredVersion !== null && cachedSubBasketVersion(queryClient, basketId, effectiveSubBasketId) <= requiredVersion) {
      throw new Error("The latest Sub-Basket version has not loaded yet.");
    }
  };
  const retryCatalogRefresh = async () => {
    try {
      await refreshCatalog();
      setRefreshWarning("");
    } catch {
      setRefreshWarning("The catalog change is saved, but the latest catalog version could not be loaded. Retry catalog refresh before making another inline change.");
    }
  };
  const refreshCatalogDialog = async () => {
    setCatalogMutationBusy(true);
    try {
      await refreshKnowledgeSubBasketCatalog(queryClient, basketId);
      setCatalogDialogRefreshPending(true);
    } catch {
      setCatalogDialogRefreshPending(false);
      setCatalogMutationError({ message: "The latest catalog data could not be loaded. Check your connection and try again.", refreshable: true });
    } finally {
      if (ownerMounted.current) setCatalogMutationBusy(false);
    }
  };
  const saveSubBasketName = async (name: string) => {
    if (catalogDialog?.kind !== "rename_sub_basket" || !canUpdate || !catalogActionsReady || catalogSubmissionLocked.current) return;
    catalogSubmissionLocked.current = true;
    const snapshot = catalogDialog;
    setCatalogMutationBusy(true);
    setCatalogMutationError(null);
    try {
      const updated = await updateKnowledgeSubBasket(snapshot.basketId, snapshot.subBasketId, {
        expectedVersion: snapshot.aggregateVersion,
        name
      });
      commitKnowledgeSubBasketMutation(queryClient, updated);
      setCreationNotice(`${updated.name} was renamed in Configuration. The scope rule still targets the same identities.`);
      setCatalogDialog(null);
      try {
        await refreshCatalog(null);
        setRefreshWarning("");
      } catch {
        setRefreshWarning("The Sub-Basket name was saved, but some catalog lists could not refresh. Retry catalog refresh before making another inline change.");
      }
    } catch (error) {
      setCatalogMutationError(catalogMutationErrorFor(error));
    } finally {
      catalogSubmissionLocked.current = false;
      if (ownerMounted.current) setCatalogMutationBusy(false);
    }
  };
  const saveChildName = async (name: string) => {
    if (catalogDialog?.kind !== "rename_child" || !canUpdate || catalogSubmissionLocked.current
      || !(targetKind === "sub_basket" ? catalogActionsReady : selectedItemActionsReady)) return;
    catalogSubmissionLocked.current = true;
    const snapshot = catalogDialog;
    const aggregateVersion = snapshot.scope === "grouped" ? snapshot.aggregateVersion : null;
    setCatalogMutationBusy(true);
    setCatalogMutationError(null);
    try {
      const updated = await updateKnowledgeMainLine(snapshot.mainLineId, {
        expectedVersion: snapshot.childVersion,
        name,
        ...(snapshot.scope === "grouped"
          ? { draftSubBasketGuard: { subBasketId: snapshot.subBasketId, expectedVersion: snapshot.aggregateVersion } }
          : { draftItemGuard: { basketId: snapshot.basketId, subBasketId: null } })
      });
      commitKnowledgeMainLineMutation(queryClient, updated);
      if (ownerMounted.current) onItemUpdated(updated);
      if (snapshot.scope === "grouped") setPendingGroupVersion({ basketId: snapshot.basketId, subBasketId: snapshot.subBasketId, version: snapshot.aggregateVersion });
      setCreationNotice(`${updated.mainLineName} was renamed in Configuration. The scope rule is unchanged.`);
      setCatalogDialog(null);
      try {
        await refreshCatalog(aggregateVersion);
        setRefreshWarning("");
      } catch {
        setRefreshWarning("The sub-item name was saved, but the latest catalog version could not be loaded. Retry catalog refresh before making another inline change.");
      }
    } catch (error) {
      setCatalogMutationError(catalogMutationErrorFor(error));
    } finally {
      catalogSubmissionLocked.current = false;
      if (ownerMounted.current) setCatalogMutationBusy(false);
    }
  };
  const removeChild = async () => {
    if (catalogDialog?.kind !== "remove_child" || !canLifecycle || catalogSubmissionLocked.current
      || !(targetKind === "sub_basket" ? catalogActionsReady : selectedItemActionsReady)) return;
    catalogSubmissionLocked.current = true;
    const snapshot = catalogDialog;
    const aggregateVersion = snapshot.scope === "grouped" ? snapshot.aggregateVersion : null;
    const removedIndex = selectedSubBasketChildren.findIndex((candidate) => candidate.mainLineId === snapshot.mainLineId);
    const remainingChildren = selectedSubBasketChildren.filter((candidate) => candidate.mainLineId !== snapshot.mainLineId);
    const adjacentChild = remainingChildren[Math.min(Math.max(removedIndex, 0), remainingChildren.length - 1)];
    const returnFocus = targetKind === "main_line" ? relatedItemSelectRef.current
      : addSubItemRef.current ?? (adjacentChild ? childPrimaryActionRefs.current.get(adjacentChild.mainLineId) : null) ?? subItemsHeadingRef.current;
    setCatalogMutationBusy(true);
    setCatalogMutationError(null);
    try {
      await permanentlyDeleteKnowledgeMainLine(snapshot.mainLineId, {
        expectedVersion: snapshot.childVersion,
        reason: targetKind === "sub_basket" ? "Removed from the draft Whole Sub-Basket recommendation editor." : "Removed from the draft Line item recommendation editor.",
        ...(snapshot.scope === "grouped"
          ? { draftSubBasketGuard: { subBasketId: snapshot.subBasketId, expectedVersion: snapshot.aggregateVersion } }
          : { draftItemGuard: { basketId: snapshot.basketId, subBasketId: null } })
      });
      if (ownerMounted.current) onItemRemoved(snapshot.mainLineId);
      commitKnowledgeMainLineRemoval(queryClient, snapshot.mainLineId);
      catalogReturnFocusRef.current = returnFocus;
      if (targetKind === "sub_basket" && !addSubItemRef.current && adjacentChild) setPendingChildFocusId(adjacentChild.mainLineId);
      if (snapshot.scope === "grouped") setPendingGroupVersion({ basketId: snapshot.basketId, subBasketId: snapshot.subBasketId, version: snapshot.aggregateVersion });
      setHighlightedChildId((current) => current === snapshot.mainLineId ? "" : current);
      setCreationNotice(targetKind === "sub_basket"
        ? `${snapshot.name} was permanently removed from Configuration. The Whole Sub-Basket rule target is unchanged.`
        : `${snapshot.name} was permanently removed from Configuration. This rule retains its unavailable target. Choose another item or remove the rule before saving.`);
      setCatalogDialog(null);
      try {
        await refreshCatalog(aggregateVersion);
        setRefreshWarning("");
      } catch {
        setRefreshWarning("The sub-item was removed, but the latest catalog version could not be loaded. Retry catalog refresh before making another inline change.");
      }
    } catch (error) {
      setCatalogMutationError(catalogMutationErrorFor(error));
    } finally {
      catalogSubmissionLocked.current = false;
      if (ownerMounted.current) setCatalogMutationBusy(false);
    }
  };
  const catalogDialogChild = catalogDialog && catalogDialog.kind !== "rename_sub_basket"
    ? items.find((child) => child.mainLineId === catalogDialog.mainLineId)
    : undefined;
  const catalogRefreshSettled = itemCatalogComplete && (catalogDialog?.scope === "direct"
    || (!subBaskets.isPending && !subBaskets.isFetching && !subBaskets.isError));
  useEffect(() => {
    if (!catalogDialog || catalogMutationBusy || !catalogRefreshSettled) return;
    let invalidMessage = "";
    if (readOnly || (catalogDialog.kind === "remove_child" ? !canLifecycle : !canUpdate)) {
      invalidMessage = "You no longer have permission to make this catalog change.";
    } else if (catalogDialog.basketId !== basketId || selectedItemMismatch) {
      invalidMessage = "The selected catalog identity no longer matches this rule. Choose the intended target before editing.";
    } else if (catalogDialog.scope === "grouped" && (!selectedSubBasket || selectedSubBasket.id !== catalogDialog.subBasketId)) {
      invalidMessage = "The selected Sub-Basket is no longer available in Configuration. Choose another target before saving this rule.";
    } else if (catalogDialog.scope === "grouped" && selectedSubBasketFrozen) {
      invalidMessage = "This Sub-Basket is now frozen in Configuration. Inline catalog changes were closed.";
    } else if (catalogDialog.kind !== "rename_sub_basket" && (!catalogDialogChild || catalogDialogChild.basketId !== catalogDialog.basketId
      || (catalogDialogChild.subBasketId ?? null) !== catalogDialog.subBasketId)) {
      invalidMessage = "The selected item is no longer available under this parent. The catalog change dialog was closed.";
    } else if (catalogDialog.kind !== "rename_sub_basket" && catalogDialogChild?.status !== "draft") {
      invalidMessage = "This item is now frozen in Configuration. Inline catalog changes were closed.";
    }
    if (invalidMessage) {
      setCatalogDialog(null);
      setCatalogDialogRefreshPending(false);
      setCreationNotice(invalidMessage);
      return;
    }
    if (catalogDialogRefreshPending) {
      const refreshed = catalogDialogSnapshot(catalogDialog.kind === "rename_sub_basket"
        ? { kind: "rename_sub_basket" }
        : { kind: catalogDialog.kind, mainLineId: catalogDialog.mainLineId });
      // Keep the mounted dialog and its entered text; only replace the reviewed snapshot.
      if (refreshed) setCatalogDialog({ ...refreshed, snapshotId: catalogDialog.snapshotId, refreshed: true });
      setCatalogMutationError(null);
      setCatalogDialogRefreshPending(false);
    }
  }, [catalogDialog, catalogDialogChild, catalogDialogRefreshPending, catalogMutationBusy, catalogRefreshSettled, selectedSubBasket, selectedSubBasketFrozen, selectedItemMismatch, basketId, readOnly, canUpdate, canLifecycle]);
  return <article className="knowledge-budget-rule" aria-labelledby={`${id}-title`}>
    <div className="knowledge-budget-rule__heading">
      <p id={`${id}-title`} className="sr-only">Rule {index + 1}</p>
      <span className={`knowledge-budget-rule__badge${row.requirement === "must" ? " knowledge-budget-rule__badge--required" : ""}`}>{row.requirement === "must" ? "Required" : "Optional"}</span>
      <label className="knowledge-budget-rule__enabled"><Checkbox checked={row.active === true} disabled={readOnly || basketBusy} onChange={(event) => set("active", event.target.checked)} />Enabled</label>
      {!readOnly && <Button type="button" variant="destructive-outline" size="compact" aria-label={`Remove rule ${index + 1}`} disabled={basketBusy} onClick={onRemove}>Remove rule</Button>}
    </div>
    <div className="knowledge-budget-rule__condition">
      <Field id={`${id}-target-kind`} label="Addition type" required error={error("targetKind")}>
        {(control) => <Select {...control} value={targetKind} disabled={readOnly || basketBusy} onChange={(event) => {
          const next = event.target.value as "main_line" | "sub_basket";
          if (next === targetKind) return;
          if ((lineId || subBasketId) && !globalThis.confirm("Changing the addition type clears the selected target. Continue?")) return;
          onChange({ ...row, targetKind: next, targetType: next === "sub_basket" ? null : "catalog",
            targetSubBasketId: null, targetMainLineId: null });
        }}><option value="main_line">Line item</option><option value="sub_basket">Whole Sub-Basket</option></Select>}
      </Field>
      <Field id={`${id}-trigger`} label="What happens if?" required error={error("trigger")}>
        {(control) => <Select {...control} value={text("trigger")} disabled={readOnly || basketBusy} onChange={(event) => set("trigger", event.target.value)}>
          <option value="removed">The item is removed from scope</option><option value="added">The item is added to scope</option>
        </Select>}
      </Field>
      <Field id={`${id}-action`} label="Scope action" required error={error("action")}>
        {(control) => <Select {...control} value={action?.value ?? ""} disabled={readOnly || basketBusy} onChange={(event) => {
          const choice = BUDGET_ACTIONS.find((candidate) => candidate.value === event.target.value)!;
          onChange({ ...row, action: choice.action, requirement: choice.requirement });
        }}>{BUDGET_ACTIONS.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select>}
      </Field>
      {targetKind === "main_line" && <Field id={`${id}-type`} label="Item type" required error={error("targetType")}>
        {(control) => <Select {...control} value={text("targetType")} disabled={readOnly || basketBusy} onChange={(event) => onChange({ ...row, targetType: event.target.value, targetMainLineId: null })}>
          <option value="catalog">Catalog item</option><option value="temporary">Temporary item</option>
        </Select>}
      </Field>}
    </div>
    <div className="knowledge-budget-rule__targets">
      <Field id={`${id}-basket`} label="Main Basket" required error={error("targetBasketId")}>
        {(control) => <Select {...control} ref={basketSelectRef} value={basketId} disabled={catalogDisabled || addingBasket} onChange={(event) => {
          if (event.target.value === ADD_MAIN_BASKET) { setAddingBasket(true); setCreationNotice(""); }
          else onChange({ ...row, targetBasketId: event.target.value, targetSubBasketId: null, targetMainLineId: null });
        }}>
          <option value="">Select Main Basket</option>
          {basketId && !availableBaskets.some((basket) => basket.id === basketId) && <option value={basketId} disabled>{items.find((item) => item.basketId === basketId)?.basketName ?? "Unavailable Main Basket"}</option>}
          {availableBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
          {!readOnly && canCreate && <option value={ADD_MAIN_BASKET}>Add Main Basket</option>}
        </Select>}
      </Field>
      {addingBasket && !readOnly && canCreate && <CreateKnowledgeBasketFields onBusyChange={setBasketBusy}
        onCancel={() => { setAddingBasket(false); globalThis.setTimeout(() => basketSelectRef.current?.focus(), 0); }}
        onCreated={(basket, notice) => {
          onBasketCreated(basket);
          onChange({ ...row, targetBasketId: basket.id, targetSubBasketId: null, targetMainLineId: null });
          setCreationNotice(notice);
          setAddingBasket(false);
          globalThis.setTimeout(() => basketSelectRef.current?.focus(), 0);
        }} />}
      <Field id={`${id}-sub-basket`} label="Sub Basket" required={targetKind === "sub_basket"} error={error("targetSubBasketId")}>
        {(control) => <Select {...control} value={subBasketId} disabled={catalogDisabled || !basketId || subUnavailable} onChange={(event) => onChange({ ...row,
          targetSubBasketId: event.target.value || null, targetMainLineId: null })}>
          <option value="">{targetKind === "sub_basket" ? "Select Sub-Basket" : "All Sub-Baskets"}</option>
          {subBasketId && !subOptions.some((basket) => basket.id === subBasketId) && <option value={subBasketId} disabled>{selectedSubBasketName ?? "Unavailable Sub-Basket"}</option>}
          {subOptions.map((basket) => {
            const children = items.filter((item) => item.basketId === basketId && item.subBasketId === basket.id && ["active", "draft"].includes(item.status));
            const containsSource = targetKind === "sub_basket" && children.some((item) => item.mainLineId === mainLineId);
            const emptyWithoutCreateAccess = targetKind === "sub_basket" && children.length === 0 && !canCreate;
            return <option key={basket.id} value={basket.id} disabled={containsSource || emptyWithoutCreateAccess}>{basket.name}{targetKind === "sub_basket" ? containsSource ? " · Contains this item" : children.length === 0 ? canCreate ? " · Empty · Add a sub-item" : " · Empty" : ` · ${children.length} item${children.length === 1 ? "" : "s"}` : ""}</option>;
          })}
        </Select>}
      </Field>
      {targetKind === "main_line" && <Field id={`${id}-line`} label="Related item" required error={error("targetMainLineId")}>
        {(control) => <Select {...control} ref={relatedItemSelectRef} value={lineId} disabled={catalogDisabled || !basketId || subUnavailable} onChange={(event) => {
          const suggestion = suggestions.find((candidate) => `suggestion:${candidate.key}` === event.target.value);
          if (suggestion) {
            setCreatingItem({ type: "main_line", purpose: "main_line", name: suggestion.name, subBasketName: suggestion.subBasketName });
            return;
          }
          const item = availableItems.find((candidate) => candidate.mainLineId === event.target.value);
          onChange({ ...row, targetMainLineId: item?.mainLineId ?? null, targetSubBasketId: item?.subBasketId ?? null });
        }}>
          <option value="">Select related item</option>
          {lineId && !availableItems.some((item) => item.mainLineId === lineId) && <option value={lineId} disabled>{selectedItem?.mainLineName ?? "Unavailable related item"}</option>}
          {availableItems.length > 0 && <optgroup label="Existing items">
            {availableItems.map((item) => <option key={item.mainLineId} value={item.mainLineId}>{item.mainLineName}{!subBasketId && item.subBasketName ? ` · ${item.subBasketName}` : ""}</option>)}
          </optgroup>}
          {suggestions.length > 0 && <optgroup label="Suggested items — add to catalog">
            {suggestions.map((suggestion) => <option key={suggestion.key} value={`suggestion:${suggestion.key}`}>{suggestion.name}{!subBasketId ? ` · ${suggestion.subBasketName}` : ""}</option>)}
          </optgroup>}
        </Select>}
      </Field>}
    </div>
    {basketId && subBaskets.isPending && <p role="status">Loading Sub Baskets…</p>}
    {basketId && subBaskets.isError && <InlineMessage tone="warning">Sub Baskets could not be loaded. <Button type="button" variant="secondary" onClick={() => void subBaskets.refetch()}>Retry Sub Baskets</Button></InlineMessage>}
    {!basketId && <p className="knowledge-budget-alterations__help">Select a Main Basket to see related items.</p>}
    {targetKind === "main_line" && basketId && effectiveSubBasketId && <section className="knowledge-budget-rule__sub-items" aria-labelledby={`${id}-selected-group`}>
      <div className="knowledge-budget-rule__sub-items-heading">
        <div><h3 id={`${id}-selected-group`} ref={subItemsHeadingRef} tabIndex={-1}>Sub-Basket</h3><p><strong>{selectedSubBasketName ?? "Unavailable Sub-Basket"}</strong></p></div>
        <div className="knowledge-budget-rule__sub-items-actions">
          {!readOnly && canUpdate && catalogActionsReady && <Button type="button" variant="quiet" size="compact" leadingIcon={<Pencil aria-hidden="true" />}
            aria-label={`Edit Sub-Basket name ${selectedSubBasketName ?? ""}`.trim()}
            onClick={(event) => openCatalogDialog({ kind: "rename_sub_basket" }, event.currentTarget)}>Edit name</Button>}
          {!readOnly && groupRemovalReady && <Button type="button" variant="destructive-outline" size="compact" leadingIcon={<Trash2 aria-hidden="true" />}
            aria-label={`Remove Sub-Basket ${selectedSubBasketName ?? ""}`.trim()}
            onClick={(event) => openGroupRemoval(event.currentTarget)}>Remove</Button>}
        </div>
      </div>
      {selectedGroupContainsSource && canReadCatalog ? <InlineMessage tone="warning">
        This Sub-Basket contains the item whose recommendations you are editing. It cannot be removed from this drawer.
        {" "}<Link to={`/admin/configuration/estimation/items/${encodeURIComponent(mainLineId)}`} target="_blank" rel="noopener noreferrer">Open source item in Configuration</Link>
      </InlineMessage> : null}
      {removedSubBasketIds.has(effectiveSubBasketId) ? <InlineMessage tone="warning">This Sub-Basket was removed from Configuration. Choose another target or remove this rule before saving.</InlineMessage> : null}
      {!catalogMembershipComplete && !readOnly && !removedSubBasketIds.has(effectiveSubBasketId) ? <p className="knowledge-budget-rule__catalog-state" role="status">
        {selectedItemMismatch ? "The selected item does not match this rule's Main Basket or Sub-Basket. Choose the intended item before editing."
          : minimumSubBasketVersion !== null && !aggregateVersionReady ? "Loading the latest Sub-Basket version before more catalog changes…"
          : "Checking Sub-Basket draft status before enabling catalog changes…"}
      </p> : null}
      {catalogMembershipComplete && selectedSubBasketFrozen ? <div className="knowledge-budget-rule__frozen" role="note">
        <div><strong>Frozen in Configuration</strong><p>At least one sub-item has left Draft. Manage this Sub-Basket from the main Configuration workspace.</p></div>
      </div> : null}
    </section>}
    {targetKind === "main_line" && lineId && <section className="knowledge-budget-rule__sub-items" aria-labelledby={`${id}-selected-item`}>
      <div className="knowledge-budget-rule__sub-items-heading">
        <div><h3 id={`${id}-selected-item`} ref={selectedItemHeadingRef} tabIndex={-1}>Selected item</h3>
          <p><strong>{selectedItem?.mainLineName ?? "Unavailable related item"}</strong></p>
          {selectedItem && <p>{selectedItem.itemType === "temporary" ? "Temporary item" : "Catalog item"} · {selectedItem.status === "draft" ? "Draft" : selectedItem.status === "active" ? "Active" : selectedItem.status === "inactive" ? "Inactive" : "Archived"}</p>}
        </div>
        {!readOnly && selectedItem && selectedItemActionsReady && (canUpdate || canLifecycle) ? <div className="knowledge-budget-rule__sub-items-actions knowledge-budget-rule__sub-item-actions">
          {canUpdate && <Button type="button" variant="quiet" size="compact" leadingIcon={<Pencil aria-hidden="true" />} aria-label="Edit item name" onClick={(event) => openCatalogDialog({ kind: "rename_child", mainLineId: selectedItem.mainLineId }, event.currentTarget)}>Edit</Button>}
          {canLifecycle && <Button type="button" variant="destructive-outline" size="compact" leadingIcon={<Trash2 aria-hidden="true" />} aria-label="Remove item" onClick={(event) => openCatalogDialog({ kind: "remove_child", mainLineId: selectedItem.mainLineId }, event.currentTarget)}>Remove</Button>}
        </div> : null}
      </div>
      {!selectedItem || selectedItemMismatch ? <InlineMessage tone="warning">This rule's selected item is unavailable or its parent no longer matches. Choose another item or remove the rule before saving.</InlineMessage>
        : !selectedItemCatalogComplete && !readOnly ? <p className="knowledge-budget-rule__catalog-state" role="status">Checking item draft status before enabling catalog changes…</p>
        : selectedItemFrozen ? <div className="knowledge-budget-rule__frozen" role="note"><div><strong>Frozen in Configuration</strong><p>{selectedItem.subBasketId ? "This item or another member of its Sub-Basket has left Draft." : "This item has left Draft."}</p></div></div>
        : !selectedItem.subBasketId && !directTemporaryItem ? <p className="knowledge-budget-rule__catalog-state">Manage this catalog item from Configuration.</p> : null}
      {selectedItem && selectedItemIdentityMatches && canReadCatalog && !selectedItemActionsReady && <Link className="knowledge-budget-rule__sub-item-open" to={`/admin/configuration/estimation/items/${encodeURIComponent(selectedItem.mainLineId)}`} target="_blank" rel="noopener noreferrer">Open item in Configuration</Link>}
    </section>}
    {targetKind === "sub_basket" && basketId && subBasketId && <section className="knowledge-budget-rule__sub-items" aria-labelledby={`${id}-sub-items`}>
      <div className="knowledge-budget-rule__sub-items-heading">
        <div><h3 id={`${id}-sub-items`} ref={subItemsHeadingRef} tabIndex={-1}>Sub-items</h3><p><strong>{selectedSubBasketName ?? "Selected Sub-Basket"}</strong> · Items currently included in this Whole Sub-Basket recommendation.</p></div>
        <div className="knowledge-budget-rule__sub-items-actions">
          {!readOnly && canUpdate && catalogActionsReady && <Button type="button" variant="quiet" size="compact" leadingIcon={<Pencil aria-hidden="true" />}
            aria-label={`Edit Sub-Basket name ${selectedSubBasketName ?? ""}`.trim()}
            onClick={(event) => openCatalogDialog({ kind: "rename_sub_basket" }, event.currentTarget)}>Edit name</Button>}
          {!readOnly && groupRemovalReady && <Button type="button" variant="destructive-outline" size="compact" leadingIcon={<Trash2 aria-hidden="true" />}
            aria-label={`Remove Sub-Basket ${selectedSubBasketName ?? ""}`.trim()}
            onClick={(event) => openGroupRemoval(event.currentTarget)}>Remove</Button>}
          {!readOnly && canCreate && catalogMembershipComplete && !selectedSubBasketFrozen && <Button ref={addSubItemRef} type="button" variant="secondary" size="compact" leadingIcon={<Plus aria-hidden="true" />}
            disabled={!selectedSubBasketName}
            onClick={() => openCreation("main_line", "sub_item")}>Add sub-item</Button>}
        </div>
      </div>
      {selectedGroupContainsSource && canReadCatalog ? <InlineMessage tone="warning">
        This Sub-Basket contains the item whose recommendations you are editing. It cannot be removed from this drawer.
        {" "}<Link to={`/admin/configuration/estimation/items/${encodeURIComponent(mainLineId)}`} target="_blank" rel="noopener noreferrer">Open source item in Configuration</Link>
      </InlineMessage> : null}
      {removedSubBasketIds.has(effectiveSubBasketId) ? <InlineMessage tone="warning">This Sub-Basket was removed from Configuration. Choose another target or remove this rule before saving.</InlineMessage> : null}
      {!catalogMembershipComplete && !readOnly && !removedSubBasketIds.has(effectiveSubBasketId) ? <p className="knowledge-budget-rule__catalog-state" role="status">
        {minimumSubBasketVersion !== null && !aggregateVersionReady ? "Loading the latest Sub-Basket version before more catalog changes…" : "Checking Sub-Basket draft status before enabling catalog changes…"}
      </p> : null}
      {catalogMembershipComplete && selectedSubBasketFrozen ? <div className="knowledge-budget-rule__frozen" role="note">
        <LockKeyhole aria-hidden="true" />
        <div><strong>Frozen in Configuration</strong><p>At least one sub-item has left Draft. Manage this Sub-Basket from the main Configuration workspace.</p></div>
      </div> : null}
      {selectedSubBasketChildren.length > 0 ? <ul className="knowledge-budget-rule__sub-item-list">
        {selectedSubBasketChildren.map((child) => {
          const available = child.status === "active" || child.status === "draft";
          const childNeedsCompletion = recommendationItemRequiresCompletion(child);
          return <li key={child.mainLineId} className={highlightedChildId === child.mainLineId ? "knowledge-budget-rule__sub-item--new" : undefined}>
            <div className="knowledge-budget-rule__sub-item-content">
              <span className="knowledge-budget-rule__sub-item-name">{child.mainLineName}</span>
              <span>{child.itemType === "temporary" ? "Temporary item" : "Catalog item"}</span>
              <span>{available ? child.status === "active" ? "Active" : "Draft" : child.status === "inactive" ? "Inactive" : "Archived"}</span>
              {childNeedsCompletion && <span className="knowledge-recommendations__status knowledge-recommendations__status--attention">Must be completed</span>}
              {highlightedChildId === child.mainLineId && <span className="knowledge-recommendations__status">Added</span>}
            </div>
            {!readOnly && catalogActionsReady && (canUpdate || canLifecycle) ? <div className="knowledge-budget-rule__sub-item-actions">
              {canUpdate ? <Button ref={(element) => {
                if (element) childPrimaryActionRefs.current.set(child.mainLineId, element);
                else childPrimaryActionRefs.current.delete(child.mainLineId);
              }} type="button" variant="quiet" size="compact" leadingIcon={<Pencil aria-hidden="true" />}
                aria-label={`Edit ${child.mainLineName}`} onClick={(event) => openCatalogDialog({ kind: "rename_child", mainLineId: child.mainLineId }, event.currentTarget)}>Edit</Button> : null}
              {canLifecycle ? <Button ref={!canUpdate ? (element) => {
                if (element) childPrimaryActionRefs.current.set(child.mainLineId, element);
                else childPrimaryActionRefs.current.delete(child.mainLineId);
              } : undefined} type="button" variant="destructive-outline" size="compact" leadingIcon={<Trash2 aria-hidden="true" />}
                aria-label={`Remove ${child.mainLineName}`} onClick={(event) => openCatalogDialog({ kind: "remove_child", mainLineId: child.mainLineId }, event.currentTarget)}>Remove</Button> : null}
            </div> : catalogMembershipComplete && selectedSubBasketFrozen && canReadCatalog ? <Link className="knowledge-budget-rule__sub-item-open" to={`/admin/configuration/estimation/items/${encodeURIComponent(child.mainLineId)}`} target="_blank" rel="noopener noreferrer"
              aria-label={`Open ${child.mainLineName} in Configuration`}>Open in Configuration</Link> : null}
          </li>;
        })}
      </ul> : <p className="knowledge-budget-rule__sub-items-empty">No sub-items are available in this Sub-Basket.</p>}
    </section>}
    {targetKind === "main_line" && basketId && !catalogDisabled && !subUnavailable && !availableItems.length && !suggestions.length && <p className="knowledge-budget-alterations__help">
      No related items available.{subBasketId && !temporary ? " Choose All Sub Baskets to see more items and suggestions." : ""}
    </p>}
    <div className="knowledge-budget-rule__temporary">
      <span>{targetKind === "sub_basket" ? "Need a new Sub-Basket? Add a temporary item such as Lights. The estimator can choose the exact item later." : temporary ? "Temporary items have Overview, Mode and Quality Parameters." : "Item missing from the catalog?"}</span>
      {!readOnly && canCreate && <>
        {targetKind === "sub_basket"
          ? <Button type="button" variant="secondary" size="compact" disabled={catalogDisabled || subUnavailable} onClick={() => openCreation("temporary", "sub_basket")}>Add Sub-Basket</Button>
          : <><Button type="button" variant="secondary" size="compact" disabled={!basketId || catalogDisabled || subUnavailable} onClick={() => openCreation(temporary ? "temporary" : "main_line")}>Add related item</Button>
            {!temporary && <Button type="button" variant="quiet" size="compact" disabled={catalogDisabled || subUnavailable} onClick={() => openCreation("temporary")}>Add temporary item</Button>}</>}
      </>}
      {targetKind === "main_line" && temporary && canReadCatalog && selectedItemIdentityMatches && selectedItem && <Link to={`/admin/configuration/estimation/items/${encodeURIComponent(selectedItem.mainLineId)}`} target="_blank" rel="noopener noreferrer">Configure temporary item</Link>}
    </div>
    {creationNotice && <p role="status" className="knowledge-budget-alterations__help">{creationNotice}</p>}
    {refreshWarning && <InlineMessage tone="warning" role="status" label="Catalog refresh status">{refreshWarning} <Button type="button" variant="quiet" size="compact" onClick={() => void retryCatalogRefresh()}>Retry catalog refresh</Button></InlineMessage>}
    {creatingItem && !readOnly && canCreate && <CreateKnowledgeItemDialog context={creatingItem.purpose === "sub_basket" ? "sub-basket" : creatingItem.purpose === "sub_item" ? "sub-item" : "related-item"} itemType={creatingItem.type}
      initialBasketId={basketId} initialSubBasketId={creatingItem.purpose === "sub_basket" ? "" : subBasketId} initialName={creatingItem.name} initialSubBasketName={creatingItem.subBasketName}
      canCreateBasket onBasketCreated={onBasketCreated} excludeMainLineId={mainLineId} onRefreshError={(message) => { if (ownerMounted.current) setRefreshWarning(message); }}
      onClose={() => setCreatingItem(null)} onCreated={async (createdId, detail, creationInput) => {
        if (!ownerMounted.current) return;
        const created = detail ?? queryClient.getQueryData<KnowledgeItemDetail>(knowledgeQueryKeys.item(createdId));
        if (!created || created.mainLineId !== createdId || createdId === mainLineId) return;
        if (creatingItem.purpose === "sub_basket" && !created.subBasketId) {
          throw new Error("The saved item did not return a Sub-Basket identity.");
        }
        const changedParent = creatingItem.purpose === "sub_item" && creationInput && creationInput.basketId !== basketId;
        if (creatingItem.purpose === "sub_item" && (!created.subBasketId || (changedParent
          ? created.basketId !== creationInput.basketId
          : created.basketId !== basketId || created.subBasketId !== subBasketId))) {
          throw new Error("The saved item did not return under the selected Sub-Basket.");
        }
        const createdGroup = subOptions.find((group) => group.id === created.subBasketId && group.basketId === created.basketId);
        const alreadyKnownItem = items.some((item) => item.mainLineId === created.mainLineId);
        if (createdGroup && !alreadyKnownItem) {
          setPendingGroupVersion({ basketId: created.basketId, subBasketId: createdGroup.id, version: createdGroup.version });
        }
        onItemCreated(created);
        if (creatingItem.purpose === "sub_item") {
          const alreadySelectedMember = selectedSubBasketChildren.some((child) => child.mainLineId === created.mainLineId);
          if (!changedParent && selectedSubBasket && !alreadySelectedMember) {
            setPendingGroupVersion({ basketId, subBasketId: selectedSubBasket.id, version: selectedSubBasket.version });
          }
          setHighlightedChildId(created.mainLineId);
          if (changedParent) {
            onChange({ ...row, targetKind: "sub_basket", targetType: null, targetBasketId: created.basketId,
              targetSubBasketId: created.subBasketId ?? null, targetMainLineId: null });
            setCreationNotice(`${created.mainLineName} was added under ${created.subBasketName}. Save this section to keep the new Main Basket and Sub-Basket target.`);
          } else setCreationNotice(`${created.mainLineName} was added under ${selectedSubBasketName ?? "the selected Sub-Basket"}. The Whole Sub-Basket recommendation target is unchanged.`);
        } else onChange(creatingItem.purpose === "sub_basket"
          ? { ...row, targetKind: "sub_basket", targetType: null, targetBasketId: created.basketId,
            targetSubBasketId: created.subBasketId ?? null, targetMainLineId: null }
          : { ...row, targetKind: "main_line", targetType: created.itemType === "temporary" ? "temporary" : "catalog", targetBasketId: created.basketId,
            targetSubBasketId: created.subBasketId ?? null, targetMainLineId: createdId });
        if (creatingItem.purpose !== "sub_item") setCreationNotice(creatingItem.purpose === "sub_basket"
          ? `${created.subBasketName ?? "Sub-Basket"} and temporary item ${created.mainLineName} are in Configuration. Save this section to keep the rule change.`
          : `${created.mainLineName} is in the catalog. Save this section to keep the rule change.`);
        setRefreshWarning("");
        setCreatingItem(null);
      }} />}
    {removingSubBasket ? <KnowledgeSubBasketDeleteDialog
      basket={removingSubBasket.basket} subBasket={removingSubBasket.subBasket} inline
      disabledReason={groupRemovalBlockReason} onBusyChange={setCatalogMutationBusy}
      onRefreshError={setRefreshWarning}
      returnFocusRef={catalogReturnFocusRef} fallbackFocusRef={targetKind === "main_line" ? selectedItemHeadingRef : subItemsHeadingRef}
      onCommitted={(result) => {
        onSubBasketRemoved(result);
        setPendingGroupVersion(null);
        catalogReturnFocusRef.current = targetKind === "main_line" ? selectedItemHeadingRef.current : subItemsHeadingRef.current;
        setCreationNotice(`${removingSubBasket.subBasket.name} was permanently removed from Configuration. This rule retains its unavailable target. Choose another target or remove the rule before saving.`);
      }}
      onClose={() => setRemovingSubBasket(null)}
      onDeleted={() => { setRefreshWarning(""); setRemovingSubBasket(null); }}
    /> : null}
    {catalogDialog?.kind === "rename_sub_basket" && selectedSubBasket ? <KnowledgeCatalogRenameDialog
      key={`sub-basket-${catalogDialog.subBasketId}-${catalogDialog.snapshotId}`}
      kind="sub_basket"
      currentName={catalogDialog.name}
      reviewedVersion={catalogDialog.refreshed ? catalogDialog.aggregateVersion : undefined}
      busy={catalogMutationBusy}
      error={catalogMutationError?.message}
      onRefresh={catalogMutationError?.refreshable ? () => void refreshCatalogDialog() : undefined}
      onClose={() => { setCatalogDialog(null); setCatalogMutationError(null); setCatalogDialogRefreshPending(false); }}
      onSave={(name) => void saveSubBasketName(name)}
      returnFocusRef={catalogReturnFocusRef}
      fallbackFocusRef={subItemsHeadingRef}
    /> : null}
    {catalogDialog?.kind === "rename_child" && catalogDialogChild ? <KnowledgeCatalogRenameDialog
      key={`sub-item-${catalogDialog.mainLineId}-${catalogDialog.snapshotId}`}
      kind={targetKind === "main_line" ? "item" : "sub_item"}
      currentName={catalogDialog.name}
      reviewedVersion={catalogDialog.refreshed ? catalogDialog.childVersion : undefined}
      busy={catalogMutationBusy}
      error={catalogMutationError?.message}
      onRefresh={catalogMutationError?.refreshable ? () => void refreshCatalogDialog() : undefined}
      onClose={() => { setCatalogDialog(null); setCatalogMutationError(null); setCatalogDialogRefreshPending(false); }}
      onSave={(name) => void saveChildName(name)}
      returnFocusRef={catalogReturnFocusRef}
      fallbackFocusRef={targetKind === "main_line" ? selectedItemHeadingRef : subItemsHeadingRef}
    /> : null}
    {catalogDialog?.kind === "remove_child" && catalogDialogChild ? <KnowledgeSubItemRemovalDialog
      key={`remove-sub-item-${catalogDialog.mainLineId}-${catalogDialog.snapshotId}`}
      name={catalogDialog.name}
      lastChild={catalogDialog.lastChild}
      context={targetKind === "main_line" ? "line_item" : "whole_sub_basket"}
      busy={catalogMutationBusy}
      error={catalogMutationError?.message}
      onRefresh={catalogMutationError?.refreshable ? () => void refreshCatalogDialog() : undefined}
      onClose={() => { setCatalogDialog(null); setCatalogMutationError(null); setCatalogDialogRefreshPending(false); }}
      onConfirm={() => void removeChild()}
      returnFocusRef={catalogReturnFocusRef}
      fallbackFocusRef={targetKind === "main_line" ? selectedItemHeadingRef : subItemsHeadingRef}
    /> : null}
    <Field id={`${id}-reason`} label="Why is this change needed?" required error={error("reason")}>
      {(control) => <Textarea {...control} rows={2} value={text("reason")} maxLength={4000} disabled={readOnly || basketBusy}
        placeholder="Explain the design impact, dependency or budget choice."
        onChange={(event) => set("reason", event.target.value)} />}
    </Field>
    <div className="knowledge-budget-rule__preview" aria-label="Scope change summary">
      <p>If <strong>{mainLineName}</strong> is {row.trigger === "added" ? "added to" : "removed from"} scope, <strong>{selectedName || (targetKind === "sub_basket" ? "the selected Sub-Basket" : "the selected item")}</strong> {action?.label.toLowerCase() ?? "needs a scope decision"}.</p>
      {text("reason").trim() && <p><strong>Why:</strong> {text("reason")}</p>}
      <p className="knowledge-budget-rule__application">{row.active === false ? "Disabled — this rule will not be used." : row.action === "remove" ? "Applies only when the related item is in scope." : "Add the related item only if it is missing from scope."}</p>
    </div>
  </article>;
}

function cachedSubBasketVersion(
  queryClient: QueryClient,
  basketId: string,
  subBasketId: string
): number {
  let version = -1;
  for (const [, page] of queryClient.getQueriesData<KnowledgeSubBasketListResponse>({
    queryKey: knowledgeQueryKeys.subBasketLists(basketId)
  })) {
    const candidate = page?.items.find((entry) => entry.id === subBasketId);
    if (candidate) version = Math.max(version, candidate.version);
  }
  return version;
}

function catalogMutationErrorFor(error: unknown): { message: string; refreshable: boolean } {
  if (!(error instanceof ApiError)) {
    return { message: error instanceof Error ? error.message : "The catalog change could not be saved.", refreshable: false };
  }
  switch (error.code) {
    case "VERSION_CONFLICT":
      return { message: "This catalog changed elsewhere. Refresh the catalog before saving again.", refreshable: true };
    case "ITEM_FROZEN":
      return { message: "This item is frozen because it is no longer Draft. Refresh to review the latest status.", refreshable: true };
    case "ITEM_PARENT_MISMATCH":
      return { message: "This item no longer belongs directly to the selected Main Basket. Refresh before continuing.", refreshable: true };
    case "SUB_BASKET_FROZEN":
      return { message: "This Sub-Basket is frozen because one or more sub-items are no longer Draft. Refresh to review the latest status.", refreshable: true };
    case "SUB_BASKET_PARENT_MISMATCH":
      return { message: "This sub-item no longer belongs to the selected Sub-Basket. Refresh before continuing.", refreshable: true };
    case "DUPLICATE_IDENTITY":
      return { message: "That name is already used in this Main Basket. Choose a different name.", refreshable: false };
    case "NOT_FOUND":
      return { message: "This catalog entry no longer exists. Refresh the catalog to continue.", refreshable: true };
    case "FORBIDDEN":
      return { message: "You no longer have permission to make this catalog change.", refreshable: false };
    default:
      return { message: error.message || "The catalog change could not be saved.", refreshable: error.status === 409 };
  }
}
