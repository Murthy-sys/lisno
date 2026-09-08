import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export const QUALITY_PARAMETER_TYPES = ["text", "number", "dropdown", "radio", "checkbox", "multi_select", "boolean"] as const;
export const QUALITY_CHECK_METHODS = ["visual", "measurement", "functional_test", "document_review"] as const;
export const QUALITY_SEVERITIES = ["critical", "major", "minor"] as const;
export const QUALITY_SAMPLING_METHODS = ["all", "percentage", "fixed_count"] as const;
export const QUALITY_MAX_PARAMETERS = 200;
export const QUALITY_MAX_PAYLOAD_BYTES = 256 * 1024;

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;
const ROW_KEYS = ["id", "type", "label", "unit", "allowedValues", "minimum", "maximum", "defaultValue", "required", "category", "active", "instructions", "acceptanceCriteria", "stage", "checkMethod", "severity", "responsibleRole", "failureAction", "sampling", "evidence"];
const object = (value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));
const normalize = (value: KnowledgeJsonValue | undefined) => typeof value === "string" ? value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en") : "";

export function createQualityParameter(): KnowledgeJsonObject {
  return { id: crypto.randomUUID(), type: "text", label: "", required: true, active: true };
}

/** Compatibility flags are fixed for current checklists; never mutate a saved snapshot. */
export function mandatoryQualityParameters(rows: readonly KnowledgeJsonObject[]): KnowledgeJsonObject[] {
  return rows.map(row => ({ ...row, required: true, active: true }));
}

export function validateQualityParameters(value: KnowledgeJsonValue | undefined): readonly KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  const issue = (path: string, message: string) => { issues.push({ path, message }); };
  if (value === undefined) return issues;
  if (!Array.isArray(value)) return [{ path: "parameters", message: "Quality parameters must be a list." }];
  if (value.length > QUALITY_MAX_PARAMETERS) issue("parameters", "Use at most 200 quality parameters per Main Basket.");
  if (new TextEncoder().encode(JSON.stringify({ parameters: value })).byteLength > QUALITY_MAX_PAYLOAD_BYTES) issue("parameters", "The checklist exceeds 256 KiB. Shorten the questions or instructions.");
  const ids = new Set<string>();
  const text = (value: KnowledgeJsonValue | undefined, path: string, max = 240, nullable = true) => {
    if (nullable && (value === undefined || value === null)) return;
    if (typeof value !== "string" || !value.trim() || value.length > max) issue(path, `Enter nonempty text up to ${max} characters.`);
  };
  const exact = (row: KnowledgeJsonObject, allowed: readonly string[], path: string) => {
    for (const key of Object.keys(row)) if (!allowed.includes(key)) issue(`${path}.${key}`, `Unknown field: ${key}.`);
  };
  const enumValue = (value: KnowledgeJsonValue | undefined, options: readonly string[], path: string, nullable = false) => {
    if (nullable && (value === undefined || value === null)) return;
    if (typeof value !== "string" || !options.includes(value)) issue(path, `Choose one of: ${options.join(", ")}.`);
  };
  const decimal = (value: KnowledgeJsonValue | undefined, path: string) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > 4000 || !DECIMAL.test(value)) {
      issue(path, "Use a non-negative decimal with up to six decimal places, without commas or leading zeros.");
      return null;
    }
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  };
  value.forEach((value, index) => {
    const path = `parameters.${index}`;
    if (!object(value)) { issue(path, "Each quality parameter must be an object."); return; }
    const row = value;
    exact(row, ROW_KEYS, path);
    if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > 240) issue(`${path}.id`, "A bounded stable identifier is required.");
    else if (ids.has(row.id)) issue(`${path}.id`, "Each quality parameter needs a unique identifier.");
    else ids.add(row.id);
    text(row.label, `${path}.label`, 240, false);
    enumValue(row.type, QUALITY_PARAMETER_TYPES, `${path}.type`);
    for (const key of ["unit", "category", "stage", "responsibleRole"]) text(row[key], `${path}.${key}`);
    for (const key of ["instructions", "acceptanceCriteria", "failureAction"]) text(row[key], `${path}.${key}`, 4000);
    for (const key of ["required", "active"]) if (key in row && typeof row[key] !== "boolean") issue(`${path}.${key}`, "Use true or false.");
    enumValue(row.checkMethod, QUALITY_CHECK_METHODS, `${path}.checkMethod`, true);
    enumValue(row.severity, QUALITY_SEVERITIES, `${path}.severity`, true);
    let options: readonly KnowledgeJsonValue[] = [];
    if (row.allowedValues !== undefined) {
      if (!Array.isArray(row.allowedValues)) issue(`${path}.allowedValues`, "Options must be a list of text values.");
      else {
        options = row.allowedValues;
        if (options.length > 200) issue(`${path}.allowedValues`, "Use at most 200 options.");
        const seen = new Set<string>();
        options.forEach((option, i) => {
          text(option, `${path}.allowedValues.${i}`, 240, false);
          if (typeof option === "string") {
            if (seen.has(option)) issue(`${path}.allowedValues.${i}`, "Each option must be unique.");
            seen.add(option);
          }
        });
      }
    }
    const choice = ["dropdown", "radio", "multi_select"].includes(String(row.type));
    if (choice && options.length === 0) issue(`${path}.allowedValues`, "Add at least one allowed option.");
    if (!choice && options.length) issue(`${path}.allowedValues`, "Options apply only to dropdown, radio or multi-select answers.");
    const minimum = decimal(row.minimum, `${path}.minimum`);
    const maximum = decimal(row.maximum, `${path}.maximum`);
    if (row.type !== "number" && [row.minimum, row.maximum, row.unit].some(v => v !== undefined && v !== null)) issue(`${path}.minimum`, "Bounds and units apply only to number answers.");
    if (minimum !== null && maximum !== null && minimum > maximum) issue(`${path}.maximum`, "Maximum cannot be less than minimum.");
    if (row.defaultValue !== undefined && row.defaultValue !== null) {
      const p = `${path}.defaultValue`;
      if (row.type === "text") {
        if (typeof row.defaultValue !== "string") issue(p, "Text defaults must be text.");
        else if (row.defaultValue.length > 4000) issue(p, "Default text must be at most 4000 characters.");
      } else if (row.type === "number") {
        const answer = decimal(row.defaultValue, p);
        if (answer !== null && ((minimum !== null && answer < minimum) || (maximum !== null && answer > maximum))) issue(p, "Default answer must be within the configured bounds.");
      } else if (row.type === "dropdown" || row.type === "radio") {
        if (typeof row.defaultValue !== "string" || !options.includes(row.defaultValue)) issue(p, "Default answer must match an allowed option.");
      } else if (row.type === "multi_select") {
        if (!Array.isArray(row.defaultValue) || row.defaultValue.some(v => typeof v !== "string" || !options.includes(v))) issue(p, "Default answers must match allowed options.");
        else if (row.defaultValue.length > 200) issue(p, "Use at most 200 default selections.");
      } else if ((row.type === "boolean" || row.type === "checkbox") && typeof row.defaultValue !== "boolean") issue(p, "Default answer must be true or false.");
    }
    if (row.sampling !== undefined && row.sampling !== null) {
      const p = `${path}.sampling`;
      if (!object(row.sampling)) issue(p, "Sampling must be an object.");
      else {
        const sample = row.sampling;
        exact(sample, ["method", "value", "unit"], p);
        enumValue(sample.method, QUALITY_SAMPLING_METHODS, `${p}.method`);
        text(sample.unit, `${p}.unit`, 240, false);
        if (sample.method === "percentage" && (typeof sample.value !== "number" || !Number.isFinite(sample.value) || sample.value <= 0 || sample.value > 100)) issue(`${p}.value`, "Sample percentage must be greater than 0 and at most 100.");
        if (sample.method === "fixed_count" && (typeof sample.value !== "number" || !Number.isSafeInteger(sample.value) || sample.value < 1 || sample.value > 1_000_000)) issue(`${p}.value`, "Sample count must be a whole number from 1 to 1,000,000.");
        if (sample.method === "all" && sample.value !== undefined && sample.value !== null) issue(`${p}.value`, "All units does not use a sample value.");
      }
    }
    if (row.evidence !== undefined && row.evidence !== null) {
      const p = `${path}.evidence`;
      if (!object(row.evidence)) issue(p, "Evidence must be an object.");
      else {
        const evidence = row.evidence;
        exact(evidence, ["photos", "documents", "video", "minPhotosPerSample", "instructions"], p);
        for (const key of ["photos", "documents", "video"]) if (typeof evidence[key] !== "boolean") issue(`${p}.${key}`, "Use true or false.");
        if (evidence.photos === true && (typeof evidence.minPhotosPerSample !== "number" || !Number.isSafeInteger(evidence.minPhotosPerSample) || evidence.minPhotosPerSample < 1 || evidence.minPhotosPerSample > 100)) issue(`${p}.minPhotosPerSample`, "Enter 1 to 100 photos per sampled unit.");
        if (evidence.photos !== true && evidence.minPhotosPerSample !== undefined && evidence.minPhotosPerSample !== null) issue(`${p}.minPhotosPerSample`, "Photo count requires photo evidence.");
        text(evidence.instructions, `${p}.instructions`, 4000);
      }
    }
  });
  return issues;
}

