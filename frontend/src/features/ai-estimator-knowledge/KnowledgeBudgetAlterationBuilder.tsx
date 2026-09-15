import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, CircleHelp, MoreVertical, Plus, ShieldCheck, ShieldMinus, ShieldPlus } from "lucide-react";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";

import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { Checkbox, Field, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { listKnowledgeSubBaskets } from "./knowledgeApi";
import { BUDGET_ACTIONS, budgetAlterationRows } from "./knowledgeBudgetAlterations";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { relatedItemSuggestions } from "./knowledgeRelatedItemSuggestions";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";
import { RECOMMENDATION_GROUPS, newRecommendationRule, recommendationAction, recommendationGroup, type RecommendationGroup } from "./knowledgeRecommendationPresentation";
import "./knowledge-recommendations.css";

interface Props {
  value: KnowledgeJsonValue | undefined;
  mainLineId: string;
  mainLineName: string;
  baskets: readonly KnowledgeBasket[];
  items: readonly KnowledgeItemListItem[];
  catalogState?: KnowledgeBudgetCatalogState;
  readOnly: boolean;
  canCreate: boolean;
  issues: readonly KnowledgeValidationIssue[];
  validationAttempt?: number;
  resetKey?: string;
  savedValue?: KnowledgeJsonValue;
  onItemConfirmed?: (item: KnowledgeItemDetail) => void;
  onChange: (value: KnowledgeJsonValue) => void;
}

export function KnowledgeBudgetAlterationBuilder({ value, mainLineName, catalogState = { status: "ready" }, validationAttempt = 0, resetKey, savedValue, ...props }: Props) {
  const id = useId();
  const [createdItems, setCreatedItems] = useState<readonly KnowledgeItemDetail[]>([]);
  const [editing, setEditing] = useState<{ owner: string; resetKey?: string; ruleId: string } | null>(null);
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
  const byId = new Map(props.items.map((item) => [item.mainLineId, item]));
  for (const item of createdItems) {
    const listed = byId.get(item.mainLineId);
    if (!listed || listed.version < item.version) byId.set(item.mainLineId, item);
  }
  const items = [...byId.values()];
  const rows = budgetAlterationRows(value);
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
          const item = items.find((candidate) => candidate.mainLineId === row.targetMainLineId);
          const unresolved = !item || !["active", "draft"].includes(item.status);
          const rowIssues = props.issues.filter((issue) => issue.path === `budgetAlterations.${index}` || issue.path.startsWith(`budgetAlterations.${index}.`));
          const saved = savedRows.find((candidate) => candidate.id === row.id);
          const unsaved = JSON.stringify(saved) !== JSON.stringify(row);
          const relationship = group.key === "mandatory" ? "Mandatory" : group.key === "probable" ? "Probable" : row.requirement === "must" ? "Required" : row.requirement === "can" ? "Optional" : "Needs review";
          return <tr key={rowKey(row, index)} className={row.active === false ? "knowledge-recommendations__row--disabled" : undefined}>
            <td data-label="#">{position + 1}</td>
            <th scope="row" className="knowledge-recommendations__item"><button type="button" aria-label={`${readOnly ? "View" : "Edit"} rule ${index + 1}: ${item?.mainLineName ?? "Choose related item"}`} onClick={(event) => openEditor(row, index, event.currentTarget)}>{item?.mainLineName ?? (row.targetMainLineId ? "Unavailable related item" : "Choose related item")}</button><span>{item?.subBasketName ?? basketsLabel(props.baskets, row.targetBasketId)}</span></th>
            <td data-label="Relationship"><span className="knowledge-recommendations__relationship">{relationship}</span></td>
            <td data-label={isExclusion ? "Effect" : "Action"}>{recommendationAction(row)}</td>
            <td data-label={isExclusion ? "Condition" : "Applicability"}>{row.action === "add" ? "When missing from scope" : row.action === "remove" ? "When present in scope" : "Needs review"}</td>
            <td data-label="Status" className="knowledge-recommendations__statuses">
              <span className={`knowledge-recommendations__status${rowIssues.length || unresolved ? " knowledge-recommendations__status--attention" : unsaved ? " knowledge-recommendations__status--draft" : ""}`}>{rowIssues.length ? "Needs attention" : unresolved ? "Unavailable target" : unsaved ? "Unsaved" : savedValue !== undefined ? "Saved" : "Configured"}</span>
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
      onClose={() => setEditing(null)} initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
      footer={<Button type="button" onClick={() => setEditing(null)}>Done</Button>}>
      <div ref={(element) => {
        editorRef.current = element;
        if (element && validationFocus.current) initialFocusRef.current = element.querySelector<HTMLElement>("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid") ?? element;
      }} tabIndex={-1}>
        {props.issues.filter((issue) => issue.path === `budgetAlterations.${editingIndex}` || issue.path === `budgetAlterations.${editingIndex}.id` || issue.path === `budgetAlterations.${editingIndex}.active`).map((issue) => <InlineMessage key={issue.path} tone="error">{issue.message}</InlineMessage>)}
        <BudgetAlterationRow key={`${props.mainLineId}:${rowKey(editingRow, editingIndex)}`} {...props} row={editingRow} index={editingIndex}
          items={items} mainLineName={mainLineName} catalogState={catalogState} readOnly={readOnly}
          onItemCreated={(item) => {
            setCreatedItems((current) => [...current.filter((entry) => entry.mainLineId !== item.mainLineId), item]);
            props.onItemConfirmed?.(item);
          }}
          onChange={(next) => props.onChange(rows.map((current, position) => position === editingIndex ? next : current))}
          onRemove={() => { props.onChange(rows.filter((_, position) => position !== editingIndex)); setEditing(null); }} />
      </div>
    </Drawer>}
  </section>;
}

