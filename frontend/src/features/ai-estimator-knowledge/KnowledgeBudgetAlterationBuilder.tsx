import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";

import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { listKnowledgeSubBaskets } from "./knowledgeApi";
import { BUDGET_ACTIONS, budgetAlterationRows, createBudgetAlteration } from "./knowledgeBudgetAlterations";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";

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
  onChange: (value: KnowledgeJsonValue) => void;
}

export function KnowledgeBudgetAlterationBuilder({ value, mainLineName, catalogState = { status: "ready" }, ...props }: Props) {
  const id = useId();
  const rows = budgetAlterationRows(value);
  const invalidShape = value !== undefined && (!Array.isArray(value) || rows.length !== value.length);
  return <section className="knowledge-budget-alterations" aria-labelledby={`${id}-title`}>
    <div className="knowledge-budget-alterations__heading">
      <div><h3 id={`${id}-title`}>Budget Alterations</h3><p>What happens if <strong>{mainLineName}</strong> is added to or removed from scope?</p></div>
      {!props.readOnly && <Button type="button" variant="secondary" disabled={invalidShape || rows.length >= 100}
        onClick={() => props.onChange([...rows, createBudgetAlteration()])}>Add rule</Button>}
    </div>
    <p className="knowledge-budget-alterations__help">Use “must” for a required scope change and “can” for an optional choice. Explain the effect on the design and why.</p>
    {catalogState.status !== "ready" || catalogState.refreshErrorMessage ? <InlineMessage tone={catalogState.status === "loading" ? "info" : "warning"}>
      {catalogState.status === "loading" ? "Loading related items…" : "Related items could not be fully loaded. Saved selections are retained."}
      {catalogState.onRetry && <Button type="button" variant="secondary" onClick={catalogState.onRetry}>Retry related items</Button>}
    </InlineMessage> : null}
    {invalidShape && <InlineMessage tone="error">Saved rules contain unsupported data. Reload the configuration before editing these rules.</InlineMessage>}
    {!rows.length ? <div className="knowledge-budget-alterations__empty">No scope-change rules yet. Add a rule to describe which related items are affected and why.</div> : null}
    {rows.map((row, index) => <BudgetAlterationRow key={String(row.id ?? index)} {...props} row={row} index={index}
      mainLineName={mainLineName} catalogState={catalogState} readOnly={props.readOnly || invalidShape}
      onChange={(next) => props.onChange(rows.map((current, position) => position === index ? next : current))}
      onRemove={() => props.onChange(rows.filter((_, position) => position !== index))} />)}
  </section>;
}

function BudgetAlterationRow({ row, index, mainLineId, mainLineName, baskets, items, readOnly, canCreate, issues, catalogState,
  onChange, onRemove }: Omit<Props, "value" | "onChange"> & { row: KnowledgeJsonObject; index: number; catalogState: KnowledgeBudgetCatalogState; onChange: (row: KnowledgeJsonObject) => void; onRemove: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [creatingTemporary, setCreatingTemporary] = useState(false);
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
  return <article className="knowledge-budget-rule" aria-labelledby={`${id}-title`}>
    <div className="knowledge-budget-rule__heading">
      <h4 id={`${id}-title`}>Rule {index + 1}</h4>
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
      <Field id={`${id}-action`} label="Related item" required error={error("action")}>
        {(control) => <Select {...control} value={action?.value ?? ""} disabled={readOnly} onChange={(event) => {
          const choice = BUDGET_ACTIONS.find((candidate) => candidate.value === event.target.value)!;
          onChange({ ...row, action: choice.action, requirement: choice.requirement });
        }}>{BUDGET_ACTIONS.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select>}
      </Field>
      <Field id={`${id}-type`} label="Item type" required error={error("targetType")}>
        {(control) => <Select {...control} value={text("targetType")} disabled={readOnly} onChange={(event) => onChange({ ...row, targetType: event.target.value, targetMainLineId: null })}>
          <option value="catalog">Main Line</option><option value="temporary">Temporary item</option>
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
      <Field id={`${id}-line`} label={temporary ? "Temporary item" : "Main Line"} required error={error("targetMainLineId")}>
        {(control) => <Select {...control} value={lineId} disabled={catalogDisabled || !basketId || subUnavailable} onChange={(event) => {
          const item = availableItems.find((candidate) => candidate.mainLineId === event.target.value);
          onChange({ ...row, targetMainLineId: item?.mainLineId ?? null, targetSubBasketId: item?.subBasketId ?? null });
        }}>
          <option value="">{temporary ? "Select temporary item" : "Select Main Line"}</option>
          {lineId && !availableItems.some((item) => item.mainLineId === lineId) && <option value={lineId} disabled>{selectedItem?.mainLineName ?? "Unavailable Main Line"}</option>}
          {availableItems.map((item) => <option key={item.mainLineId} value={item.mainLineId}>{item.mainLineName}{!subBasketId && item.subBasketName ? ` · ${item.subBasketName}` : ""}</option>)}
        </Select>}
      </Field>
    </div>
    {basketId && subBaskets.isPending && <p role="status">Loading Sub Baskets…</p>}
    {basketId && subBaskets.isError && <InlineMessage tone="warning">Sub Baskets could not be loaded. <Button type="button" variant="secondary" onClick={() => void subBaskets.refetch()}>Retry Sub Baskets</Button></InlineMessage>}
    <div className="knowledge-budget-rule__temporary">
      <span>{temporary ? "Temporary items have Overview, Mode and Quality Parameters." : "Item missing from the catalog?"}</span>
      {!readOnly && canCreate && <Button type="button" variant="secondary" size="compact" disabled={!basketId || catalogDisabled || subUnavailable} onClick={() => setCreatingTemporary(true)}>Add temporary item</Button>}
      {temporary && lineId && <Link to={`/admin/configuration/estimation/items/${encodeURIComponent(lineId)}`} target="_blank" rel="noopener noreferrer">Configure temporary item</Link>}
    </div>
    {creatingTemporary && <CreateKnowledgeItemDialog itemType="temporary" initialBasketId={basketId}
      initialSubBasketName={subOptions.find((basket) => basket.id === subBasketId)?.name ?? ""}
      onClose={() => setCreatingTemporary(false)} onCreated={async (createdId) => {
        const created = queryClient.getQueryData<KnowledgeItemDetail>(knowledgeQueryKeys.item(createdId));
        onChange({ ...row, targetType: "temporary", targetBasketId: created?.basketId ?? basketId,
          targetSubBasketId: created?.subBasketId ?? null, targetMainLineId: createdId });
        setCreatingTemporary(false);
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
