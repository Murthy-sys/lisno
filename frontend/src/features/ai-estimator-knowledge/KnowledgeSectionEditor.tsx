import { useEffect, useMemo, useRef } from "react";

import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import { KNOWLEDGE_SECTION_LABELS } from "./knowledgePresentation";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import { KNOWLEDGE_SECTION_KEYS } from "./knowledgeTypes";
import { validateKnowledgeSection } from "./knowledgeSectionValidation";

const ARRAY_FIELDS = {
  overview: ["sectionApplicability"],
  pricing: ["specifications", "brands", "priceEntries"],
  "quantity-margin": ["quantitySlabs"],
  scope: ["exclusions"],
  recommendations: ["recommendations"],
  quality: ["parameters"],
  execution: ["steps", "productivity"],
  advanced: ["dependencies", "modeOverrides"]
} as const satisfies Readonly<Record<KnowledgeSectionKey, readonly string[]>>;

const ARRAY_LABELS: Readonly<Record<string, string>> = {
  sectionApplicability: "Section applicability rules",
  specifications: "Specifications",
  brands: "Brands",
  priceEntries: "Price versions",
  quantitySlabs: "Quantity slabs",
  exclusions: "Exclusions",
  recommendations: "Recommendations",
  parameters: "Quality parameters",
  steps: "Execution steps",
  productivity: "Productivity rules",
  dependencies: "Dependencies",
  modeOverrides: "Mode overrides",
};

export interface KnowledgeSectionEditorProps {
  readonly sectionKey: KnowledgeSectionKey;
  readonly payload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  readonly readOnly: boolean;
  readonly canQuickAdd: boolean;
  readonly resetKey: string;
  readonly validationAttempt?: number;
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly onDirty: () => void;
  readonly onValidationChange: (valid: boolean) => void;
  readonly onQuickAdd: (type: KnowledgeMasterType, select: (master: KnowledgeMaster) => void) => void;
}

