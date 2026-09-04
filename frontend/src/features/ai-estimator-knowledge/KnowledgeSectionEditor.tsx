import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  KnowledgeBudgetBuilder,
  type KnowledgeBudgetCatalogState
} from "./KnowledgeBudgetBuilder";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import {
  KnowledgeQuantitySlabBuilder,
  type KnowledgeUomCatalogState
} from "./KnowledgeQuantitySlabBuilder";
import { KnowledgeSpecificationBuilder } from "./KnowledgeSpecificationBuilder";
import {
  KNOWLEDGE_MASTER_LABELS,
  KNOWLEDGE_SECTION_LABELS
} from "./knowledgePresentation";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import {
  validateKnowledgeSection,
  type KnowledgeValidationIssue
} from "./knowledgeSectionValidation";

const ARRAY_FIELDS = {
  overview: [],
  pricing: ["specifications", "brands"],
  "quantity-margin": [],
  scope: ["exclusions"],
  recommendations: ["recommendations", "exclusions"],
  quality: ["parameters"],
  execution: ["steps", "productivity"],
  advanced: ["dependencies", "modeOverrides"]
} as const satisfies Readonly<Record<KnowledgeSectionKey, readonly string[]>>;

const ARRAY_LABELS: Readonly<Record<string, string>> = {
  specifications: "Specifications",
  brands: "Vendors",
  quantitySlabs: "Quantity slabs",
  exclusions: "Exclusions",
  recommendations: "Recommendations",
  parameters: "Quality parameters",
  steps: "Execution steps",
  productivity: "Productivity rules",
  dependencies: "Dependencies",
  modeOverrides: "Mode overrides",
};

const KNOWLEDGE_MASTER_SINGULAR_LABELS = {
  uoms: "UOM",
  vendors: "Vendor",
  taxes: "Tax",
  priorities: "Priority",
  surfaces: "Surface",
  modes: "Mode"
} as const satisfies Readonly<Record<KnowledgeMasterType, string>>;

/*
 * Which reusable-value catalogs each section's controls actually read. A
 * control whose catalog is empty renders as a dropdown with nothing in it,
 * which is indistinguishable from a broken screen — so the sections that
 * depend on a catalog say when it is unusable instead of staying silent.
 */
const SECTION_MASTER_CATALOGS = {
  overview: [],
  pricing: ["vendors", "uoms"],
  "quantity-margin": ["uoms"],
  scope: ["modes", "surfaces"],
  recommendations: ["priorities"],
  quality: [],
  execution: ["uoms"],
  advanced: ["modes"]
} as const satisfies Readonly<Record<KnowledgeSectionKey, readonly KnowledgeMasterType[]>>;

export interface KnowledgeSectionEditorProps {
  readonly sectionKey: KnowledgeSectionKey;
  readonly payload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  /* The item's own Main Basket, shown as context where a row used to select
     one. Display only — this section never changes it. */
  readonly basketName?: string;
  readonly readOnly: boolean;
  /* True only when the revision itself cannot be edited. `readOnly` also covers
     a save in flight, and hiding controls for that would make them flicker. */
  readonly readOnlyRevision?: boolean;
  readonly canQuickAdd: boolean;
  readonly resetKey: string;
  readonly specificationScopeKey?: string;
  readonly specificationReferenceIds?: readonly string[];
  readonly slabSpecificationReferenceIds?: readonly string[];
  readonly pricingSpecifications?: KnowledgeJsonValue;
  readonly uomCatalogState?: KnowledgeUomCatalogState;
  readonly vendorCatalogState?: KnowledgeBudgetCatalogState;
  /** Per-catalog load state, so an unusable catalog can explain itself. */
  readonly masterCatalogStates?: Readonly<Partial<Record<KnowledgeMasterType, KnowledgeBudgetCatalogState>>>;
  readonly budgetReadOnly?: boolean;
  readonly budgetSaving?: boolean;
  readonly onRetrySavedBudgetDetails?: () => void;
  readonly pricingAfterSpecifications?: ReactNode;
  readonly validationAttempt?: number;
  readonly serverIssues?: readonly KnowledgeValidationIssue[];
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly onDirty: () => void;
  readonly onValidationChange: (valid: boolean) => void;
  readonly onQuickAdd: (type: KnowledgeMasterType, select: (master: KnowledgeMaster) => void) => void;
}

export interface KnowledgePrimaryUomEditorProps {
  readonly payload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly readOnly: boolean;
  readonly canQuickAdd: boolean;
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly onDirty: () => void;
  readonly onQuickAdd: KnowledgeSectionEditorProps["onQuickAdd"];
}

