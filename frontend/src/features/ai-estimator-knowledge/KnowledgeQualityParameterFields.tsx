import { useEffect, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { KnowledgeQualityInspectionFields } from "./KnowledgeQualityInspectionFields";
import { QUALITY_STAGE_OPTIONS, QUALITY_TYPE_LABELS, QUALITY_METHOD_LABELS } from "./knowledgeQualityPresentation";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

const text = (value: KnowledgeJsonValue | undefined) => typeof value === "string" ? value : "";
const strings = (value: KnowledgeJsonValue | undefined): readonly string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/** Essential fields retain the existing section-editor behavior; the shared checklist opts into metadata. */
export function KnowledgeQualityParameterFields({ prefix, value, disabled, onChange, detailed = false, errors = {} }: {
  readonly prefix: string;
  readonly value: KnowledgeJsonObject;
  readonly disabled: boolean;
  readonly onChange: (value: KnowledgeJsonObject) => void;
  readonly detailed?: boolean;
  readonly errors?: Readonly<Record<string, string>>;
}) {
  const set = (key: string, next: KnowledgeJsonValue | undefined) => {
    const copy = { ...value } as Record<string, KnowledgeJsonValue>;
    if (next === undefined) delete copy[key]; else copy[key] = next;
    onChange(copy);
  };
  const type = text(value.type);
  const choice = ["dropdown", "radio", "multi_select"].includes(type);
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
    <KnowledgeQualityInspectionFields prefix={prefix} value={value} disabled={disabled} onChange={onChange} />
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
