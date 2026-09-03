import { ChevronDown, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise,
  type RupeeInputParseResult
} from "./knowledgePresentation";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster
} from "./knowledgeTypes";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";

export interface KnowledgeBudgetCatalogState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly refreshErrorMessage?: string;
  readonly onRetry?: () => void;
}

export interface KnowledgeBudgetBuilderProps {
  readonly value: KnowledgeJsonValue | undefined;
  readonly vendors: readonly KnowledgeMaster[];
  readonly uoms: readonly KnowledgeMaster[];
  readonly vendorCatalogState?: KnowledgeBudgetCatalogState;
  readonly uomCatalogState?: KnowledgeBudgetCatalogState;
  readonly issues?: readonly KnowledgeValidationIssue[];
  readonly validationAttempt?: number;
  readonly readOnly: boolean;
  readonly saving?: boolean;
  readonly canQuickAdd: boolean;
  readonly resetKey: string;
  readonly onRetrySavedDetails?: () => void;
  readonly onQuickAdd: (
    type: "vendors" | "uoms",
    select: (master: KnowledgeMaster) => void
  ) => void;
  readonly onChange: (value: readonly KnowledgeJsonValue[]) => void;
  readonly onDirty: () => void;
}

interface BudgetRow {
  readonly key: string;
  readonly value: KnowledgeJsonObject;
}

type FocusField = "vendorId" | "uomId" | "inputAmountPaise" | "effectiveFrom" | "effectiveTo";
type FocusTarget = FocusField | "panel";

const READY_CATALOG: KnowledgeBudgetCatalogState = { status: "ready" };

