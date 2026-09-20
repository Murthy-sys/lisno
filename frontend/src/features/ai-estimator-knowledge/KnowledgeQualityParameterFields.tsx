import { useEffect, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { KnowledgeQualityInspectionFields } from "./KnowledgeQualityInspectionFields";
import { QUALITY_STAGE_OPTIONS, QUALITY_TYPE_LABELS, QUALITY_METHOD_LABELS } from "./knowledgeQualityPresentation";
import {
  QUALITY_SEVERITY_OPTIONS,
  isQualityControlOptionReference, qualityControlSelectOptions,
  qualityFrequencySelectionFromSampling, qualityPerformerSelection, qualitySamplingForFrequency, qualitySeverity,
  type QualityControlOptionCatalog, type QualityFrequency
} from "./knowledgeQuality";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeQualityControlOptionKind, KnowledgeQualityControlOptionReference } from "./knowledgeTypes";

const text = (value: KnowledgeJsonValue | undefined) => typeof value === "string" ? value : "";
const strings = (value: KnowledgeJsonValue | undefined): readonly string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
const ADD_FREQUENCY_OPTION = "__add_quality_frequency__";
const ADD_PERFORMER_OPTION = "__add_quality_performer__";

/** Essential fields retain the existing section-editor behavior; the shared checklist opts into metadata. */
export function KnowledgeQualityParameterFields({ prefix, value, disabled, onChange, detailed = false, errors = {}, qualityOptions, qualityOptionsLoading, canCreateQualityOptions = false, onQuickAddQualityOption }: {
  readonly prefix: string;
  readonly value: KnowledgeJsonObject;
  readonly disabled: boolean;
  readonly onChange: (value: KnowledgeJsonObject) => void;
  readonly detailed?: boolean;
  readonly errors?: Readonly<Record<string, string>>;
  readonly qualityOptions?: QualityControlOptionCatalog;
  readonly qualityOptionsLoading?: Readonly<Partial<Record<KnowledgeQualityControlOptionKind, boolean>>>;
  readonly canCreateQualityOptions?: boolean;
  readonly onQuickAddQualityOption?: (kind: KnowledgeQualityControlOptionKind, returnFocus: HTMLSelectElement) => void;
}) {
  const set = (key: string, next: KnowledgeJsonValue | undefined) => {
    const copy = { ...value } as Record<string, KnowledgeJsonValue>;
    if (next === undefined) delete copy[key]; else copy[key] = next;
    onChange(copy);
  };
  const type = text(value.type);
  const choice = ["dropdown", "radio", "multi_select"].includes(type);
  const severity = qualitySeverity(value.severity);
  const performer = qualityPerformerSelection(value.responsibleRole);
  const frequency = qualityFrequencySelectionFromSampling(value.sampling);
  const legacyPerformer = text(value.responsibleRole).trim();
  const legacyFrequency = value.sampling !== undefined && value.sampling !== null && !frequency;
  const unresolvedPerformer = isQualityControlOptionReference(performer) && !qualityControlSelectOptions("performer", qualityOptions).some(option => option.value === performer);
  const unresolvedFrequency = isQualityControlOptionReference(frequency) && !qualityControlSelectOptions("frequency", qualityOptions).some(option => option.value === frequency);
  const evidence = value.evidence && typeof value.evidence === "object" && !Array.isArray(value.evidence) ? value.evidence as KnowledgeJsonObject : {};
  const changeType = (next: string) => {
    const copy = { ...value } as Record<string, KnowledgeJsonValue>;
    copy.type = next;
    copy.defaultValue = null;
    if (!["dropdown", "radio", "multi_select"].includes(next)) delete copy.allowedValues;
    if (next !== "number") { delete copy.minimum; delete copy.maximum; delete copy.unit; }
    onChange(copy);
  };
  const changeOptions = (allowedValues: readonly string[]) => {
    const copy = { ...value, allowedValues } as Record<string, KnowledgeJsonValue>;
    if (Array.isArray(copy.defaultValue)) copy.defaultValue = copy.defaultValue.filter((entry) => typeof entry === "string" && allowedValues.includes(entry));
    else if (typeof copy.defaultValue === "string" && !allowedValues.includes(copy.defaultValue)) copy.defaultValue = null;
    onChange(copy);
  };
  return <div className="knowledge-quality-check">
    <Field id={`${prefix}-label`} label="Question / check" required error={errors.label}>{(props) => <Textarea {...props} disabled={disabled} value={text(value.label)} onChange={(event) => set("label", event.target.value || undefined)} />}</Field>
    {detailed ? <>
      <Field id={`${prefix}-instructions`} label="Instructions" error={errors.instructions} hint="Explain how the site team should perform this check.">{(props) => <Textarea {...props} rows={2} maxLength={4000} disabled={disabled} value={text(value.instructions)} onChange={(event) => set("instructions", event.target.value || null)} />}</Field>
      <Field id={`${prefix}-stage`} label="Stage" error={errors.stage} hint="Choose a suggested stage or keep your existing stage name.">{(props) => <Input {...props} list={`${prefix}-stages`} maxLength={240} disabled={disabled} value={text(value.stage)} onChange={(event) => set("stage", event.target.value || null)} />}</Field>
      <datalist id={`${prefix}-stages`}>{QUALITY_STAGE_OPTIONS.map(stage => <option key={stage.key} value={stage.label} />)}</datalist>
    </> : null}
    <div className="knowledge-form-grid">
      <Field id={`${prefix}-type`} label="Answer type" required error={errors.type}>
        {(props) => <Select {...props} value={type} disabled={disabled} onChange={(event) => changeType(event.target.value)}>
          <option value="">Select</option>
          {Object.entries(QUALITY_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>}
      </Field>
      {choice ? <AllowedValuesInput id={`${prefix}-values`} values={strings(value.allowedValues)} disabled={disabled} onChange={changeOptions} /> : null}
      {detailed ? <Field id={`${prefix}-checkMethod`} label="Check method" error={errors.checkMethod}>{(props) => <Select {...props} disabled={disabled} value={text(value.checkMethod)} onChange={(event) => set("checkMethod", event.target.value || null)}><option value="">Not specified</option>{Object.entries(QUALITY_METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>}</Field> : null}
    </div>
    {detailed && type === "number" ? <fieldset className="knowledge-quality-control-group knowledge-quality-pass-range">
      <legend>Pass range <span aria-hidden="true">*</span></legend>
      <p>The inclusive minimum and maximum accepted result.</p>
      <div className="knowledge-quality-pass-range__fields">
        <Field id={`${prefix}-minimum`} label="Minimum" required error={errors.minimum}>{(props) => <Input {...props} inputMode="decimal" maxLength={4000} disabled={disabled} value={text(value.minimum)} onChange={(event) => set("minimum", event.target.value || undefined)} />}</Field>
        <Field id={`${prefix}-maximum`} label="Maximum" required error={errors.maximum}>{(props) => <Input {...props} inputMode="decimal" maxLength={4000} disabled={disabled} value={text(value.maximum)} onChange={(event) => set("maximum", event.target.value || undefined)} />}</Field>
        <Field id={`${prefix}-unit`} label="Unit" required error={errors.unit}>{(props) => <Input {...props} maxLength={240} disabled={disabled} placeholder="e.g. mm" value={text(value.unit)} onChange={(event) => set("unit", event.target.value || undefined)} />}</Field>
      </div>
    </fieldset> : null}
    {detailed ? <fieldset className="knowledge-quality-control-group">
      <legend>Inspection controls</legend>
      <div className="knowledge-quality-controls-grid">
        <Field id={`${prefix}-severity`} label="Severity" required error={errors.severity} hint={severity ? QUALITY_SEVERITY_OPTIONS.find(option => option.value === severity)?.meaning : "Critical blocks the check; Major needs correction before the next stage; Minor is an observation."}>
          {(props) => <Select {...props} disabled={disabled} value={severity ?? ""} onChange={(event) => set("severity", event.target.value || undefined)}>
            <option value="">Select severity</option>
            {!severity && text(value.severity) ? <option value="" disabled>Unsupported saved severity: {text(value.severity)}</option> : null}
            {QUALITY_SEVERITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>}
        </Field>
        <Field id={`${prefix}-frequency`} label="Frequency" required error={errors.sampling} hint={legacyFrequency ? "Choose an available frequency before saving this legacy check." : unresolvedFrequency ? qualityOptionsLoading?.frequency ? "Loading the saved frequency value…" : "The saved frequency value is unavailable. Choose another value before saving." : "Defines how often this check repeats."}>
          {(props) => <Select {...props} disabled={disabled} value={frequency ?? (legacyFrequency ? "__legacy__" : "")} onChange={(event) => {
            if (event.currentTarget.value === ADD_FREQUENCY_OPTION && onQuickAddQualityOption) {
              event.currentTarget.value = frequency ?? (legacyFrequency ? "__legacy__" : "");
              onQuickAddQualityOption("frequency", event.currentTarget);
              return;
            }
            set("sampling", qualitySamplingForFrequency(event.currentTarget.value as QualityFrequency | KnowledgeQualityControlOptionReference) ?? undefined);
          }}>
            <option value="">Select frequency</option>
            {legacyFrequency ? <option value="__legacy__" disabled>Legacy custom frequency</option> : null}
            {unresolvedFrequency ? <option value={frequency!} disabled>{qualityOptionsLoading?.frequency ? "Loading saved frequency…" : "Unavailable saved frequency"}</option> : null}
            {qualityControlSelectOptions("frequency", qualityOptions).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            {canCreateQualityOptions && !disabled && onQuickAddQualityOption ? <option value={ADD_FREQUENCY_OPTION}>＋ Add frequency…</option> : null}
          </Select>}
        </Field>
        <Field id={`${prefix}-responsibleRole`} label="Performed by" required error={errors.responsibleRole} hint={legacyPerformer && !performer ? `Legacy responsible role: ${legacyPerformer}. Choose an available value before saving.` : unresolvedPerformer ? qualityOptionsLoading?.performer ? "Loading the saved performed-by value…" : "The saved performed-by value is unavailable. Choose another value before saving." : "Role family responsible for performing or recording the check."}>
          {(props) => <Select {...props} disabled={disabled} value={performer ?? (legacyPerformer ? "__legacy__" : "")} onChange={(event) => {
            if (event.currentTarget.value === ADD_PERFORMER_OPTION && onQuickAddQualityOption) {
              event.currentTarget.value = performer ?? (legacyPerformer ? "__legacy__" : "");
              onQuickAddQualityOption("performer", event.currentTarget);
              return;
            }
            set("responsibleRole", event.currentTarget.value || undefined);
          }}>
            <option value="">Select role</option>
            {legacyPerformer && !performer ? <option value="__legacy__" disabled>Legacy responsible role: {legacyPerformer}</option> : null}
            {unresolvedPerformer ? <option value={performer!} disabled>{qualityOptionsLoading?.performer ? "Loading saved performed-by value…" : "Unavailable saved performed-by value"}</option> : null}
            {qualityControlSelectOptions("performer", qualityOptions).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            {canCreateQualityOptions && !disabled && onQuickAddQualityOption ? <option value={ADD_PERFORMER_OPTION}>＋ Add performed by…</option> : null}
          </Select>}
        </Field>
      </div>
      {severity === "critical" ? <p className="knowledge-quality-policy"><strong>Critical policy:</strong> blocking; PM sign-off is required when operational inspections are introduced.</p> : null}
    </fieldset> : null}
    <KnowledgeQualityInspectionFields prefix={prefix} value={value} disabled={disabled} qualityOptions={qualityOptions} onChange={onChange} />
    {detailed ? <Field id={`${prefix}-evidence-instructions`} label="Evidence instructions" error={errors["evidence.instructions"]} hint="Describe what the evidence should show.">{(props) => <Textarea {...props} rows={2} maxLength={4000} disabled={disabled} value={text(evidence.instructions)} onChange={(event) => set("evidence", { photos: false, documents: false, video: false, ...evidence, instructions: event.target.value || null })} />}</Field> : null}
  </div>;
}

// Keep the user's trailing comma/space while the canonical payload stores trimmed options.
function AllowedValuesInput({ id, values, disabled, onChange }: { readonly id: string; readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void }) {
  const [typed, setTyped] = useState(() => values.join(", "));
  const ownValues = useRef(values);
  useEffect(() => {
    if (ownValues.current.length === values.length && ownValues.current.every((value, index) => value === values[index])) return;
    ownValues.current = values;
    setTyped(values.join(", "));
  }, [values]);
  return <Field id={id} label="Options" hint="Separate each option with a comma.">{(props) => <Input {...props} value={typed} disabled={disabled} onChange={(event) => {
    setTyped(event.target.value);
    const parsed = event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean);
    ownValues.current = parsed;
    onChange(parsed);
  }} />}</Field>;
}