export function KnowledgePrimaryUomEditor({
  payload,
  masters,
  readOnly,
  canQuickAdd,
  onChange,
  onDirty,
  onQuickAdd
}: KnowledgePrimaryUomEditorProps) {
  function changeUom(value: string) {
    onDirty();
    const next = { ...payload } as Record<string, KnowledgeJsonValue>;
    if (value) next.uomId = value;
    else delete next.uomId;
    onChange(next);
  }

  return (
    <section className="knowledge-section-editor" aria-labelledby="knowledge-primary-uom-heading">
      <div className="knowledge-section-heading">
        <div>
          <h2 id="knowledge-primary-uom-heading">UOM</h2>
          <p>Choose the reusable value used as this item&apos;s primary unit of measurement.</p>
        </div>
        {readOnly ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
      </div>
      <MasterSelect
        id="knowledge-uom"
        label="UOM"
        type="uoms"
        value={stringValue(payload.uomId)}
        masters={masters.uoms ?? []}
        disabled={readOnly}
        quickAddDisabled={!canQuickAdd}
        onChange={changeUom}
        onQuickAdd={(select) => onQuickAdd("uoms", select)}
      />
    </section>
  );
}

export function KnowledgeSectionEditor({
  sectionKey,
  payload,
  masters,
  relationshipBaskets,
  relationshipItems,
  currentMainLineId,
  basketName,
  readOnly,
  readOnlyRevision = readOnly,
  canQuickAdd,
  resetKey,
  specificationScopeKey,
  specificationReferenceIds = [],
  slabSpecificationReferenceIds = [],
  pricingSpecifications,
  uomCatalogState = { status: "ready" },
  vendorCatalogState = { status: "ready" },
  masterCatalogStates = {},
  budgetReadOnly = readOnly,
  budgetSaving = false,
  onRetrySavedBudgetDetails,
  pricingAfterSpecifications,
  validationAttempt = 0,
  serverIssues = [],
  onChange,
  onDirty,
  onValidationChange,
  onQuickAdd
}: KnowledgeSectionEditorProps) {
  const issues = useMemo(
    () => [...validateKnowledgeSection(sectionKey, payload, {
      specifications: pricingSpecifications,
      uoms: masters.uoms,
      vendors: masters.vendors,
      uomCatalogStatus: uomCatalogState.status,
      vendorCatalogStatus: vendorCatalogState.status
    }), ...serverIssues],
    [masters.uoms, masters.vendors, payload, pricingSpecifications, sectionKey, serverIssues, uomCatalogState.status, vendorCatalogState.status]
  );
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const lastValidationAttempt = useRef(0);
  useEffect(() => { onValidationChange(issues.length === 0); }, [issues.length, onValidationChange, resetKey]);
  useEffect(() => {
    if (validationAttempt === 0) {
      lastValidationAttempt.current = 0;
      return;
    }
    /* Only a new save attempt may move focus. The issue count also changes while
       the author is typing, and re-running then would pull the caret out of the
       field mid-edit. Attempts with nothing to focus are left unconsumed so that
       server issues arriving a render later still land on the right control. */
    if (validationAttempt <= lastValidationAttempt.current || !issues.length) return;
    lastValidationAttempt.current = validationAttempt;
    const firstInvalidField = validationSummaryRef.current?.parentElement?.querySelector<HTMLElement>("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid");
    (firstInvalidField ?? validationSummaryRef.current)?.focus();
  }, [issues.length, validationAttempt]);

  function change(key: string, value: KnowledgeJsonValue | undefined) {
    onDirty();
    const next = { ...payload } as Record<string, KnowledgeJsonValue>;
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    if (
      key === "quantitySlabs" &&
      Array.isArray(value) &&
      value.length > 0 &&
      !Object.prototype.hasOwnProperty.call(payload, "gapBehavior")
    ) next.gapBehavior = "no_adjustment";
    onChange(next);
  }

  return (
    <div className="knowledge-section-editor">
      {sectionKey !== "pricing" ? (
        <div className="knowledge-section-heading">
          <div>
            {sectionKey === "recommendations" && basketName
              ? <p className="knowledge-section-eyebrow">Main Basket · {basketName}</p>
              : null}
            <h2>{KNOWLEDGE_SECTION_LABELS[sectionKey]}</h2>
            <p>{sectionHelp(sectionKey)}</p>
          </div>
          {readOnly ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
        </div>
      ) : null}
      {issues.length ? <div ref={validationSummaryRef} className="knowledge-validation-summary" role="alert" tabIndex={-1}><strong>Review {issues.length} section issue{issues.length === 1 ? "" : "s"}</strong><ul>{issues.map((issue) => <li key={`${issue.path}-${issue.message}`}><span>{validationPathLabel(issue.path)}: </span>{issue.message}</li>)}</ul></div> : null}

      <MasterCatalogNotices sectionKey={sectionKey} masters={masters} states={masterCatalogStates} />

      {sectionKey === "quantity-margin" ? (
        <>
          <div className="knowledge-form-grid">
            {(["startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps"] as const).map((field) => (
              <NumberField key={field} field={field} label={BPS_LABELS[field]} value={payload[field]} disabled={readOnly} max={field === "startMarginBps" || field === "bottomMarginBps" ? 9999 : undefined} onChange={(value) => change(field, value)} />
            ))}
          </div>
          <KnowledgeQuantitySlabBuilder
            value={payload.slabRates}
            specifications={pricingSpecifications}
            uoms={masters.uoms ?? []}
            uomCatalogState={uomCatalogState}
            issues={issues.filter((issue) => issue.path === "slabRates" || issue.path.startsWith("slabRates."))}
            readOnly={readOnly}
            onDirty={onDirty}
            onChange={(value) => change("slabRates", value)}
          />
          {objectArray(payload.quantitySlabs).length > 0 ? (
            <StructuredArrayEditor
              field="quantitySlabs"
              label="Legacy adjustment slabs"
              value={payload.quantitySlabs}
              sectionPayload={payload}
              masters={masters}
              relationshipBaskets={relationshipBaskets}
              relationshipItems={relationshipItems}
              currentMainLineId={currentMainLineId}
              disabled={readOnly}
              hideActions={readOnlyRevision}
              canQuickAdd={canQuickAdd}
              showAdd={false}
              onQuickAdd={onQuickAdd}
              onDirty={onDirty}
              onChange={(value) => change("quantitySlabs", value)}
            />
          ) : null}
        </>
      ) : null}

      {sectionKey === "scope" ? (
        <div className="knowledge-form-grid">
          <MasterMultiSelect id="scope-modes" label="Applicable modes" type="modes" values={stringArray(payload.modeIds)} masters={masters.modes ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("modeIds", values)} onQuickAdd={(select) => onQuickAdd("modes", select)} />
          <MasterMultiSelect id="scope-surfaces" label="Applicable surfaces" type="surfaces" values={stringArray(payload.surfaceIds)} masters={masters.surfaces ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("surfaceIds", values)} onQuickAdd={(select) => onQuickAdd("surfaces", select)} />
        </div>
      ) : null}

      {ARRAY_FIELDS[sectionKey].map((field) => field === "specifications" ? (
        <Fragment key={`${specificationScopeKey ?? resetKey}-${field}`}>
          <KnowledgeSpecificationBuilder
            value={payload.specifications}
            priceEntries={payload.priceEntries}
            referencedSpecificationIds={specificationReferenceIds}
            slabReferencedSpecificationIds={slabSpecificationReferenceIds}
            readOnly={readOnly}
            issues={issues.filter((issue) => issue.path === "specifications" || issue.path.startsWith("specifications."))}
            onDirty={onDirty}
            onChange={(value) => change(field, value)}
          />
          {pricingAfterSpecifications}
        </Fragment>
      ) : (
        <StructuredArrayEditor
          key={`${resetKey}-${field}`}
          field={field}
          label={ARRAY_LABELS[field] ?? field}
          value={payload[field]}
          sectionPayload={payload}
          masters={masters}
          relationshipBaskets={relationshipBaskets}
          relationshipItems={relationshipItems}
          currentMainLineId={currentMainLineId}
          disabled={readOnly}
          hideActions={readOnlyRevision}
          canQuickAdd={canQuickAdd}
          onQuickAdd={onQuickAdd}
          onDirty={onDirty}
          onChange={(value) => change(field, value)}
        />
      ))}

      {sectionKey === "pricing" ? (
        <KnowledgeBudgetBuilder
          value={payload.priceEntries}
          vendors={masters.vendors ?? []}
          uoms={masters.uoms ?? []}
          vendorCatalogState={vendorCatalogState}
          uomCatalogState={uomCatalogState}
          issues={issues.filter((issue) => issue.path === "priceEntries" || issue.path.startsWith("priceEntries."))}
          validationAttempt={validationAttempt}
          readOnly={budgetReadOnly}
          saving={budgetSaving}
          canQuickAdd={canQuickAdd}
          resetKey={resetKey}
          onRetrySavedDetails={onRetrySavedBudgetDetails}
          onQuickAdd={onQuickAdd}
          onDirty={onDirty}
          onChange={(value) => change("priceEntries", value)}
        />
      ) : null}

      {sectionKey === "advanced" && Array.isArray(payload.revisionLineage) ? (
        <ReadOnlyStructuredData label="Revision lineage" value={payload.revisionLineage} />
      ) : null}

      {readOnly && Object.keys(payload).length === 0 ? (
        <InlineMessage tone="info">This section was not configured in this revision.</InlineMessage>
      ) : null}
    </div>
  );
}

const BPS_LABELS = {
  startMarginBps: "Start margin (basis points)",
  bottomMarginBps: "Bottom margin (basis points)",
  pmcMarkupBps: "PMC markup (basis points)",
  wastageBps: "Wastage (basis points)"
} as const;

function NumberField({ field, label, value, disabled, max, onChange }: {
  readonly field: string;
  readonly label: string;
  readonly value: KnowledgeJsonValue | undefined;
  readonly disabled: boolean;
  readonly max?: number;
  readonly onChange: (value: number | undefined) => void;
}) {
  return <Field id={`knowledge-${field}`} label={label} hint="Integer; 100 bps = 1%.">{(props) => <Input {...props} type="number" min={0} max={max} step={1} disabled={disabled} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />}</Field>;
}

function MasterSelect({ id, label, type, value, masters, disabled, quickAddDisabled, onChange, onQuickAdd }: {
  readonly id: string;
  readonly label: string;
  readonly type: KnowledgeMasterType;
  readonly value: string;
  readonly masters: readonly KnowledgeMaster[];
  readonly disabled: boolean;
  readonly quickAddDisabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onQuickAdd: (select: (master: KnowledgeMaster) => void) => void;
}) {
  return <div className="knowledge-master-control"><Field id={id} label={label}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not configured</option>{masters.filter(({ status, id: masterId }) => status === "active" || masterId === value).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field><Button size="compact" variant="quiet" disabled={disabled || quickAddDisabled} onClick={() => onQuickAdd((master) => onChange(master.id))}>Add {KNOWLEDGE_MASTER_SINGULAR_LABELS[type]}</Button></div>;
}

function MasterMultiSelect({ id, label, type, values, masters, disabled, quickAddDisabled, onChange, onQuickAdd }: {
  readonly id: string;
  readonly label: string;
  readonly type: KnowledgeMasterType;
  readonly values: readonly string[];
  readonly masters: readonly KnowledgeMaster[];
  readonly disabled: boolean;
  readonly quickAddDisabled: boolean;
  readonly onChange: (values: readonly string[]) => void;
  readonly onQuickAdd: (select: (master: KnowledgeMaster) => void) => void;
}) {
  return <div className="knowledge-master-control"><Field id={id} label={label} hint="Use Command/Ctrl to select more than one.">{(props) => <Select {...props} multiple size={Math.min(5, Math.max(3, masters.length))} disabled={disabled} value={[...values]} onChange={(event) => onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>{masters.filter(({ status, id: masterId }) => status === "active" || values.includes(masterId)).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field><Button size="compact" variant="quiet" disabled={disabled || quickAddDisabled} onClick={() => onQuickAdd((master) => onChange([...new Set([...values, master.id])]))}>Add {KNOWLEDGE_MASTER_SINGULAR_LABELS[type]}</Button></div>;
}

interface EditorRow { readonly id: string; readonly value: KnowledgeJsonObject }

function StructuredArrayEditor({ field, label, value, sectionPayload, masters, relationshipBaskets, relationshipItems, currentMainLineId, disabled, hideActions, canQuickAdd, showAdd = true, onQuickAdd, onDirty, onChange }: {
  readonly field: string;
  readonly label: string;
  readonly value: KnowledgeJsonValue | undefined;
  readonly sectionPayload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  readonly disabled: boolean;
  readonly hideActions: boolean;
  readonly canQuickAdd: boolean;
  readonly showAdd?: boolean;
  readonly onQuickAdd: KnowledgeSectionEditorProps["onQuickAdd"];
  readonly onDirty: () => void;
  readonly onChange: (value: readonly KnowledgeJsonValue[]) => void;
}) {
  const rows = useMemo<readonly EditorRow[]>(() => isJsonArray(value) ? value.filter(isJsonObject).map((entry, index) => ({ id: rowId(entry, index), value: entry })) : [], [value]);
  function replace(index: number, next: KnowledgeJsonObject) {
    const values = rows.map((row, rowIndex) => rowIndex === index ? next : row.value);
    onChange(values);
  }
  return <KnowledgeRepeater label={label} addLabel={field === "brands" ? "Add vendor" : `Add ${singular(label)}`} items={rows} disabled={disabled} showAdd={showAdd} readOnly={hideActions} emptyMessage={`No ${label.toLowerCase()} configured.`}
    onAdd={() => { onDirty(); onChange([...rows.map(({ value: row }) => row), newRow(field)]); }}
    onRemove={(id) => { onDirty(); onChange(rows.filter((row) => row.id !== id).map((row) => row.value)); }}
    onMove={(id, direction) => { onDirty(); const current = [...rows]; const from = current.findIndex((row) => row.id === id); const to = direction === "up" ? from - 1 : from + 1; if (from < 0 || to < 0 || to >= current.length) return; [current[from], current[to]] = [current[to], current[from]]; onChange(current.map((row) => row.value)); }}
    renderItem={(row, index) => <GuidedRow field={field} index={index} value={row.value} sectionPayload={sectionPayload} masters={masters} relationshipBaskets={relationshipBaskets} relationshipItems={relationshipItems} currentMainLineId={currentMainLineId} disabled={disabled} canQuickAdd={canQuickAdd} onQuickAdd={onQuickAdd} onChange={(next) => { onDirty(); replace(index, next); }} />}
  />;
}

function GuidedRow({ field, index, value, sectionPayload, masters, relationshipBaskets, relationshipItems, currentMainLineId, disabled, canQuickAdd, onQuickAdd, onChange }: {
  readonly field: string;
  readonly index: number;
  readonly value: KnowledgeJsonObject;
  readonly sectionPayload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  readonly disabled: boolean;
  readonly canQuickAdd: boolean;
  readonly onQuickAdd: KnowledgeSectionEditorProps["onQuickAdd"];
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const prefix = `${field}-${index}`;
  const set = (key: string, next: KnowledgeJsonValue | undefined) => onChange(setObjectValue(value, key, next));
  if (field === "brands") return <div className="knowledge-form-grid"><RowInput id={`${prefix}-name`} label="Vendor name" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-description`} label="Description" value={stringValue(value.description)} disabled={disabled} multiline onChange={(next) => set("description", next || undefined)} /></div>;
  if (field === "quantitySlabs") return <div className="knowledge-form-grid"><RowInput id={`${prefix}-minimum`} label="Minimum quantity" value={stringValue(value.minimumQuantity)} disabled={disabled} required onChange={(next) => set("minimumQuantity", next || undefined)} /><RowInput id={`${prefix}-maximum`} label="Maximum quantity" value={stringValue(value.maximumQuantity)} disabled={disabled} hint="Leave blank for no upper limit." onChange={(next) => set("maximumQuantity", next || null)} /><RowNumber id={`${prefix}-adjustment`} label="Adjustment (basis points)" value={numberValue(value.adjustmentBps)} disabled={disabled} required onChange={(next) => set("adjustmentBps", next)} /></div>;
  if (field === "exclusions" || field === "dependencies") return <RelationshipRow prefix={prefix} kind={field} value={value} baskets={relationshipBaskets} items={relationshipItems} currentMainLineId={currentMainLineId} disabled={disabled} onChange={onChange} />;
  if (field === "recommendations") return <div className="knowledge-form-grid"><MasterRowSelect id={`${prefix}-priority`} label="Priority" value={stringValue(value.priorityId)} masters={masters.priorities ?? []} disabled={disabled} onChange={(next) => set("priorityId", next)} /><RowInput id={`${prefix}-name`} label="Recommendation" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-reason`} label="Reason" value={stringValue(value.reason)} disabled={disabled} multiline onChange={(next) => set("reason", next || null)} /></div>;
  if (field === "parameters") return <QualityRow prefix={prefix} value={value} disabled={disabled} onChange={onChange} />;
  if (field === "steps") return <ExecutionStepRow prefix={prefix} value={value} steps={objectArray(sectionPayload.steps)} disabled={disabled} set={set} />;
  if (field === "productivity") return <div className="knowledge-form-grid"><RowInput id={`${prefix}-value`} label="Productivity value" value={stringValue(value.value)} disabled={disabled} required onChange={(next) => set("value", next || undefined)} /><MasterRowSelect id={`${prefix}-uom`} label="UOM" value={stringValue(value.uomId)} masters={masters.uoms ?? []} disabled={disabled} onChange={(next) => set("uomId", next)} /><RowNumber id={`${prefix}-crew`} label="Crew size" value={numberValue(value.crewSize)} disabled={disabled} onChange={(next) => set("crewSize", next)} /><RowInput id={`${prefix}-skill`} label="Skill type" value={stringValue(value.skillType)} disabled={disabled} onChange={(next) => set("skillType", next || null)} /><RowInput id={`${prefix}-minimum`} label="Minimum duration" value={stringValue(value.minimumDuration)} disabled={disabled} onChange={(next) => set("minimumDuration", next || null)} /><RowInput id={`${prefix}-maximum`} label="Maximum duration" value={stringValue(value.maximumDuration)} disabled={disabled} onChange={(next) => set("maximumDuration", next || null)} /><RowSelect id={`${prefix}-unit`} label="Duration unit" value={stringValue(value.durationUnit)} values={["minutes", "hours", "days", "weeks"]} disabled={disabled} onChange={(next) => set("durationUnit", next || null)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
  if (field === "modeOverrides") return <div className="knowledge-form-grid"><MasterRowSelect id={`${prefix}-mode`} label="Mode" value={stringValue(value.modeId)} masters={masters.modes ?? []} disabled={disabled} onChange={(next) => set("modeId", next)} /><RowInput id={`${prefix}-description`} label="Override description" value={stringValue(value.description)} disabled={disabled} required multiline onChange={(next) => set("description", next || undefined)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
  return <InlineMessage tone="warning">This structured row type is unavailable.</InlineMessage>;
}

function RelationshipRow({ prefix, kind, value, baskets, items, currentMainLineId, disabled, onChange }: {
  readonly prefix: string;
  readonly kind: "exclusions" | "dependencies";
  readonly value: KnowledgeJsonObject;
  readonly baskets: readonly KnowledgeBasket[];
  readonly items: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  readonly disabled: boolean;
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const set = (key: string, next: KnowledgeJsonValue | undefined) => onChange(setObjectValue(value, key, next));
  const exclusion = kind === "exclusions";
  if (exclusion) return <div className="knowledge-form-grid"><RowInput id={`${prefix}-name`} label="Exclusion" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-reason`} label="Reason" value={stringValue(value.reason)} disabled={disabled} multiline onChange={(next) => set("reason", next || null)} /></div>;
  return <div className="knowledge-form-grid"><RelationshipTargetFields prefix={prefix} value={value} baskets={baskets} items={items} required excludeMainLineId={currentMainLineId} disabled={disabled} onChange={onChange} /><RowInput id={`${prefix}-reason`} label="Reason" value={stringValue(value.reason)} disabled={disabled} multiline onChange={(next) => set("reason", next || undefined)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
}

function RelationshipTargetFields({ prefix, value, baskets, items, required, excludeMainLineId, disabled, hint, onChange }: {
  readonly prefix: string;
  readonly value: KnowledgeJsonObject;
  readonly baskets: readonly KnowledgeBasket[];
  readonly items: readonly KnowledgeItemListItem[];
  readonly required: boolean;
  readonly excludeMainLineId?: string;
  readonly disabled: boolean;
  readonly hint?: string;
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const basketId = stringValue(value.targetBasketId);
  const mainLineId = stringValue(value.targetMainLineId);
  const itemOptions = items
    .filter((item) => (!basketId || item.basketId === basketId) && item.mainLineId !== excludeMainLineId)
    .map((item) => ({ id: item.mainLineId, label: item.mainLineName }));
  return <><StableIdSelect id={`${prefix}-basket`} label="Target Basket" value={basketId} options={baskets.map((basket) => ({ id: basket.id, label: basket.name }))} disabled={disabled} nullable={!required} hint={hint} onChange={(next) => { const selectedItem = items.find((item) => item.mainLineId === mainLineId); const keepMainLine = !next || selectedItem?.basketId === next; onChange(setObjectValue(setObjectValue(value, "targetBasketId", next || null), "targetMainLineId", keepMainLine ? mainLineId || null : null)); }} /><StableIdSelect id={`${prefix}-main-line`} label="Target Main Line" value={mainLineId} options={itemOptions} disabled={disabled || (required && !basketId)} nullable={!required} hint={!basketId ? (required ? "Choose a Basket first to load its Main Lines." : "Optionally choose a Basket to filter Main Lines.") : hint} onChange={(next) => onChange(setObjectValue(value, "targetMainLineId", next || null))} /></>;
}

interface StableIdOption { readonly id: string; readonly label: string }

function StableIdSelect({ id, label, value, options, disabled, nullable = false, hint, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly options: readonly StableIdOption[]; readonly disabled: boolean; readonly nullable?: boolean; readonly hint?: string; readonly onChange: (value: string) => void }) {
  const unresolved = Boolean(value) && !options.some((option) => option.id === value);
  return <Field id={id} label={label} required={!nullable} hint={hint}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{nullable ? "Not selected" : "Select"}</option>{unresolved ? <option value={value} disabled>Unavailable selection · {value}</option> : null}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>}</Field>;
}

function StableIdMultiSelect({ id, label, values, options, disabled, onChange }: { readonly id: string; readonly label: string; readonly values: readonly string[]; readonly options: readonly StableIdOption[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void }) {
  const unresolved = values.filter((value) => !options.some((option) => option.id === value));
  return <Field id={id} label={label} hint="Select zero or more named steps; stable IDs are stored.">{(props) => <Select {...props} multiple size={Math.max(3, Math.min(6, options.length + unresolved.length))} disabled={disabled} value={[...values]} onChange={(event) => onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>{unresolved.map((value) => <option key={value} value={value} disabled>Unavailable step · {value}</option>)}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>}</Field>;
}

function rowId(value: KnowledgeJsonValue, index: number): string {
  if (isJsonObject(value) && typeof value.id === "string") return value.id;
  if (isJsonObject(value) && typeof value.priceEntryId === "string") return value.priceEntryId;
  return `knowledge-row-${index}`;
}

/**
 * The payload stores a trimmed array, so echoing that back on every keystroke
 * would delete the comma or space the author is still typing. The typed text is
 * kept here and only re-synced when the payload changes for some other reason.
 */
function AllowedValuesInput({ id, values, disabled, onChange }: { readonly id: string; readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void }) {
  const [text, setText] = useState(() => values.join(", "));
  const ownValues = useRef(values);
  useEffect(() => {
    if (sameStrings(ownValues.current, values)) return;
    ownValues.current = values;
    setText(values.join(", "));
  }, [values]);
  return <RowInput id={id} label="Allowed values" hint="Separate each value with a comma." value={text} disabled={disabled} onChange={(next) => {
    setText(next);
    const parsed = next.split(",").map((entry) => entry.trim()).filter(Boolean);
    ownValues.current = parsed;
    onChange(parsed);
  }} />;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function QualityRow({ prefix, value, disabled, onChange }: { readonly prefix: string; readonly value: KnowledgeJsonObject; readonly disabled: boolean; readonly onChange: (value: KnowledgeJsonObject) => void }) {
  const set = (key: string, next: KnowledgeJsonValue | undefined) => onChange(setObjectValue(value, key, next));
  const type = stringValue(value.type);
  const choice = ["dropdown", "radio", "multi_select"].includes(type);
  const numeric = type === "number";
  const changeType = (next: string) => {
    const copy = { ...value } as Record<string, KnowledgeJsonValue>;
    copy.type = next;
    copy.defaultValue = null;
    if (!["dropdown", "radio", "multi_select"].includes(next)) delete copy.allowedValues;
    if (next !== "number") { delete copy.minimum; delete copy.maximum; delete copy.unit; }
    onChange(copy);
  };
  const allowed = stringArray(value.allowedValues);
  return <div className="knowledge-form-grid"><RowSelect id={`${prefix}-type`} label="Parameter type" value={type} values={["text", "number", "dropdown", "radio", "checkbox", "multi_select", "boolean"]} disabled={disabled} onChange={changeType} /><RowInput id={`${prefix}-label`} label="Label" value={stringValue(value.label)} disabled={disabled} required onChange={(next) => set("label", next || undefined)} />{numeric ? <><RowInput id={`${prefix}-unit`} label="Unit" value={stringValue(value.unit)} disabled={disabled} onChange={(next) => set("unit", next || null)} /><RowInput id={`${prefix}-minimum`} label="Minimum" value={stringValue(value.minimum)} disabled={disabled} onChange={(next) => set("minimum", next || null)} /><RowInput id={`${prefix}-maximum`} label="Maximum" value={stringValue(value.maximum)} disabled={disabled} onChange={(next) => set("maximum", next || null)} /></> : null}{choice ? <AllowedValuesInput id={`${prefix}-values`} values={allowed} disabled={disabled} onChange={(next) => set("allowedValues", next)} /> : null}<QualityDefaultControl prefix={prefix} type={type} value={value.defaultValue} allowedValues={allowed} disabled={disabled} onChange={(next) => set("defaultValue", next)} /><RowInput id={`${prefix}-category`} label="Category" value={stringValue(value.category)} disabled={disabled} onChange={(next) => set("category", next || null)} /><RowCheckbox label="Required" checked={booleanValue(value.required)} disabled={disabled} onChange={(next) => set("required", next)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
}

function QualityDefaultControl({ prefix, type, value, allowedValues, disabled, onChange }: { readonly prefix: string; readonly type: string; readonly value: KnowledgeJsonValue | undefined; readonly allowedValues: readonly string[]; readonly disabled: boolean; readonly onChange: (value: KnowledgeJsonValue) => void }) {
  if (type === "boolean" || type === "checkbox") return <RowSelect id={`${prefix}-default`} label="Default value" value={value === true ? "true" : value === false ? "false" : ""} values={["true", "false"]} disabled={disabled} onChange={(next) => onChange(next === "" ? null : next === "true")} />;
  if (type === "dropdown" || type === "radio") return <StableIdSelect id={`${prefix}-default`} label="Default value" value={stringValue(value)} options={allowedValues.map((entry) => ({ id: entry, label: entry }))} disabled={disabled} nullable onChange={(next) => onChange(next || null)} />;
  if (type === "multi_select") return <StableIdMultiSelect id={`${prefix}-default`} label="Default values" values={stringArray(value)} options={allowedValues.map((entry) => ({ id: entry, label: entry }))} disabled={disabled} onChange={onChange} />;
  return <RowInput id={`${prefix}-default`} label="Default value" value={stringValue(value)} disabled={disabled} onChange={(next) => onChange(next || null)} />;
}

function ExecutionStepRow({ prefix, value, steps, disabled, set }: { readonly prefix: string; readonly value: KnowledgeJsonObject; readonly steps: readonly KnowledgeJsonObject[]; readonly disabled: boolean; readonly set: (key: string, value: KnowledgeJsonValue | undefined) => void }) {
  const stepId = stringValue(value.id);
  const options = steps.filter((step) => stringValue(step.id) && stringValue(step.id) !== stepId).map((step) => ({ id: stringValue(step.id), label: stringValue(step.name) || "Unnamed step" }));
  return <div className="knowledge-form-grid"><RowNumber id={`${prefix}-order`} label="Step order" value={numberValue(value.order)} disabled={disabled} min={0} required onChange={(next) => set("order", next)} /><RowInput id={`${prefix}-name`} label="Step name" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-description`} label="Description" value={stringValue(value.description)} disabled={disabled} multiline onChange={(next) => set("description", next || null)} /><RowInput id={`${prefix}-duration`} label="Duration value" value={stringValue(value.durationValue)} disabled={disabled} onChange={(next) => set("durationValue", next || null)} /><RowSelect id={`${prefix}-unit`} label="Duration unit" value={stringValue(value.durationUnit)} values={["minutes", "hours", "days", "weeks"]} disabled={disabled} onChange={(next) => set("durationUnit", next || null)} /><RowNumber id={`${prefix}-crew`} label="Crew size" value={numberValue(value.crewSize)} disabled={disabled} min={1} onChange={(next) => set("crewSize", next ?? null)} /><RowInput id={`${prefix}-skill`} label="Skill type" value={stringValue(value.skillType)} disabled={disabled} onChange={(next) => set("skillType", next || null)} /><StableIdMultiSelect id={`${prefix}-dependencies`} label="Dependency steps" values={stringArray(value.dependencyStepIds)} options={options} disabled={disabled} onChange={(next) => set("dependencyStepIds", next)} /><RowCheckbox label="Mandatory" checked={booleanValue(value.mandatory)} disabled={disabled} onChange={(next) => set("mandatory", next)} /><RowCheckbox label="Parallelizable" checked={booleanValue(value.parallelizable)} disabled={disabled} onChange={(next) => set("parallelizable", next)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
}

function RowInput({ id, label, value, disabled, onChange, multiline = false, required = false, hint, readOnly = false }: { readonly id: string; readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange?: (value: string) => void; readonly multiline?: boolean; readonly required?: boolean; readonly hint?: string; readonly readOnly?: boolean }) {
  return <Field id={id} label={label} required={required} hint={hint}>{(props) => multiline ? <Textarea {...props} disabled={disabled} readOnly={readOnly} value={value} onChange={(event) => onChange?.(event.target.value)} /> : <Input {...props} disabled={disabled} readOnly={readOnly} value={value} onChange={(event) => onChange?.(event.target.value)} />}</Field>;
}

function RowNumber({ id, label, value, disabled, onChange, min = 0, max, required = false }: { readonly id: string; readonly label: string; readonly value: number | undefined; readonly disabled: boolean; readonly onChange: (value: number | undefined) => void; readonly min?: number; readonly max?: number; readonly required?: boolean }) {
  return <Field id={id} label={label} required={required}>{(props) => <Input {...props} type="number" min={min} max={max} step={1} disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />}</Field>;
}

function RowSelect({ id, label, value, values, disabled, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (value: string) => void }) {
  return <Field id={id} label={label} required>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select</option>{values.map((entry) => <option key={entry} value={entry}>{entry.replaceAll("_", " ")}</option>)}</Select>}</Field>;
}

/*
 * Says why a catalog-backed control has nothing to offer. An empty catalog is
 * the case worth naming: loading and failure already look like something is
 * happening, but a catalog that loaded successfully with no rows in it renders
 * an empty dropdown that looks identical to a bug.
 */
function MasterCatalogNotices({ sectionKey, masters, states }: {
  readonly sectionKey: KnowledgeSectionKey;
  readonly masters: KnowledgeSectionEditorProps["masters"];
  readonly states: NonNullable<KnowledgeSectionEditorProps["masterCatalogStates"]>;
}) {
  const notices: Array<{
    type: KnowledgeMasterType;
    tone: "info" | "warning" | "error";
    message: string;
    onRetry?: () => void;
  }> = [];
  for (const type of SECTION_MASTER_CATALOGS[sectionKey] as readonly KnowledgeMasterType[]) {
    const state = states[type];
    if (!state) continue;
    const label = KNOWLEDGE_MASTER_LABELS[type].toLowerCase();
    if (state.status === "loading") {
      notices.push({ type, tone: "info", message: `Loading ${label}…` });
      continue;
    }
    if (state.status === "error") {
      notices.push({
        type,
        tone: "error",
        message: state.errorMessage ?? `${KNOWLEDGE_MASTER_LABELS[type]} could not be loaded.`,
        onRetry: state.onRetry
      });
      continue;
    }
    if ((masters[type] ?? []).some(({ status }) => status === "active")) continue;
    notices.push({
      type,
      tone: "warning",
      message: `No ${label} are configured yet, so this list is empty. Add one under Estimation configuration before choosing here.`
    });
  }

  if (notices.length === 0) return null;
  return (
    <>
      {notices.map((notice) => (
        <InlineMessage
          key={notice.type}
          tone={notice.tone}
          role={notice.tone === "error" ? "alert" : undefined}
        >
          {notice.message}
          {notice.tone === "error" && notice.onRetry ? (
            <Button size="compact" variant="quiet" onClick={notice.onRetry}>Try again</Button>
          ) : null}
        </InlineMessage>
      ))}
    </>
  );
}

function MasterRowSelect({ id, label, value, masters, disabled, nullable = false, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly masters: readonly KnowledgeMaster[]; readonly disabled: boolean; readonly nullable?: boolean; readonly onChange: (value: string | null) => void }) {
  return <Field id={id} label={label} required={!nullable}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value || (nullable ? null : ""))}><option value="">{nullable ? "Not applicable" : "Select"}</option>{masters.filter(({ status, id: masterId }) => status === "active" || masterId === value).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field>;
}

function RowCheckbox({ label, checked, disabled, onChange }: { readonly label: string; readonly checked: boolean; readonly disabled: boolean; readonly onChange: (value: boolean) => void }) {
  return <label className="knowledge-checkbox-row"><Checkbox checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function RowDateTime({ id, label, value, disabled, onChange, required = false }: { readonly id: string; readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void; readonly required?: boolean }) {
  return <Field id={id} label={label} required={required}>{(props) => <Input {...props} type="datetime-local" disabled={disabled} value={toLocalDateTime(value)} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : "")} />}</Field>;
}

function ReadOnlyStructuredData({ label, value }: { readonly label: string; readonly value: readonly KnowledgeJsonValue[] }) {
  return <section className="knowledge-readonly-data" aria-label={label}><h3>{label}</h3>{value.length ? <ol>{value.map((entry, index) => <li key={index}><code>{JSON.stringify(entry)}</code></li>)}</ol> : <p>No {label.toLowerCase()} recorded.</p>}</section>;
}

/* Fields the backend requires on every row but the author never sees. Hiding a
   control does not remove it from the contract, so new rows carry its default. */
const NEW_ROW_DEFAULTS: Readonly<Record<string, KnowledgeJsonObject>> = {
  parameters: { required: false, active: true },
  recommendations: { active: true, dependency: false },
  exclusions: { active: true }
};

function newRow(field: string): KnowledgeJsonObject {
  const id = `knowledge-${field}-${crypto.randomUUID()}`;
  return { id, ...NEW_ROW_DEFAULTS[field] };
}

function setObjectValue(value: KnowledgeJsonObject, key: string, next: KnowledgeJsonValue | undefined): KnowledgeJsonObject {
  const copy = { ...value } as Record<string, KnowledgeJsonValue>;
  if (next === undefined || next === "") delete copy[key];
  else copy[key] = next;
  return copy;
}

function isJsonArray(value: KnowledgeJsonValue | undefined): value is readonly KnowledgeJsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: KnowledgeJsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanValue(value: KnowledgeJsonValue | undefined, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toLocalDateTime(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: KnowledgeJsonValue | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function objectArray(value: KnowledgeJsonValue | undefined): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function singular(label: string): string {
  return label.endsWith("ies") ? `${label.slice(0, -3)}y` : label.endsWith("s") ? label.slice(0, -1) : label;
}

function validationPathLabel(path: string): string {
  return path.split(".").map((part) => {
    if (part === "brands") return "Vendors";
    if (part === "priceEntries") return "Budgets";
    if (/^\d+$/u.test(part) && path.startsWith("priceEntries.")) return `Budget ${Number(part) + 1}`;
    if (part === "vendorId") return "Vendor";
    if (part === "uomId") return "Unit of measure";
    if (part === "taxRuleId" || part === "taxVersionId" || part === "treatment") return "Budget";
    if (part === "inputAmountPaise") return "Unit budget (₹, before GST)";
    if (part === "effectiveFrom") return "Starts on";
    if (part === "effectiveTo") return "Ends on";
    return part;
  }).join(" → ");
}

function sectionHelp(sectionKey: KnowledgeSectionKey): string {
  return ({
    overview: "Set the item identity and compatible reusable values.",
    pricing: "Maintain Specifications, Vendors, and the unit budgets used by the estimator.",
    "quantity-margin": "Configure priced Quantity slabs and shared basis-point margins. Legacy adjustment slabs retain their existing calculation behavior.",
    scope: "Define applicable modes, surfaces, and explicit exclusions.",
    recommendations: "Recommend related components, and exclude Baskets or Main Lines this item never covers.",
    quality: "Define customer-facing and technical quality parameters.",
    execution: "Order execution steps and productivity rules.",
    advanced: "Maintain dependencies, mode overrides, and revision lineage."
  } as const)[sectionKey];
}