export function qualityImportIssues(existing: readonly KnowledgeJsonObject[], incoming: readonly KnowledgeJsonObject[]): readonly KnowledgeValidationIssue[] {
  const rows = [...existing, ...incoming];
  // Import appends to an editable draft. Existing row errors belong to the editor/save
  // boundary; keep incoming row errors and combined limits/ID checks blocking here.
  const issues = validateQualityParameters(rows).filter(issue => {
    const row = /^parameters\.(\d+)(?:\.|$)/u.exec(issue.path);
    return !row || Number(row[1]) >= existing.length;
  });
  const questions = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${normalize(row.label)}\u0000${normalize(row.stage)}`;
    if (normalize(row.label) && questions.has(key) && index >= existing.length) issues.push({ path: `parameters.${index}.label`, message: `“${typeof row.label === "string" ? row.label.trim() : "This question"}” already exists for the same stage. Remove the duplicate before importing.` });
    questions.add(key);
  });
  return issues;
}

export function qualitySamplingSummary(row: KnowledgeJsonObject): string {
  if (!object(row.sampling)) return "Sampling not specified";
  const { method, value, unit } = row.sampling;
  const units = typeof unit === "string" && unit.trim() ? unit.trim() : "units";
  if (method === "all") return `Inspect all ${units}.`;
  if (method === "percentage" && typeof value === "number") return `Inspect ${value}% of ${units}, rounded up to the next whole unit.`;
  if (method === "fixed_count" && typeof value === "number") return `Inspect ${value} ${units}.`;
  return "Sampling not specified";
}