function basketsLabel(baskets: readonly KnowledgeBasket[], basketId: KnowledgeJsonValue | undefined) {
  return baskets.find((basket) => basket.id === basketId)?.name ?? "Main Basket not selected";
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
        <button type="button" onClick={onRemove}>Remove rule {index + 1}</button>
      </>}
    </div>}
  </details>;
}

function BudgetAlterationRow({ row, index, mainLineId, mainLineName, baskets, items, readOnly, canCreate, issues, catalogState, onItemCreated,
  onChange, onRemove }: Omit<Props, "value" | "onChange"> & { row: KnowledgeJsonObject; index: number; catalogState: KnowledgeBudgetCatalogState; onItemCreated: (item: KnowledgeItemDetail) => void; onChange: (row: KnowledgeJsonObject) => void; onRemove: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const ownerMounted = useRef(false);
  useEffect(() => {
    ownerMounted.current = true;
    return () => { ownerMounted.current = false; };
  }, []);
  const [creatingItem, setCreatingItem] = useState<{ type: "main_line" | "temporary"; name: string; subBasketName: string } | null>(null);
  const [creationNotice, setCreationNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const text = (key: string) => typeof row[key] === "string" ? row[key] as string : "";
  const set = (key: string, next: KnowledgeJsonValue) => onChange({ ...row, [key]: next });
  const error = (key: string) => issues.find((issue) => issue.path === `budgetAlterations.${index}.${key}`)?.message;
  const basketId = text("targetBasketId");
  const subBasketId = text("targetSubBasketId");
  const lineId = text("targetMainLineId");
  const temporary = row.targetType === "temporary";
  const subBaskets = useQuery({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basketId), "catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(basketId, params), "Sub Basket"),
    enabled: Boolean(basketId)
  });
  const subOptions = subBaskets.data?.items ?? [];
  const availableBaskets = baskets.filter((basket) => basket.status === "active");
  const availableItems = items.filter((item) => item.mainLineId !== mainLineId && item.basketId === basketId
    && (temporary ? item.itemType === "temporary" : item.itemType !== "temporary")
    && (!subBasketId || item.subBasketId === subBasketId) && (item.status === "active" || item.status === "draft"));
  const selectedItem = items.find((item) => item.mainLineId === lineId);
  const selectedName = selectedItem?.mainLineName;
  const action = BUDGET_ACTIONS.find((choice) => choice.action === row.action && choice.requirement === row.requirement);
  const catalogDisabled = readOnly || catalogState.status !== "ready" || Boolean(catalogState.refreshErrorMessage);
  const subUnavailable = subBaskets.isPending || subBaskets.isError;
  const suggestions = !temporary && canCreate && !readOnly ? relatedItemSuggestions({
    basket: availableBaskets.find((basket) => basket.id === basketId),
    subBasket: subOptions.find((basket) => basket.id === subBasketId),
    subBasketId, items, catalogReady: !catalogDisabled && !subUnavailable
  }) : [];
  const openCreation = (type: "main_line" | "temporary") => setCreatingItem({
    type, name: "", subBasketName: subOptions.find((basket) => basket.id === subBasketId)?.name ?? ""
  });
  const retryCatalogRefresh = async () => {
    const results = await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId) }, { throwOnError: true })
    ]);
    if (results.every((result) => result.status === "fulfilled")) setRefreshWarning("");
  };
  return <article className="knowledge-budget-rule" aria-labelledby={`${id}-title`}>
    <div className="knowledge-budget-rule__heading">
      <p id={`${id}-title`} className="sr-only">Rule {index + 1}</p>
      <span className={`knowledge-budget-rule__badge${row.requirement === "must" ? " knowledge-budget-rule__badge--required" : ""}`}>{row.requirement === "must" ? "Required" : "Optional"}</span>
      <label className="knowledge-budget-rule__enabled"><Checkbox checked={row.active === true} disabled={readOnly} onChange={(event) => set("active", event.target.checked)} />Enabled</label>
      {!readOnly && <Button type="button" variant="secondary" size="compact" aria-label={`Remove rule ${index + 1}`} onClick={onRemove}>Remove</Button>}
    </div>
    <div className="knowledge-budget-rule__condition">
      <Field id={`${id}-trigger`} label="What happens if?" required error={error("trigger")}>
        {(control) => <Select {...control} value={text("trigger")} disabled={readOnly} onChange={(event) => set("trigger", event.target.value)}>
          <option value="removed">The item is removed from scope</option><option value="added">The item is added to scope</option>
        </Select>}
      </Field>
      <Field id={`${id}-action`} label="Scope action" required error={error("action")}>
        {(control) => <Select {...control} value={action?.value ?? ""} disabled={readOnly} onChange={(event) => {
          const choice = BUDGET_ACTIONS.find((candidate) => candidate.value === event.target.value)!;
          onChange({ ...row, action: choice.action, requirement: choice.requirement });
        }}>{BUDGET_ACTIONS.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select>}
      </Field>
      <Field id={`${id}-type`} label="Item type" required error={error("targetType")}>
        {(control) => <Select {...control} value={text("targetType")} disabled={readOnly} onChange={(event) => onChange({ ...row, targetType: event.target.value, targetMainLineId: null })}>
          <option value="catalog">Catalog item</option><option value="temporary">Temporary item</option>
        </Select>}
      </Field>
    </div>
    <div className="knowledge-budget-rule__targets">
      <Field id={`${id}-basket`} label="Main Basket" required error={error("targetBasketId")}>
        {(control) => <Select {...control} value={basketId} disabled={catalogDisabled} onChange={(event) => onChange({ ...row,
          targetBasketId: event.target.value, targetSubBasketId: null, targetMainLineId: null })}>
          <option value="">Select Main Basket</option>
          {basketId && !availableBaskets.some((basket) => basket.id === basketId) && <option value={basketId} disabled>Unavailable Main Basket</option>}
          {availableBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
        </Select>}
      </Field>
      <Field id={`${id}-sub-basket`} label="Sub Basket" error={error("targetSubBasketId")}>
        {(control) => <Select {...control} value={subBasketId} disabled={catalogDisabled || !basketId || subUnavailable} onChange={(event) => onChange({ ...row,
          targetSubBasketId: event.target.value || null, targetMainLineId: null })}>
          <option value="">{"All Sub Baskets"}</option>
          {subBasketId && !subOptions.some((basket) => basket.id === subBasketId) && <option value={subBasketId} disabled>{selectedItem?.subBasketName ?? "Unavailable Sub Basket"}</option>}
          {subOptions.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
        </Select>}
      </Field>
      <Field id={`${id}-line`} label="Related item" required error={error("targetMainLineId")}>
        {(control) => <Select {...control} value={lineId} disabled={catalogDisabled || !basketId || subUnavailable} onChange={(event) => {
          const suggestion = suggestions.find((candidate) => `suggestion:${candidate.key}` === event.target.value);
          if (suggestion) {
            setCreatingItem({ type: "main_line", name: suggestion.name, subBasketName: suggestion.subBasketName });
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
      </Field>
    </div>
    {basketId && subBaskets.isPending && <p role="status">Loading Sub Baskets…</p>}
    {basketId && subBaskets.isError && <InlineMessage tone="warning">Sub Baskets could not be loaded. <Button type="button" variant="secondary" onClick={() => void subBaskets.refetch()}>Retry Sub Baskets</Button></InlineMessage>}
    {!basketId && <p className="knowledge-budget-alterations__help">Select a Main Basket to see related items.</p>}
    {basketId && !catalogDisabled && !subUnavailable && !availableItems.length && !suggestions.length && <p className="knowledge-budget-alterations__help">
      No related items available.{subBasketId && !temporary ? " Choose All Sub Baskets to see more items and suggestions." : ""}
    </p>}
    <div className="knowledge-budget-rule__temporary">
      <span>{temporary ? "Temporary items have Overview, Mode and Quality Parameters." : "Item missing from the catalog?"}</span>
      {!readOnly && canCreate && <>
        <Button type="button" variant="secondary" size="compact" disabled={!basketId || catalogDisabled || subUnavailable} onClick={() => openCreation(temporary ? "temporary" : "main_line")}>Add related item</Button>
        {!temporary && <Button type="button" variant="quiet" size="compact" disabled={!basketId || catalogDisabled || subUnavailable} onClick={() => openCreation("temporary")}>Add temporary item</Button>}
      </>}
      {temporary && lineId && <Link to={`/admin/configuration/estimation/items/${encodeURIComponent(lineId)}`} target="_blank" rel="noopener noreferrer">Configure temporary item</Link>}
    </div>
    {creationNotice && <p role="status" className="knowledge-budget-alterations__help">{creationNotice}</p>}
    {refreshWarning && <InlineMessage tone="warning">{refreshWarning} <Button type="button" variant="quiet" size="compact" onClick={() => void retryCatalogRefresh()}>Retry catalog refresh</Button></InlineMessage>}
    {creatingItem && !readOnly && canCreate && <CreateKnowledgeItemDialog context="related-item" itemType={creatingItem.type}
      initialBasketId={basketId} initialName={creatingItem.name} initialSubBasketName={creatingItem.subBasketName}
      excludeMainLineId={mainLineId} onRefreshError={(message) => { if (ownerMounted.current) setRefreshWarning(message); }}
      onClose={() => setCreatingItem(null)} onCreated={async (createdId, detail) => {
        if (!ownerMounted.current) return;
        const created = detail ?? queryClient.getQueryData<KnowledgeItemDetail>(knowledgeQueryKeys.item(createdId));
        if (!created || created.mainLineId !== createdId || createdId === mainLineId) return;
        onItemCreated(created);
        onChange({ ...row, targetType: created.itemType === "temporary" ? "temporary" : "catalog", targetBasketId: created.basketId,
          targetSubBasketId: created.subBasketId ?? null, targetMainLineId: createdId });
        setCreationNotice(`${created.mainLineName} is in the catalog. Save this section to keep the rule change.`);
        setRefreshWarning("");
        setCreatingItem(null);
      }} />}
    <Field id={`${id}-reason`} label="Why is this change needed?" required error={error("reason")}>
      {(control) => <Textarea {...control} rows={2} value={text("reason")} maxLength={4000} disabled={readOnly}
        placeholder="Explain the design impact, dependency or budget choice."
        onChange={(event) => set("reason", event.target.value)} />}
    </Field>
    <div className="knowledge-budget-rule__preview" aria-label="Scope change summary">
      <p>If <strong>{mainLineName}</strong> is {row.trigger === "added" ? "added to" : "removed from"} scope, <strong>{selectedName || "the selected item"}</strong> {action?.label.toLowerCase() ?? "needs a scope decision"}.</p>
      {text("reason").trim() && <p><strong>Why:</strong> {text("reason")}</p>}
      <p className="knowledge-budget-rule__application">{row.active === false ? "Disabled — this rule will not be used." : row.action === "remove" ? "Applies only when the related item is in scope." : "Add the related item only if it is missing from scope."}</p>
    </div>
  </article>;
}