export function KnowledgeBudgetBuilder({
  value,
  vendors,
  uoms,
  vendorCatalogState = READY_CATALOG,
  uomCatalogState = READY_CATALOG,
  issues = [],
  validationAttempt = 0,
  readOnly,
  saving = false,
  canQuickAdd,
  resetKey,
  onRetrySavedDetails,
  onQuickAdd,
  onChange,
  onDirty
}: KnowledgeBudgetBuilderProps) {
  const rows = useMemo<readonly BudgetRow[]>(
    () => objectArray(value).map((entry, index) => ({
      key: budgetRowKey(entry, index),
      value: entry
    })),
    [value]
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [scheduleKeys, setScheduleKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingFocus, setPendingFocus] = useState<{ readonly key: string; readonly field: FocusTarget } | null>(null);
  const setBudgetRef = useRef<HTMLButtonElement>(null);
  const focusTargets = useRef(new Map<string, HTMLElement>());
  const lastValidationAttempt = useRef(0);
  const builderId = useId();

  const activeVendors = useMemo(() => selectableMasters(vendors), [vendors]);
  const activeUoms = useMemo(() => selectableMasters(uoms), [uoms]);
  const catalogsReady = vendorCatalogState.status === "ready"
    && uomCatalogState.status === "ready";
  const controlsDisabled = readOnly || saving;

  function availableFocusTarget(field: FocusTarget): FocusTarget {
    if (field === "panel") return field;
    if (field === "vendorId" && (vendorCatalogState.status !== "ready" || activeVendors.length === 0)) return "panel";
    if (field === "uomId" && (uomCatalogState.status !== "ready" || activeUoms.length === 0)) return "panel";
    return field;
  }

  useEffect(() => {
    setExpandedKey(null);
    setScheduleKeys(new Set(
      rows.filter(({ value: row }) => Boolean(stringValue(budgetValues(row).effectiveTo)))
        .map(({ key }) => key)
    ));
    setPendingFocus(null);
  }, [resetKey]);

  useEffect(() => {
    if (expandedKey && !rows.some(({ key }) => key === expandedKey)) {
      setExpandedKey(null);
    }
  }, [expandedKey, rows]);

  useEffect(() => {
    if (!pendingFocus || expandedKey !== pendingFocus.key) return;
    const target = focusTargets.current.get(focusTargetKey(pendingFocus.key, pendingFocus.field));
    if (!target) return;
    target.focus();
    setPendingFocus(null);
  }, [expandedKey, pendingFocus, rows]);

  useEffect(() => {
    if (validationAttempt === 0) {
      lastValidationAttempt.current = 0;
      return;
    }
    /* Same rule as the section editor: only a new save attempt may move focus,
       so editing a budget row does not yank the caret to another row. */
    if (validationAttempt <= lastValidationAttempt.current) return;
    const firstIssue = issues.find(({ path }) => /^priceEntries\.\d+(?:\.|$)/u.test(path));
    if (!firstIssue) return;
    const match = /^priceEntries\.(\d+)(?:\.([^\.]+))?/u.exec(firstIssue.path);
    if (!match) return;
    const index = Number(match[1]);
    const row = rows[index];
    if (!row) return;
    lastValidationAttempt.current = validationAttempt;
    const field = visibleFocusField(match[2]);
    setExpandedKey(row.key);
    setPendingFocus({ key: row.key, field: availableFocusTarget(field) });
    if (field === "effectiveTo") {
      setScheduleKeys((current) => new Set(current).add(row.key));
    }
  }, [
    activeUoms.length,
    activeVendors.length,
    issues,
    rows,
    uomCatalogState.status,
    validationAttempt,
    vendorCatalogState.status
  ]);

  function update(next: readonly KnowledgeJsonValue[]) {
    onDirty();
    onChange(next);
  }

  function replace(index: number, next: KnowledgeJsonObject) {
    update(rows.map((row, rowIndex) => rowIndex === index ? next : row.value));
  }

  function addBudget() {
    const index = rows.length;
    const next = createBudgetDraft();
    const key = budgetRowKey(next, index);
    update([...rows.map(({ value: row }) => row), next]);
    setExpandedKey(key);
    setPendingFocus({ key, field: availableFocusTarget("vendorId") });
  }

  function removeBudget(key: string) {
    update(rows.filter((row) => row.key !== key).map((row) => row.value));
    setExpandedKey(null);
    setPendingFocus(null);
    queueMicrotask(() => setBudgetRef.current?.focus());
  }

  const catalogStates = [
    { label: "Vendor", state: vendorCatalogState },
    { label: "Unit of measure", state: uomCatalogState }
  ] as const;

  return (
    <section className="knowledge-budget-builder" aria-labelledby="knowledge-budgets-heading">
      <div className="knowledge-budget-builder__header">
        <div>
          <h3 id="knowledge-budgets-heading">Budgets</h3>
          <p>Set the unit budget used by the estimator. Complete the details, then Save Mode.</p>
        </div>
        {!readOnly ? (
          <Button
            ref={setBudgetRef}
            size="compact"
            leadingIcon={<Plus />}
            disabled={saving || !catalogsReady}
            onClick={addBudget}
          >
            Set budget
          </Button>
        ) : null}
      </div>

      <BudgetCatalogMessages
        catalogStates={catalogStates}
        canQuickAdd={canQuickAdd && !controlsDisabled && rows.length === 0}
        activeCounts={{ vendors: activeVendors.length, uoms: activeUoms.length }}
        onQuickAdd={onQuickAdd}
      />

      {rows.length === 0 ? <p className="knowledge-budget-builder__empty">No budgets set.</p> : (
        <ol className="knowledge-budget-list">
          {rows.map((row, index) => {
            const expanded = expandedKey === row.key;
            const values = budgetValues(row.value);
            const rowIssues = issues.filter(({ path }) => path === `priceEntries.${index}` || path.startsWith(`priceEntries.${index}.`));
            const rowDomId = domId(`${builderId}-${index}`);
            return (
              <li key={row.key} className="knowledge-budget-panel" data-expanded={expanded || undefined}>
                <button
                  ref={(element) => {
                    const focusKey = focusTargetKey(row.key, "panel");
                    if (element) focusTargets.current.set(focusKey, element);
                    else focusTargets.current.delete(focusKey);
                  }}
                  id={`${rowDomId}-trigger`}
                  type="button"
                  className="knowledge-budget-panel__trigger"
                  aria-expanded={expanded}
                  aria-controls={`${rowDomId}-body`}
                  disabled={saving}
                  onClick={() => setExpandedKey(expanded ? null : row.key)}
                >
                  <span className="knowledge-budget-panel__summary">
                    <strong>{budgetSummary(values, row.value, vendors, uoms)}</strong>
                    {budgetNeedsReview(values) ? <span>Needs review</span> : null}
                  </span>
                  <ChevronDown className="knowledge-budget-panel__chevron" aria-hidden="true" />
                </button>
                <div
                  id={`${rowDomId}-body`}
                  className="knowledge-budget-panel__body"
                  role="region"
                  aria-labelledby={`${rowDomId}-trigger`}
                  hidden={!expanded}
                >
                  {isEditableBudget(row.value) ? (
                    <BudgetForm
                      domKey={rowDomId}
                      index={index}
                      value={row.value}
                      vendors={vendors}
                      uoms={uoms}
                      vendorCatalogState={vendorCatalogState}
                      uomCatalogState={uomCatalogState}
                      issues={rowIssues}
                      controlsDisabled={controlsDisabled}
                      canQuickAdd={canQuickAdd}
                      scheduleExpanded={scheduleKeys.has(row.key)}
                      registerFocus={(field, element) => {
                        const key = focusTargetKey(row.key, field);
                        if (element) focusTargets.current.set(key, element);
                        else focusTargets.current.delete(key);
                      }}
                      onScheduleToggle={() => setScheduleKeys((current) => toggleSetValue(current, row.key))}
                      onQuickAdd={onQuickAdd}
                      onChange={(next) => replace(index, next)}
                    />
                  ) : (
                    <SavedBudgetDetails
                      values={values}
                      vendors={vendors}
                      uoms={uoms}
                      unavailable={row.value.operation === "reference" && !isObject(row.value.priceVersion)}
                      onRetry={onRetrySavedDetails}
                    />
                  )}

                  {rowIssues.some(({ path }) => path === `priceEntries.${index}`) ? (
                    <InlineMessage tone="error" role="alert">
                      {rowIssues.find(({ path }) => path === `priceEntries.${index}`)?.message}
                    </InlineMessage>
                  ) : null}

                  <div className="knowledge-budget-panel__actions">
                    {!readOnly && row.value.operation === "reference" ? (
                      <Button
                        size="compact"
                        variant="secondary"
                        disabled={saving || !canUpdateBudget(row.value)}
                        onClick={() => {
                          const source = stringValue(row.value.priceVersionId);
                          const resolved = isObject(row.value.priceVersion) ? row.value.priceVersion : null;
                          if (!source || !resolved) return;
                          const draft = budgetDraftFromSaved(resolved, source);
                          if (!draft) return;
                          replace(index, draft);
                          setExpandedKey(row.key);
                          setPendingFocus({ key: row.key, field: availableFocusTarget("vendorId") });
                        }}
                      >
                        Update budget
                      </Button>
                    ) : null}
                    {!readOnly ? (
                      <Button
                        size="compact"
                        variant="destructive-outline"
                        leadingIcon={<Trash2 />}
                        disabled={saving}
                        aria-label={`Remove ${removeContext(values, vendors, uoms)} from this Draft`}
                        onClick={() => removeBudget(row.key)}
                      >
                        Remove budget from this Draft
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function BudgetForm({
  domKey,
  index,
  value,
  vendors,
  uoms,
  vendorCatalogState,
  uomCatalogState,
  issues,
  controlsDisabled,
  canQuickAdd,
  scheduleExpanded,
  registerFocus,
  onScheduleToggle,
  onQuickAdd,
  onChange
}: {
  readonly domKey: string;
  readonly index: number;
  readonly value: KnowledgeJsonObject;
  readonly vendors: readonly KnowledgeMaster[];
  readonly uoms: readonly KnowledgeMaster[];
  readonly vendorCatalogState: KnowledgeBudgetCatalogState;
  readonly uomCatalogState: KnowledgeBudgetCatalogState;
  readonly issues: readonly KnowledgeValidationIssue[];
  readonly controlsDisabled: boolean;
  readonly canQuickAdd: boolean;
  readonly scheduleExpanded: boolean;
  readonly registerFocus: (field: FocusField, element: HTMLElement | null) => void;
  readonly onScheduleToggle: () => void;
  readonly onQuickAdd: KnowledgeBudgetBuilderProps["onQuickAdd"];
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const rowPath = `priceEntries.${index}`;
  const prefix = domKey;
  const set = (field: string, next: KnowledgeJsonValue | undefined) => {
    const copy = { ...value } as Record<string, KnowledgeJsonValue>;
    if (next === undefined || next === "") delete copy[field];
    else copy[field] = next;
    onChange(copy);
  };
  const issueFor = (field: FocusField) => issues.find(({ path }) => path === `${rowPath}.${field}`)?.message;
  const effectiveToIssue = issueFor("effectiveTo");

  return (
    <div className="knowledge-budget-form">
      <div className="knowledge-budget-form__grid">
        <BudgetMasterField
          id={`${prefix}-vendor`}
          label="Vendor"
          type="vendors"
          value={stringValue(value.vendorId)}
          masters={vendors}
          catalogState={vendorCatalogState}
          disabled={controlsDisabled}
          error={issueFor("vendorId")}
          inputRef={(element) => registerFocus("vendorId", element)}
          canQuickAdd={canQuickAdd}
          onChange={(next) => set("vendorId", next || undefined)}
          onQuickAdd={(select) => onQuickAdd("vendors", select)}
        />
        <BudgetMasterField
          id={`${prefix}-uom`}
          label="Unit of measure"
          type="uoms"
          value={stringValue(value.uomId)}
          masters={uoms}
          catalogState={uomCatalogState}
          disabled={controlsDisabled}
          error={issueFor("uomId")}
          inputRef={(element) => registerFocus("uomId", element)}
          canQuickAdd={canQuickAdd}
          onChange={(next) => set("uomId", next || undefined)}
          onQuickAdd={(select) => onQuickAdd("uoms", select)}
        />
        <BudgetAmountField
          id={`${prefix}-amount`}
          valuePaise={numberValue(value.inputAmountPaise)}
          disabled={controlsDisabled}
          serverError={issueFor("inputAmountPaise")}
          inputRef={(element) => registerFocus("inputAmountPaise", element)}
          onChange={(next) => set("inputAmountPaise", next)}
        />
        <BudgetDateField
          id={`${prefix}-from`}
          label="Starts on"
          value={stringValue(value.effectiveFrom)}
          disabled={controlsDisabled}
          required
          error={issueFor("effectiveFrom")}
          inputRef={(element) => registerFocus("effectiveFrom", element)}
          onChange={(next) => set("effectiveFrom", next || undefined)}
        />
      </div>
      <div className="knowledge-budget-schedule">
        <button
          type="button"
          className="knowledge-budget-schedule__trigger"
          aria-expanded={scheduleExpanded || Boolean(effectiveToIssue)}
          aria-controls={`${prefix}-schedule`}
          disabled={controlsDisabled}
          onClick={onScheduleToggle}
        >
          <ChevronDown aria-hidden="true" />
          <span>Schedule options</span>
        </button>
        <div
          id={`${prefix}-schedule`}
          className="knowledge-budget-schedule__body"
          hidden={!scheduleExpanded && !effectiveToIssue}
        >
          <BudgetDateField
            id={`${prefix}-to`}
            label="Ends on (optional)"
            value={stringValue(value.effectiveTo)}
            disabled={controlsDisabled}
            error={effectiveToIssue}
            inputRef={(element) => registerFocus("effectiveTo", element)}
            onChange={(next) => set("effectiveTo", next || null)}
          />
        </div>
      </div>
    </div>
  );
}

function BudgetMasterField({
  id,
  label,
  type,
  value,
  masters,
  catalogState,
  disabled,
  error,
  inputRef,
  canQuickAdd,
  onChange,
  onQuickAdd
}: {
  readonly id: string;
  readonly label: string;
  readonly type: "vendors" | "uoms";
  readonly value: string;
  readonly masters: readonly KnowledgeMaster[];
  readonly catalogState: KnowledgeBudgetCatalogState;
  readonly disabled: boolean;
  readonly error?: string;
  readonly inputRef: (element: HTMLSelectElement | null) => void;
  readonly canQuickAdd: boolean;
  readonly onChange: (value: string) => void;
  readonly onQuickAdd?: (select: (master: KnowledgeMaster) => void) => void;
}) {
  const active = selectableMasters(masters);
  const selected = masters.find(({ id: masterId }) => masterId === value);
  const missing = Boolean(value) && !selected;
  const selectedUnavailable = Boolean(selected && selected.status !== "active");
  const unavailable = catalogState.status !== "ready";
  const placeholder = unavailable
    ? `${label} options unavailable`
    : active.length === 0
      ? `No active ${label.toLowerCase()}`
      : `Select ${label.toLowerCase()}`;

  return (
    <div className="knowledge-master-control">
      <Field id={id} label={label} required error={error}>
        {(props) => (
          <Select
            {...props}
            ref={inputRef}
            value={value}
            disabled={disabled || unavailable || active.length === 0}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{placeholder}</option>
            {missing ? <option value={value} disabled>Unavailable saved {label}</option> : null}
            {selectedUnavailable ? <option value={selected!.id} disabled>{selected!.name} · unavailable</option> : null}
            {active.map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}
          </Select>
        )}
      </Field>
      {canQuickAdd && onQuickAdd ? (
        <Button
          size="compact"
          variant="quiet"
          disabled={disabled}
          onClick={() => onQuickAdd((master) => onChange(master.id))}
        >
          Add {type === "vendors" ? "vendor" : "Unit"}
        </Button>
      ) : null}
    </div>
  );
}

function BudgetAmountField({ id, valuePaise, disabled, serverError, inputRef, onChange }: {
  readonly id: string;
  readonly valuePaise: number | undefined;
  readonly disabled: boolean;
  readonly serverError?: string;
  readonly inputRef: (element: HTMLInputElement | null) => void;
  readonly onChange: (value: number | undefined) => void;
}) {
  const initialText = editableRupeeText(valuePaise);
  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  const parsed = parseRupeeInputToPaise(text);
  const setEditableText = (next: string) => {
    textRef.current = next;
    setText(next);
  };

  useEffect(() => {
    const current = parseRupeeInputToPaise(textRef.current);
    if (valuePaise === undefined) {
      if (current.status === "valid") setEditableText("");
      return;
    }
    const next = editableRupeeText(valuePaise);
    if (current.status !== "valid" || current.paise !== valuePaise) setEditableText(next);
  }, [valuePaise]);

  const localError = rupeeInputError(parsed, text);
  return (
    <Field
      id={id}
      label="Unit budget (₹, before GST)"
      required
      hint="GST is fixed at 18% and is added when you save."
      error={localError ?? serverError}
    >
      {(props) => (
        <Input
          {...props}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onChange={(event) => {
            const nextText = event.target.value;
            setEditableText(nextText);
            const next = parseRupeeInputToPaise(nextText);
            onChange(next.status === "valid" ? next.paise : undefined);
          }}
        />
      )}
    </Field>
  );
}

function BudgetDateField({ id, label, value, disabled, required = false, error, inputRef, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly error?: string;
  readonly inputRef: (element: HTMLInputElement | null) => void;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      {(props) => (
        <Input
          {...props}
          ref={inputRef}
          type="datetime-local"
          disabled={disabled}
          value={toLocalDateTime(value)}
          onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : "")}
        />
      )}
    </Field>
  );
}

function SavedBudgetDetails({ values, vendors, uoms, unavailable, onRetry }: {
  readonly values: KnowledgeJsonObject;
  readonly vendors: readonly KnowledgeMaster[];
  readonly uoms: readonly KnowledgeMaster[];
  readonly unavailable: boolean;
  readonly onRetry?: () => void;
}) {
  if (unavailable) {
    return (
      <InlineMessage
        tone="warning"
        title="Saved budget details are unavailable"
        action={onRetry ? <Button size="compact" variant="secondary" leadingIcon={<RefreshCw />} onClick={onRetry}>Retry</Button> : undefined}
      >
        Retry before updating this budget.
      </InlineMessage>
    );
  }

  return (
    <>
      <dl className="knowledge-budget-details" role="group" aria-label="Saved budget details">
        <Definition label="Vendor" value={masterLabel(values.vendorId, vendors, "Unavailable vendor")} />
        <Definition label="Unit of measure" value={masterLabel(values.uomId, uoms, "Unavailable unit")} />
        <Definition label="Amount before GST" value={moneyValue(values.baseAmountPaise)} />
        <Definition label="GST" value={moneyValue(values.taxAmountPaise)} />
        <Definition label="Total including GST" value={moneyValue(values.totalAmountPaise)} />
        <Definition label="Starts on" value={dateValue(values.effectiveFrom)} />
        <Definition label="Ends on" value={stringValue(values.effectiveTo) ? dateValue(values.effectiveTo) : "No end date"} />
        {budgetNeedsReview(values) ? <Definition label="Review" value="Needs review" /> : null}
      </dl>
      {!hasAuthoritativeBase(values) ? (
        <InlineMessage tone="warning">
          Update is unavailable because the saved before-GST amount could not be loaded.
        </InlineMessage>
      ) : null}
    </>
  );
}

function Definition({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function BudgetCatalogMessages({ catalogStates, activeCounts, canQuickAdd, onQuickAdd }: {
  readonly catalogStates: readonly { readonly label: string; readonly state: KnowledgeBudgetCatalogState }[];
  readonly activeCounts: { readonly vendors: number; readonly uoms: number };
  readonly canQuickAdd: boolean;
  readonly onQuickAdd: KnowledgeBudgetBuilderProps["onQuickAdd"];
}) {
  const loading = catalogStates.filter(({ state }) => state.status === "loading");
  const failed = catalogStates.filter(({ state }) => state.status === "error");
  const stale = catalogStates.filter(({ state }) => Boolean(state.refreshErrorMessage));
  const refreshing = catalogStates.filter(({ state }) => state.refreshing);
  const missing = [
    activeCounts.vendors === 0 ? "Vendor" : null,
    activeCounts.uoms === 0 ? "Unit of measure" : null
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="knowledge-budget-builder__states">
      {loading.length ? <InlineMessage tone="info" role="status">Loading {joinLabels(loading.map(({ label }) => label))} options…</InlineMessage> : null}
      {failed.map(({ label, state }) => (
        <InlineMessage
          key={label}
          tone="error"
          role="alert"
          title={`${label} options could not be loaded`}
          action={state.onRetry ? <Button size="compact" variant="secondary" onClick={state.onRetry}>Retry {label}</Button> : undefined}
        >
          {state.errorMessage ?? `Retry before setting or updating a budget.`}
        </InlineMessage>
      ))}
      {stale.length ? (
        <InlineMessage
          tone="warning"
          title="Showing saved budget options"
          action={<Button size="compact" variant="secondary" onClick={() => stale.forEach(({ state }) => state.onRetry?.())}>Retry</Button>}
        >
          Latest updates could not be loaded.
        </InlineMessage>
      ) : refreshing.length ? <InlineMessage tone="info" role="status">Refreshing budget options; saved choices remain available.</InlineMessage> : null}
      {!loading.length && !failed.length && missing.map((label) => (
        <InlineMessage
          key={label}
          tone="warning"
          action={canQuickAdd ? (
            <Button
              size="compact"
              variant="secondary"
              onClick={() => onQuickAdd(label === "Vendor" ? "vendors" : "uoms", () => undefined)}
            >
              Add {label === "Unit of measure" ? "Unit" : label.toLowerCase()}
            </Button>
          ) : undefined}
        >
          {label === "Unit of measure"
            ? "No active Unit of measure is available. Add a Unit before setting a budget."
            : "No active Vendor is available. Add a Vendor before setting a budget."}
        </InlineMessage>
      ))}
    </div>
  );
}

function budgetDraftFromSaved(values: KnowledgeJsonObject, sourcePriceVersionId: string): KnowledgeJsonObject | null {
  const baseAmountPaise = numberValue(values.baseAmountPaise);
  if (baseAmountPaise === undefined) return null;
  const draft: Record<string, KnowledgeJsonValue> = {
    operation: "set_budget",
    sourcePriceVersionId,
    inputAmountPaise: baseAmountPaise,
    effectiveTo: null
  };
  for (const key of ["vendorId", "uomId", "effectiveFrom", "effectiveTo"] as const) {
    const next = values[key];
    if (next !== undefined) draft[key] = next;
  }
  return draft;
}

function createBudgetDraft(): KnowledgeJsonObject {
  return {
    operation: "set_budget",
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null
  };
}

function budgetValues(row: KnowledgeJsonObject): KnowledgeJsonObject {
  return row.operation === "reference" && isObject(row.priceVersion)
    ? row.priceVersion
    : row;
}

function isEditableBudget(row: KnowledgeJsonObject): boolean {
  return row.operation === "set_budget";
}

function canUpdateBudget(row: KnowledgeJsonObject): boolean {
  return row.operation === "reference"
    && Boolean(stringValue(row.priceVersionId))
    && isObject(row.priceVersion)
    && hasAuthoritativeBase(row.priceVersion);
}

function budgetRowKey(row: KnowledgeJsonObject, index: number): string {
  const source = stringValue(row.sourcePriceVersionId);
  const version = stringValue(row.priceVersionId);
  const entry = stringValue(row.priceEntryId);
  // An explicit update replaces a saved reference in place. Use the same key
  // on both sides of that transition so its disclosure stays open and focus
  // can move directly into the editable form.
  if (source) return `budget-${source}`;
  if (version) return `budget-${version}`;
  if (entry) return `legacy-${entry}`;
  return `new-${index}`;
}

function budgetSummary(
  values: KnowledgeJsonObject,
  row: KnowledgeJsonObject,
  vendors: readonly KnowledgeMaster[],
  uoms: readonly KnowledgeMaster[]
): string {
  const amount = row.operation === "set_budget"
    ? numberValue(values.inputAmountPaise)
    : numberValue(values.baseAmountPaise);
  const vendor = resolvedMasterName(values.vendorId, vendors);
  const uom = resolvedMasterName(values.uomId, uoms);
  const starts = stringValue(values.effectiveFrom);
  const complete = amount !== undefined && vendor && uom && validDate(starts);
  if (!complete) {
    return row.operation === "reference" ? "Budget needs attention" : "New budget";
  }
  return `${formatKnowledgeMoney(amount)} per ${uom} · ${vendor} · Starts ${formatKnowledgeDateTime(starts)}`;
}

function budgetNeedsReview(values: KnowledgeJsonObject): boolean {
  return values.reviewRequired === true
    || (typeof values.status === "string" && values.status !== "active");
}

function hasAuthoritativeBase(values: KnowledgeJsonObject): boolean {
  return numberValue(values.baseAmountPaise) !== undefined;
}

function removeContext(values: KnowledgeJsonObject, vendors: readonly KnowledgeMaster[], uoms: readonly KnowledgeMaster[]): string {
  const vendor = resolvedMasterName(values.vendorId, vendors) ?? "budget";
  const uom = resolvedMasterName(values.uomId, uoms);
  return uom ? `${vendor} ${uom} budget` : `${vendor} budget`;
}

function selectableMasters(masters: readonly KnowledgeMaster[]): readonly KnowledgeMaster[] {
  return masters
    .filter(({ status }) => status === "active")
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

function masterLabel(value: KnowledgeJsonValue | undefined, masters: readonly KnowledgeMaster[], fallback: string): string {
  const id = stringValue(value);
  if (!id) return "Not configured";
  return masters.find((master) => master.id === id)?.name ?? fallback;
}

function resolvedMasterName(value: KnowledgeJsonValue | undefined, masters: readonly KnowledgeMaster[]): string | null {
  const id = stringValue(value);
  return masters.find((master) => master.id === id)?.name ?? null;
}

function moneyValue(value: KnowledgeJsonValue | undefined): string {
  const amount = numberValue(value);
  return amount === undefined ? "Unavailable" : formatKnowledgeMoney(amount);
}

function dateValue(value: KnowledgeJsonValue | undefined): string {
  const date = stringValue(value);
  return validDate(date) ? formatKnowledgeDateTime(date) : "Unavailable";
}

function visibleFocusField(field: string | undefined): FocusTarget {
  if (field === "vendorId" || field === "uomId" || field === "inputAmountPaise" || field === "effectiveFrom" || field === "effectiveTo") return field;
  return "panel";
}

function toggleSetValue(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function focusTargetKey(rowKey: string, field: FocusTarget): string {
  return `${rowKey}:${field}`;
}

function rupeeInputError(parsed: RupeeInputParseResult, text: string): string | undefined {
  if (parsed.status === "valid") return undefined;
  if (parsed.status === "incomplete") return text ? "Complete the rupee amount with one or two decimal places." : "Enter an amount in rupees.";
  if (parsed.reason === "unsafe") return "Enter a smaller rupee amount.";
  return "Enter a non-negative rupee amount with up to two decimal places.";
}

function editableRupeeText(valuePaise: number | undefined): string {
  return typeof valuePaise === "number" && Number.isSafeInteger(valuePaise) && valuePaise >= 0
    ? formatPaiseForRupeeInput(valuePaise)
    : "";
}

function toLocalDateTime(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

function joinLabels(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "budget";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function domId(value: string): string {
  return `knowledge-budget-${value.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function objectArray(value: KnowledgeJsonValue | undefined): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isObject(value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: KnowledgeJsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