export function KnowledgeSectionEditor({
  sectionKey,
  payload,
  masters,
  relationshipBaskets,
  relationshipItems,
  currentMainLineId,
  readOnly,
  canQuickAdd,
  resetKey,
  validationAttempt = 0,
  onChange,
  onDirty,
  onValidationChange,
  onQuickAdd
}: KnowledgeSectionEditorProps) {
  const issues = useMemo(() => validateKnowledgeSection(sectionKey, payload), [payload, sectionKey]);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => { onValidationChange(issues.length === 0); }, [issues.length, onValidationChange, resetKey]);
  useEffect(() => {
    if (validationAttempt <= 0 || !issues.length) return;
    const firstInvalidField = validationSummaryRef.current?.parentElement?.querySelector<HTMLElement>("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid");
    (firstInvalidField ?? validationSummaryRef.current)?.focus();
  }, [issues.length, validationAttempt]);

  function change(key: string, value: KnowledgeJsonValue | undefined) {
    onDirty();
    const next = { ...payload } as Record<string, KnowledgeJsonValue>;
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  }

  return (
    <div className="knowledge-section-editor">
      <div className="knowledge-section-heading">
        <div>
          <h2>{KNOWLEDGE_SECTION_LABELS[sectionKey]}</h2>
          <p>{sectionHelp(sectionKey)}</p>
        </div>
        {readOnly ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
      </div>
      {issues.length ? <div ref={validationSummaryRef} className="knowledge-validation-summary" role="alert" tabIndex={-1}><strong>Review {issues.length} section issue{issues.length === 1 ? "" : "s"}</strong><ul>{issues.map((issue) => <li key={`${issue.path}-${issue.message}`}><span>{issue.path.replaceAll(".", " → ")}: </span>{issue.message}</li>)}</ul></div> : null}

      {sectionKey === "overview" ? (
        <>
          <Field id="knowledge-description" label="Description">
            {(props) => <Textarea {...props} disabled={readOnly} value={stringValue(payload.description)} onChange={(event) => change("description", event.target.value || undefined)} />}
          </Field>
          <div className="knowledge-form-grid">
            <MasterSelect id="knowledge-uom" label="UOM" type="uoms" value={stringValue(payload.uomId)} masters={masters.uoms ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(value) => change("uomId", value || undefined)} onQuickAdd={(select) => onQuickAdd("uoms", select)} />
            <MasterSelect id="knowledge-priority" label="Priority" type="priorities" value={stringValue(payload.priorityId)} masters={masters.priorities ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(value) => change("priorityId", value || undefined)} onQuickAdd={(select) => onQuickAdd("priorities", select)} />
          </div>
          <div className="knowledge-form-grid">
            <MasterMultiSelect id="knowledge-modes" label="Modes" type="modes" values={stringArray(payload.modeIds)} masters={masters.modes ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("modeIds", values)} onQuickAdd={(select) => onQuickAdd("modes", select)} />
            <MasterMultiSelect id="knowledge-surfaces" label="Surfaces" type="surfaces" values={stringArray(payload.surfaceIds)} masters={masters.surfaces ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("surfaceIds", values)} onQuickAdd={(select) => onQuickAdd("surfaces", select)} />
          </div>
        </>
      ) : null}

      {sectionKey === "pricing" ? (
        <>
          <div className="knowledge-form-grid">
            <TextField field="technicalDescription" label="Technical description" payload={payload} readOnly={readOnly} onChange={change} multiline />
            <TextField field="internalVendorNotes" label="Internal vendor notes" payload={payload} readOnly={readOnly} onChange={change} multiline />
            <TextField field="qualityLevel" label="Quality level" payload={payload} readOnly={readOnly} onChange={change} />
          </div>
        </>
      ) : null}

      {sectionKey === "quantity-margin" ? (
        <div className="knowledge-form-grid">
          <EnumField id="quantity-gap-behavior" label="Gap behavior" value={stringValue(payload.gapBehavior)} values={["reject", "no_adjustment"]} disabled={readOnly} onChange={(value) => change("gapBehavior", value || undefined)} />
          {(["startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps"] as const).map((field) => (
            <NumberField key={field} field={field} label={BPS_LABELS[field]} value={payload[field]} disabled={readOnly} max={field === "startMarginBps" || field === "bottomMarginBps" ? 9999 : undefined} onChange={(value) => change(field, value)} />
          ))}
        </div>
      ) : null}

      {sectionKey === "scope" ? (
        <div className="knowledge-form-grid">
          <MasterMultiSelect id="scope-modes" label="Applicable modes" type="modes" values={stringArray(payload.modeIds)} masters={masters.modes ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("modeIds", values)} onQuickAdd={(select) => onQuickAdd("modes", select)} />
          <MasterMultiSelect id="scope-surfaces" label="Applicable surfaces" type="surfaces" values={stringArray(payload.surfaceIds)} masters={masters.surfaces ?? []} disabled={readOnly} quickAddDisabled={!canQuickAdd} onChange={(values) => change("surfaceIds", values)} onQuickAdd={(select) => onQuickAdd("surfaces", select)} />
        </div>
      ) : null}

      {ARRAY_FIELDS[sectionKey].map((field) => (
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
          canQuickAdd={canQuickAdd}
          onQuickAdd={onQuickAdd}
          onDirty={onDirty}
          onChange={(value) => change(field, value)}
        />
      ))}

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

function TextField({ field, label, payload, readOnly, onChange, multiline = false }: {
  readonly field: string;
  readonly label: string;
  readonly payload: KnowledgeJsonObject;
  readonly readOnly: boolean;
  readonly onChange: (key: string, value: KnowledgeJsonValue | undefined) => void;
  readonly multiline?: boolean;
}) {
  return <Field id={`knowledge-${field}`} label={label}>{(props) => multiline
    ? <Textarea {...props} disabled={readOnly} value={stringValue(payload[field])} onChange={(event) => onChange(field, event.target.value || undefined)} />
    : <Input {...props} disabled={readOnly} value={stringValue(payload[field])} onChange={(event) => onChange(field, event.target.value || undefined)} />}</Field>;
}

function NumberField({ field, label, value, disabled, max, onChange }: {
  readonly field: string;
  readonly label: string;
  readonly value: KnowledgeJsonValue | undefined;
  readonly disabled: boolean;
  readonly max?: number;
  readonly onChange: (value: number | undefined) => void;
}) {
  return <Field id={`knowledge-${field}`} label={label} hint="Stored as an integer; 100 basis points equals 1%.">{(props) => <Input {...props} type="number" min={0} max={max} step={1} disabled={disabled} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />}</Field>;
}

function EnumField({ id, label, value, values, disabled, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly values: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return <Field id={id} label={label}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not configured</option>{values.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>}</Field>;
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
  return <div className="knowledge-master-control"><Field id={id} label={label}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not configured</option>{masters.filter(({ status, id: masterId }) => status === "active" || masterId === value).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field><Button size="compact" variant="quiet" disabled={disabled || quickAddDisabled} onClick={() => onQuickAdd((master) => onChange(master.id))}>Add {type.replace(/s$/u, "")}</Button></div>;
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
  return <div className="knowledge-master-control"><Field id={id} label={label} hint="Use Command/Ctrl to select more than one.">{(props) => <Select {...props} multiple size={Math.min(5, Math.max(3, masters.length))} disabled={disabled} value={[...values]} onChange={(event) => onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>{masters.filter(({ status, id: masterId }) => status === "active" || values.includes(masterId)).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field><Button size="compact" variant="quiet" disabled={disabled || quickAddDisabled} onClick={() => onQuickAdd((master) => onChange([...new Set([...values, master.id])]))}>Add {type.replace(/s$/u, "")}</Button></div>;
}

interface EditorRow { readonly id: string; readonly value: KnowledgeJsonObject }

function StructuredArrayEditor({ field, label, value, sectionPayload, masters, relationshipBaskets, relationshipItems, currentMainLineId, disabled, canQuickAdd, onQuickAdd, onDirty, onChange }: {
  readonly field: string;
  readonly label: string;
  readonly value: KnowledgeJsonValue | undefined;
  readonly sectionPayload: KnowledgeJsonObject;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly currentMainLineId: string;
  readonly disabled: boolean;
  readonly canQuickAdd: boolean;
  readonly onQuickAdd: KnowledgeSectionEditorProps["onQuickAdd"];
  readonly onDirty: () => void;
  readonly onChange: (value: readonly KnowledgeJsonValue[]) => void;
}) {
  const rows = useMemo<readonly EditorRow[]>(() => isJsonArray(value) ? value.filter(isJsonObject).map((entry, index) => ({ id: rowId(entry, index), value: entry })) : [], [value]);
  function replace(index: number, next: KnowledgeJsonObject) {
    const values = rows.map((row, rowIndex) => rowIndex === index ? next : row.value);
    onChange(values);
  }
  return <KnowledgeRepeater label={label} addLabel={`Add ${singular(label)}`} items={rows} disabled={disabled} emptyMessage={`No ${label.toLowerCase()} configured.`}
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
  if (field === "specifications" || field === "brands") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RowInput id={`${prefix}-name`} label="Name" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-description`} label="Description" value={stringValue(value.description)} disabled={disabled} multiline onChange={(next) => set("description", next || undefined)} /></div>;
  if (field === "sectionApplicability") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RowSelect id={`${prefix}-section`} label="Section key" value={stringValue(value.sectionKey)} values={KNOWLEDGE_SECTION_KEYS} disabled={disabled} onChange={(next) => set("sectionKey", next || undefined)} /><RowSelect id={`${prefix}-state`} label="State" value={stringValue(value.applicability)} values={["configured", "not_configured", "not_applicable"]} disabled={disabled} onChange={(next) => set("applicability", next || undefined)} /></div>;
  if (field === "priceEntries") return <PriceEntryRow prefix={prefix} value={value} specifications={objectArray(sectionPayload.specifications)} masters={masters} disabled={disabled} canQuickAdd={canQuickAdd} onQuickAdd={onQuickAdd} set={set} onChange={onChange} />;
  if (field === "quantitySlabs") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RowInput id={`${prefix}-minimum`} label="Minimum quantity" value={stringValue(value.minimumQuantity)} disabled={disabled} required onChange={(next) => set("minimumQuantity", next || undefined)} /><RowInput id={`${prefix}-maximum`} label="Maximum quantity" value={stringValue(value.maximumQuantity)} disabled={disabled} hint="Leave blank for no upper limit." onChange={(next) => set("maximumQuantity", next || null)} /><RowNumber id={`${prefix}-adjustment`} label="Adjustment (basis points)" value={numberValue(value.adjustmentBps)} disabled={disabled} required onChange={(next) => set("adjustmentBps", next)} /></div>;
  if (field === "exclusions" || field === "dependencies") return <RelationshipRow prefix={prefix} kind={field} value={value} baskets={relationshipBaskets} items={relationshipItems} currentMainLineId={currentMainLineId} disabled={disabled} onChange={onChange} />;
  if (field === "recommendations") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RelationshipTargetFields prefix={prefix} value={value} baskets={relationshipBaskets} items={relationshipItems} required disabled={disabled} onChange={onChange} /><RowSelect id={`${prefix}-type`} label="Recommendation type" value={stringValue(value.type)} values={["mandatory", "recommended", "optional"]} disabled={disabled} onChange={(next) => set("type", next || undefined)} /><MasterRowSelect id={`${prefix}-priority`} label="Priority" value={stringValue(value.priorityId)} masters={masters.priorities ?? []} disabled={disabled} nullable onChange={(next) => set("priorityId", next)} /><RowInput id={`${prefix}-reason`} label="Reason" value={stringValue(value.reason)} disabled={disabled} required multiline onChange={(next) => set("reason", next || undefined)} /><RowSelect id={`${prefix}-relationship`} label="Quantity relationship" value={stringValue(value.quantityRelationship)} values={["same_quantity", "percentage_of_source", "fixed", "per_unit"]} disabled={disabled} onChange={(next) => set("quantityRelationship", next || undefined)} /><RowInput id={`${prefix}-quantity`} label="Quantity value" value={stringValue(value.quantityValue)} disabled={disabled} onChange={(next) => set("quantityValue", next || null)} /><RowCheckbox label="Dependency" checked={booleanValue(value.dependency)} disabled={disabled} onChange={(next) => set("dependency", next)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
  if (field === "parameters") return <QualityRow prefix={prefix} value={value} disabled={disabled} onChange={onChange} />;
  if (field === "steps") return <ExecutionStepRow prefix={prefix} value={value} steps={objectArray(sectionPayload.steps)} disabled={disabled} set={set} />;
  if (field === "productivity") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RowInput id={`${prefix}-value`} label="Productivity value" value={stringValue(value.value)} disabled={disabled} required onChange={(next) => set("value", next || undefined)} /><MasterRowSelect id={`${prefix}-uom`} label="UOM" value={stringValue(value.uomId)} masters={masters.uoms ?? []} disabled={disabled} onChange={(next) => set("uomId", next)} /><RowNumber id={`${prefix}-crew`} label="Crew size" value={numberValue(value.crewSize)} disabled={disabled} onChange={(next) => set("crewSize", next)} /><RowInput id={`${prefix}-skill`} label="Skill type" value={stringValue(value.skillType)} disabled={disabled} onChange={(next) => set("skillType", next || null)} /><RowInput id={`${prefix}-minimum`} label="Minimum duration" value={stringValue(value.minimumDuration)} disabled={disabled} onChange={(next) => set("minimumDuration", next || null)} /><RowInput id={`${prefix}-maximum`} label="Maximum duration" value={stringValue(value.maximumDuration)} disabled={disabled} onChange={(next) => set("maximumDuration", next || null)} /><RowSelect id={`${prefix}-unit`} label="Duration unit" value={stringValue(value.durationUnit)} values={["minutes", "hours", "days", "weeks"]} disabled={disabled} onChange={(next) => set("durationUnit", next || null)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
  if (field === "modeOverrides") return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><MasterRowSelect id={`${prefix}-mode`} label="Mode" value={stringValue(value.modeId)} masters={masters.modes ?? []} disabled={disabled} onChange={(next) => set("modeId", next)} /><RowInput id={`${prefix}-description`} label="Override description" value={stringValue(value.description)} disabled={disabled} required multiline onChange={(next) => set("description", next || undefined)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
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
  return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RelationshipTargetFields prefix={prefix} value={value} baskets={baskets} items={items} required={!exclusion} excludeMainLineId={kind === "dependencies" ? currentMainLineId : undefined} disabled={disabled} hint={exclusion ? "Choose a Basket or a Main Line; at least one target is required." : undefined} onChange={onChange} /><RowInput id={`${prefix}-reason`} label="Reason" value={stringValue(value.reason)} disabled={disabled} multiline onChange={(next) => set("reason", next || undefined)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
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

function PriceEntryRow({ prefix, value, specifications, masters, disabled, canQuickAdd, onQuickAdd, set, onChange }: { readonly prefix: string; readonly value: KnowledgeJsonObject; readonly specifications: readonly KnowledgeJsonObject[]; readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>; readonly disabled: boolean; readonly canQuickAdd: boolean; readonly onQuickAdd: KnowledgeSectionEditorProps["onQuickAdd"]; readonly set: (key: string, value: KnowledgeJsonValue | undefined) => void; readonly onChange: (value: KnowledgeJsonObject) => void }) {
  const operation = stringValue(value.operation);
  const referenced = operation === "reference";
  const taxRule = (masters.taxes ?? []).find(({ id }) => id === stringValue(value.taxRuleId));
  const resolved = isJsonObject(value.priceVersion) ? value.priceVersion : null;
  const replace = () => {
    if (!resolved) return;
    const copied: Record<string, KnowledgeJsonValue> = { operation: "append", priceEntryId: stringValue(value.priceEntryId) };
    for (const key of ["vendorId", "uomId", "specificationId", "modeId", "taxRuleId", "taxVersionId", "inputAmountPaise", "treatment", "effectiveFrom", "effectiveTo", "status"] as const) {
      const next = resolved[key];
      if (next !== undefined) copied[key] = next;
    }
    onChange(copied);
  };
  return <div className="knowledge-form-grid"><RowSelect id={`${prefix}-operation`} label="Price operation" value={operation} values={["append", "reference"]} disabled={disabled || referenced} onChange={(next) => set("operation", next || undefined)} /><RowInput id={`${prefix}-entry-id`} label="Price entry ID" value={stringValue(value.priceEntryId)} disabled readOnly />{referenced ? <><RowInput id={`${prefix}-version-id`} label="Price version ID" value={stringValue(value.priceVersionId)} disabled readOnly />{resolved ? <ResolvedPriceVersion value={resolved} /> : <p className="knowledge-help-text">Saved price details are unavailable.</p>}<Button size="compact" variant="secondary" disabled={disabled || !resolved} onClick={replace}>Replace price version</Button></> : <><div className="knowledge-master-control"><MasterRowSelect id={`${prefix}-vendor`} label="Vendor" value={stringValue(value.vendorId)} masters={masters.vendors ?? []} disabled={disabled} onChange={(next) => set("vendorId", next)} /><Button size="compact" variant="quiet" disabled={disabled || !canQuickAdd} onClick={() => onQuickAdd("vendors", (master) => set("vendorId", master.id))}>Add vendor</Button></div><MasterRowSelect id={`${prefix}-uom`} label="UOM" value={stringValue(value.uomId)} masters={masters.uoms ?? []} disabled={disabled} onChange={(next) => set("uomId", next)} /><StableIdSelect id={`${prefix}-specification`} label="Specification" value={stringValue(value.specificationId)} options={specifications.map((specification) => ({ id: stringValue(specification.id), label: stringValue(specification.name) || "Unnamed specification" })).filter(({ id }) => id)} disabled={disabled} nullable onChange={(next) => set("specificationId", next || null)} /><MasterRowSelect id={`${prefix}-mode`} label="Mode" value={stringValue(value.modeId)} masters={masters.modes ?? []} disabled={disabled} nullable onChange={(next) => set("modeId", next)} /><div className="knowledge-master-control"><MasterRowSelect id={`${prefix}-tax-rule`} label="Tax rule" value={stringValue(value.taxRuleId)} masters={masters.taxes ?? []} disabled={disabled} onChange={(next) => onChange(setObjectValue(setObjectValue(value, "taxRuleId", next), "taxVersionId", undefined))} /><Button size="compact" variant="quiet" disabled={disabled || !canQuickAdd} onClick={() => onQuickAdd("taxes", (master) => onChange(setObjectValue(setObjectValue(value, "taxRuleId", master.id), "taxVersionId", undefined)))}>Add tax</Button></div><TaxVersionSelect id={`${prefix}-tax-version`} value={stringValue(value.taxVersionId)} taxRule={taxRule} disabled={disabled} onChange={(next) => set("taxVersionId", next || undefined)} /><RowNumber id={`${prefix}-amount`} label="Input amount (paise)" value={numberValue(value.inputAmountPaise)} disabled={disabled} min={0} required onChange={(next) => set("inputAmountPaise", next)} /><RowSelect id={`${prefix}-treatment`} label="Tax treatment" value={stringValue(value.treatment)} values={["exclusive", "inclusive"]} disabled={disabled} onChange={(next) => set("treatment", next || undefined)} /><RowDateTime id={`${prefix}-from`} label="Effective from" value={stringValue(value.effectiveFrom)} disabled={disabled} required onChange={(next) => set("effectiveFrom", next || undefined)} /><RowDateTime id={`${prefix}-to`} label="Effective to" value={stringValue(value.effectiveTo)} disabled={disabled} onChange={(next) => set("effectiveTo", next || null)} /><RowSelect id={`${prefix}-status`} label="Version status" value={stringValue(value.status)} values={["draft", "active", "inactive"]} disabled={disabled} onChange={(next) => set("status", next || undefined)} /></>}</div>;
}

function ResolvedPriceVersion({ value }: { readonly value: KnowledgeJsonObject }) {
  return <dl className="knowledge-summary-list" aria-label="Immutable saved price details"><div><dt>Version</dt><dd>{numberValue(value.versionNumber) ?? "Unavailable"}</dd></div><div><dt>Input</dt><dd>{numberValue(value.inputAmountPaise) ?? "Unavailable"} paise</dd></div><div><dt>Base</dt><dd>{numberValue(value.baseAmountPaise) ?? "Unavailable"} paise</dd></div><div><dt>Tax</dt><dd>{numberValue(value.taxAmountPaise) ?? "Unavailable"} paise</dd></div><div><dt>Total</dt><dd>{numberValue(value.totalAmountPaise) ?? "Unavailable"} paise</dd></div><div><dt>Status</dt><dd>{stringValue(value.status) || "Unavailable"}</dd></div></dl>;
}

function TaxVersionSelect({ id, value, taxRule, disabled, onChange }: { readonly id: string; readonly value: string; readonly taxRule: KnowledgeMaster | undefined; readonly disabled: boolean; readonly onChange: (value: string) => void }) {
  const versions = (taxRule?.taxVersions ?? []).filter((version) => version.status === "active" || version.id === value);
  return <Field id={id} label="Tax version" required hint={taxRule && !versions.length ? "No active tax versions are available for the selected rule." : undefined}>{(props) => <Select {...props} value={value} disabled={disabled || !taxRule} onChange={(event) => onChange(event.target.value)}><option value="">Select a version</option>{versions.map((version) => <option key={version.id} value={version.id} disabled={version.status !== "active"}>Version {version.versionNumber} · {version.rateBps / 100}% · {version.treatment} · {version.status}</option>)}</Select>}</Field>;
}

function rowId(value: KnowledgeJsonValue, index: number): string {
  if (isJsonObject(value) && typeof value.id === "string") return value.id;
  if (isJsonObject(value) && typeof value.priceEntryId === "string") return value.priceEntryId;
  return `knowledge-row-${index}`;
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
  return <div className="knowledge-form-grid"><ReadOnlyId value={stringValue(value.id)} /><RowSelect id={`${prefix}-type`} label="Parameter type" value={type} values={["text", "number", "dropdown", "radio", "checkbox", "multi_select", "boolean"]} disabled={disabled} onChange={changeType} /><RowInput id={`${prefix}-label`} label="Label" value={stringValue(value.label)} disabled={disabled} required onChange={(next) => set("label", next || undefined)} />{numeric ? <><RowInput id={`${prefix}-unit`} label="Unit" value={stringValue(value.unit)} disabled={disabled} onChange={(next) => set("unit", next || null)} /><RowInput id={`${prefix}-minimum`} label="Minimum" value={stringValue(value.minimum)} disabled={disabled} onChange={(next) => set("minimum", next || null)} /><RowInput id={`${prefix}-maximum`} label="Maximum" value={stringValue(value.maximum)} disabled={disabled} onChange={(next) => set("maximum", next || null)} /></> : null}{choice ? <RowInput id={`${prefix}-values`} label="Allowed values" hint="Comma-separated values." value={allowed.join(", ")} disabled={disabled} onChange={(next) => set("allowedValues", next.split(",").map((entry) => entry.trim()).filter(Boolean))} /> : null}<QualityDefaultControl prefix={prefix} type={type} value={value.defaultValue} allowedValues={allowed} disabled={disabled} onChange={(next) => set("defaultValue", next)} /><RowInput id={`${prefix}-category`} label="Category" value={stringValue(value.category)} disabled={disabled} onChange={(next) => set("category", next || null)} /><RowCheckbox label="Required" checked={booleanValue(value.required)} disabled={disabled} onChange={(next) => set("required", next)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
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
  return <div className="knowledge-form-grid"><ReadOnlyId value={stepId} /><RowNumber id={`${prefix}-order`} label="Step order" value={numberValue(value.order)} disabled={disabled} min={0} required onChange={(next) => set("order", next)} /><RowInput id={`${prefix}-name`} label="Step name" value={stringValue(value.name)} disabled={disabled} required onChange={(next) => set("name", next || undefined)} /><RowInput id={`${prefix}-description`} label="Description" value={stringValue(value.description)} disabled={disabled} multiline onChange={(next) => set("description", next || null)} /><RowInput id={`${prefix}-duration`} label="Duration value" value={stringValue(value.durationValue)} disabled={disabled} onChange={(next) => set("durationValue", next || null)} /><RowSelect id={`${prefix}-unit`} label="Duration unit" value={stringValue(value.durationUnit)} values={["minutes", "hours", "days", "weeks"]} disabled={disabled} onChange={(next) => set("durationUnit", next || null)} /><RowNumber id={`${prefix}-crew`} label="Crew size" value={numberValue(value.crewSize)} disabled={disabled} min={1} onChange={(next) => set("crewSize", next ?? null)} /><RowInput id={`${prefix}-skill`} label="Skill type" value={stringValue(value.skillType)} disabled={disabled} onChange={(next) => set("skillType", next || null)} /><StableIdMultiSelect id={`${prefix}-dependencies`} label="Dependency steps" values={stringArray(value.dependencyStepIds)} options={options} disabled={disabled} onChange={(next) => set("dependencyStepIds", next)} /><RowCheckbox label="Mandatory" checked={booleanValue(value.mandatory)} disabled={disabled} onChange={(next) => set("mandatory", next)} /><RowCheckbox label="Parallelizable" checked={booleanValue(value.parallelizable)} disabled={disabled} onChange={(next) => set("parallelizable", next)} /><RowCheckbox label="Active" checked={booleanValue(value.active, true)} disabled={disabled} onChange={(next) => set("active", next)} /></div>;
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

function MasterRowSelect({ id, label, value, masters, disabled, nullable = false, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly masters: readonly KnowledgeMaster[]; readonly disabled: boolean; readonly nullable?: boolean; readonly onChange: (value: string | null) => void }) {
  return <Field id={id} label={label} required={!nullable}>{(props) => <Select {...props} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value || (nullable ? null : ""))}><option value="">{nullable ? "Not applicable" : "Select"}</option>{masters.filter(({ status, id: masterId }) => status === "active" || masterId === value).map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}</Select>}</Field>;
}

function RowCheckbox({ label, checked, disabled, onChange }: { readonly label: string; readonly checked: boolean; readonly disabled: boolean; readonly onChange: (value: boolean) => void }) {
  return <label className="knowledge-checkbox-row"><Checkbox checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function RowDateTime({ id, label, value, disabled, onChange, required = false }: { readonly id: string; readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void; readonly required?: boolean }) {
  return <Field id={id} label={label} required={required}>{(props) => <Input {...props} type="datetime-local" disabled={disabled} value={toLocalDateTime(value)} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : "")} />}</Field>;
}

function ReadOnlyId({ value }: { readonly value: string }) {
  return <Field id={`knowledge-stable-id-${value}`} label="Stable ID">{(props) => <Input {...props} value={value} readOnly />}</Field>;
}

function ReadOnlyStructuredData({ label, value }: { readonly label: string; readonly value: readonly KnowledgeJsonValue[] }) {
  return <section className="knowledge-readonly-data" aria-label={label}><h3>{label}</h3>{value.length ? <ol>{value.map((entry, index) => <li key={index}><code>{JSON.stringify(entry)}</code></li>)}</ol> : <p>No {label.toLowerCase()} recorded.</p>}</section>;
}

function newRow(field: string): KnowledgeJsonObject {
  const id = `knowledge-${field}-${crypto.randomUUID()}`;
  if (field === "priceEntries") return { operation: "append", priceEntryId: id };
  return { id };
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

function sectionHelp(sectionKey: KnowledgeSectionKey): string {
  return ({
    overview: "Set the item identity and compatible reusable values.",
    pricing: "Maintain specifications, immutable price-version commands, and internal pricing notes. Money uses paise.",
    "quantity-margin": "Configure quantity slabs and basis-point margins. Preview calculations remain server-owned.",
    scope: "Define applicable modes, surfaces, and explicit exclusions.",
    recommendations: "Relate this item to other stable Basket and Main Line IDs.",
    quality: "Define customer-facing and technical quality parameters.",
    execution: "Order execution steps and productivity rules.",
    advanced: "Maintain dependencies, mode overrides, and revision lineage."
  } as const)[sectionKey];
}
