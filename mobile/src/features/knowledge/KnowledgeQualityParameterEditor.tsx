import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { QUALITY_PARAMETER_TYPES, QUALITY_CHECK_METHODS, QUALITY_SEVERITY_OPTIONS, qualityControlSelectOptions, qualityFrequencySelectionFromSampling, qualitySamplingForFrequency, type QualityControlOptionCatalog, type QualityFrequency } from "../../../../shared/knowledge/knowledgeQuality";
import { QUALITY_TYPE_LABELS, QUALITY_METHOD_LABELS } from "../../../../shared/knowledge/knowledgeQualityPresentation";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeQualityControlOptionKind, KnowledgeQualityControlOptionReference } from "../../../../shared/knowledge/knowledgeTypes";
import { Field, Button } from "./knowledgeDetailUi";
import { KnowledgeChoice, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeDetailUi";
import { knowledgeText as text, knowledgeObject as object } from "./knowledgeNativeRules";

export function KnowledgeQualityParameterEditor({ value, disabled, options, onChange, onCreateOption }: {
  readonly value: KnowledgeJsonObject; readonly disabled: boolean; readonly options: QualityControlOptionCatalog;
  readonly onChange: (value: KnowledgeJsonObject) => void;
  readonly onCreateOption?: (kind: KnowledgeQualityControlOptionKind) => void;
}) {
  const set = (key: string, next: KnowledgeJsonValue | undefined) => {
    const copy: Record<string, KnowledgeJsonValue> = { ...value };
    if (next === undefined) delete copy[key]; else copy[key] = next;
    onChange(copy);
  };
  const type = text(value.type);
  const choice = ["dropdown", "radio", "multi_select"].includes(type);
  const allowed = Array.isArray(value.allowedValues) ? value.allowedValues.filter((entry): entry is string => typeof entry === "string") : [];
  const evidence = object(value.evidence);
  const field = (key: string, label: string, multiline = false, numeric = false) => <Field label={label} value={text(value[key])} editable={!disabled} multiline={multiline} maxLength={multiline ? 4000 : 240} keyboardType={numeric ? "decimal-pad" : "default"} onChangeText={next => set(key, next || undefined)} />;
  return <View style={s.stack}>
    {field("label", "Question / check", true)}{field("instructions", "Instructions", true)}{field("stage", "Stage")}
    <KnowledgeSelect label="Answer type" value={type} options={QUALITY_PARAMETER_TYPES.map(type => ({ value: type, label: QUALITY_TYPE_LABELS[type] ?? type }))} disabled={disabled} allowEmpty={false} onChange={type => {
      const next: Record<string, KnowledgeJsonValue> = { ...value, type, defaultValue: null };
      if (!["dropdown", "radio", "multi_select"].includes(type)) delete next.allowedValues;
      if (type !== "number") { delete next.minimum; delete next.maximum; delete next.unit; }
      onChange(next);
    }} />
    {choice ? <QualityOptions values={allowed} disabled={disabled} onChange={allowedValues => { const next: Record<string, KnowledgeJsonValue> = { ...value, allowedValues }; if (Array.isArray(next.defaultValue)) next.defaultValue = next.defaultValue.filter(entry => typeof entry === "string" && allowedValues.includes(entry)); else if (typeof next.defaultValue === "string" && !allowedValues.includes(next.defaultValue)) next.defaultValue = null; onChange(next); }} /> : null}
    {type === "number" ? <>{field("minimum", "Minimum", false, true)}{field("maximum", "Maximum", false, true)}{field("unit", "Unit")}<KnowledgeText>Minimum and maximum are inclusive. Both and a unit are required.</KnowledgeText></> : null}
    <KnowledgeSelect label="Check method" value={text(value.checkMethod)} options={QUALITY_CHECK_METHODS.map(value => ({ value, label: QUALITY_METHOD_LABELS[value] ?? value }))} disabled={disabled} onChange={next => set("checkMethod", next || null)} />
    <KnowledgeSelect label="Severity" value={text(value.severity)} options={QUALITY_SEVERITY_OPTIONS} disabled={disabled} onChange={next => set("severity", next || undefined)} />
    {value.severity ? <KnowledgeText>{QUALITY_SEVERITY_OPTIONS.find(option => option.value === value.severity)?.meaning ?? "Unavailable saved severity"}</KnowledgeText> : null}
    <KnowledgeSelect label="Frequency" value={qualityFrequencySelectionFromSampling(value.sampling) ?? (value.sampling ? "__legacy__" : "")} options={qualityControlSelectOptions("frequency", options)} disabled={disabled} onChange={next => set("sampling", qualitySamplingForFrequency(next as QualityFrequency | KnowledgeQualityControlOptionReference) ?? undefined)} />
    {value.sampling && !qualityFrequencySelectionFromSampling(value.sampling) ? <KnowledgeText>Legacy sampling is preserved. Choose an available frequency before saving.</KnowledgeText> : null}
    {onCreateOption ? <Button label="Add frequency" variant="secondary" disabled={disabled} onPress={() => onCreateOption("frequency")} /> : null}
    <KnowledgeSelect label="Performed by" value={text(value.responsibleRole)} options={qualityControlSelectOptions("performer", options)} disabled={disabled} onChange={next => set("responsibleRole", next || undefined)} />
    {onCreateOption ? <Button label="Add performed by" variant="secondary" disabled={disabled} onPress={() => onCreateOption("performer")} /> : null}
    {field("acceptanceCriteria", "Acceptance criteria", true)}{field("failureAction", "Failure action", true)}
    {(["photos", "documents", "video"] as const).map(key => <KnowledgeChoice key={key} label={`${key === "photos" ? "Photo" : key === "documents" ? "Document" : "Video"} evidence`} multiple disabled={disabled} selected={evidence[key] === true} onPress={() => set("evidence", { photos: false, documents: false, video: false, ...evidence, [key]: evidence[key] !== true, ...(key === "photos" ? { minPhotosPerSample: evidence.photos === true ? null : 1 } : {}) })} />)}
    {evidence.photos === true ? <Field label="Required photos" value={typeof evidence.minPhotosPerSample === "number" ? String(evidence.minPhotosPerSample) : ""} editable={!disabled} keyboardType="number-pad" onChangeText={next => set("evidence", { ...evidence, minPhotosPerSample: next.trim() && /^\d+$/u.test(next) ? Number(next) : null })} /> : null}
    <Field label="Evidence instructions" value={text(evidence.instructions)} editable={!disabled} multiline maxLength={4000} onChangeText={instructions => set("evidence", { photos: false, documents: false, video: false, ...evidence, instructions: instructions || null })} />
    {type === "boolean" || type === "checkbox" ? <KnowledgeSelect label="Default answer" value={typeof value.defaultValue === "boolean" ? String(value.defaultValue) : ""} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} disabled={disabled} onChange={next => set("defaultValue", next ? next === "true" : null)} /> : type === "dropdown" || type === "radio" ? <KnowledgeSelect label="Default answer" value={text(value.defaultValue)} options={allowed.map(value => ({ value, label: value }))} disabled={disabled} onChange={next => set("defaultValue", next || null)} /> : type === "multi_select" ? <><KnowledgeText>Default answers</KnowledgeText>{allowed.map(option => <KnowledgeChoice key={option} label={`Default: ${option}`} multiple selected={Array.isArray(value.defaultValue) && value.defaultValue.includes(option)} disabled={disabled} onPress={() => { const selected = Array.isArray(value.defaultValue) ? value.defaultValue : []; set("defaultValue", selected.includes(option) ? selected.filter(entry => entry !== option) : [...selected, option]); }} />)}</> : field("defaultValue", "Default answer", type === "text", type === "number")}
  </View>;
}

function QualityOptions({ values, disabled, onChange }: { readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void }) {
  const [typed, setTyped] = useState(values.join(", "));
  const own = useRef(values.join("\u0000"));
  useEffect(() => { const key = values.join("\u0000"); if (key !== own.current) { own.current = key; setTyped(values.join(", ")); } }, [values]);
  return <Field label="Options (comma separated)" editable={!disabled} value={typed} onChangeText={next => { setTyped(next); const parsed = next.split(",").map(value => value.trim()).filter(Boolean); own.current = parsed.join("\u0000"); onChange(parsed); }} />;
}
