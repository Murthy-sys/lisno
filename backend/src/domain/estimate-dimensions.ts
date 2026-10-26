export const ESTIMATE_DIMENSION_INPUT_UNITS = ["ft", "m", "cm", "mm", "in", "yd"] as const;
export const ESTIMATE_DIMENSION_QUANTITY_UNITS = ["sq_ft", "sq_m", "sq_cm", "sq_mm", "sq_in", "sq_yd"] as const;
export interface EstimateDimensions { length: string; width: string; height: string }
export interface EstimateDimensionRule {
  formula: "length_width";
  inputUnit: typeof ESTIMATE_DIMENSION_INPUT_UNITS[number];
  quantityUnit: typeof ESTIMATE_DIMENSION_QUANTITY_UNITS[number];
  uomId: string;
  decimalScale: number;
}
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const INPUT_SCALE = 1_000_000n;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const aliases: readonly (readonly string[])[] = [
  ["sqft", "sqfeet", "sqfoot", "squarefoot", "squarefeet", "ft2", "feet2", "foot2", "sft", "sf"],
  ["sqm", "sqmeter", "sqmeters", "sqmetre", "sqmetres", "squaremeter", "squaremeters", "squaremetre", "squaremetres", "m2"],
  ["sqcm", "sqcentimeter", "sqcentimeters", "sqcentimetre", "sqcentimetres", "squarecentimeter", "squarecentimeters", "squarecentimetre", "squarecentimetres", "cm2"],
  ["sqmm", "sqmillimeter", "sqmillimeters", "sqmillimetre", "sqmillimetres", "squaremillimeter", "squaremillimeters", "squaremillimetre", "squaremillimetres", "mm2"],
  ["sqin", "sqinch", "sqinches", "squareinch", "squareinches", "in2", "inch2", "inches2"],
  ["sqyd", "sqyard", "sqyards", "squareyard", "squareyards", "yd2", "yard2", "yards2"]
];
const nonArea = new Set(["ft", "feet", "foot", "rft", "runningfeet", "runningfoot", "m", "meter", "meters", "metre", "metres", "cm", "mm", "in", "inch", "inches", "yd", "yard", "yards", "nos", "no", "number", "numbers", "ea", "each", "unit", "units", "piece", "pieces", "pcs", "point", "points", "pt", "pts", "kg", "kilogram", "litre", "liter", "l", "cft", "cuft", "cubicfeet", "cubicfoot", "ft3", "cum", "cubicmeter", "cubicmetre", "m3"]);
const normalizedAlias = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").toLowerCase().trim().replace(/[\s._-]+/gu, "") : "";

/** A closed alias table, never a guess based on a substring or a conversion. */
export function resolveEstimateDimensionRule(uom: { id?: unknown; _id?: unknown; code?: unknown; name?: unknown; decimalScale?: unknown }): EstimateDimensionRule | null {
  const id = uom.id ?? uom._id;
  if (typeof id !== "string" || !id.trim() || id !== id.trim() || !Number.isSafeInteger(uom.decimalScale) || Number(uom.decimalScale) < 0 || Number(uom.decimalScale) > 3) return null;
  const code = normalizedAlias(uom.code), name = normalizedAlias(uom.name);
  if (nonArea.has(code) || nonArea.has(name)) return null;
  const codeIndex = aliases.findIndex(list => list.includes(code));
  const nameIndex = aliases.findIndex(list => list.includes(name));
  if (codeIndex >= 0 && nameIndex >= 0 && codeIndex !== nameIndex) return null;
  const index = codeIndex >= 0 ? codeIndex : nameIndex;
  return index < 0 ? null : { formula: "length_width", inputUnit: ESTIMATE_DIMENSION_INPUT_UNITS[index]!, quantityUnit: ESTIMATE_DIMENSION_QUANTITY_UNITS[index]!, uomId: id, decimalScale: Number(uom.decimalScale) };
}

export function readEstimateDimensionRule(value: unknown): EstimateDimensionRule | null {
  const row = object(value);
  if (!row || Object.keys(row).some(key => !["formula", "inputUnit", "quantityUnit", "uomId", "decimalScale"].includes(key)) || row.formula !== "length_width" || typeof row.uomId !== "string" || !row.uomId.trim() || row.uomId !== row.uomId.trim() || !Number.isSafeInteger(row.decimalScale) || Number(row.decimalScale) < 0 || Number(row.decimalScale) > 3) return null;
  const index = ESTIMATE_DIMENSION_INPUT_UNITS.indexOf(row.inputUnit as EstimateDimensionRule["inputUnit"]);
  if (index < 0 || row.quantityUnit !== ESTIMATE_DIMENSION_QUANTITY_UNITS[index]) return null;
  return { formula: "length_width", inputUnit: ESTIMATE_DIMENSION_INPUT_UNITS[index]!, quantityUnit: ESTIMATE_DIMENSION_QUANTITY_UNITS[index]!, uomId: row.uomId, decimalScale: Number(row.decimalScale) };
}

function dimension(value: unknown): { text: string; units: bigint } | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/u.exec(value.trim());
  if (!match) return null;
  const units = BigInt(match[1]!) * INPUT_SCALE + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  if (units <= 0n || units > MAX_SAFE) return null;
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  return { text: `${match[1]}${fraction ? `.${fraction}` : ""}`, units };
}

/** Height is required and retained, but the quantity is always Length × Width. */
export function canonicalEstimateDimensions(value: unknown): EstimateDimensions | null {
  const row = object(value);
  if (!row || Object.keys(row).some(key => !["length", "width", "height"].includes(key))) return null;
  const length = dimension(row.length), width = dimension(row.width), height = dimension(row.height);
  return length && width && height ? { length: length.text, width: width.text, height: height.text } : null;
}

export function calculateDimensionQuantity(ruleValue: unknown, value: unknown): { dimensions: EstimateDimensions; quantity: number; quantityUnits: number } | null {
  const rule = readEstimateDimensionRule(ruleValue), dimensions = canonicalEstimateDimensions(value);
  if (!rule || !dimensions) return null;
  const divisor = INPUT_SCALE * INPUT_SCALE;
  const factor = 10n ** BigInt(rule.decimalScale);
  const units = (dimension(dimensions.length)!.units * dimension(dimensions.width)!.units * factor + divisor / 2n) / divisor;
  if (units <= 0n || units > MAX_SAFE) return null;
  const text = rule.decimalScale ? `${units / factor}.${(units % factor).toString().padStart(rule.decimalScale, "0")}` : units.toString();
  const quantity = Number(text);
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(String(quantity));
  if (!match || (match[2]?.length ?? 0) > rule.decimalScale || BigInt(match[1]!) * factor + BigInt((match[2] ?? "").padEnd(rule.decimalScale, "0") || "0") !== units) return null;
  return { dimensions, quantity, quantityUnits: Number(units) };
}

export function estimateDimensionRulesEqual(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  const a = readEstimateDimensionRule(left), b = readEstimateDimensionRule(right);
  return !!a && !!b && a.formula === b.formula && a.inputUnit === b.inputUnit && a.quantityUnit === b.quantityUnit && a.uomId === b.uomId && a.decimalScale === b.decimalScale;
}

/** Retained historical measurements do not own quantity after the requirement is disabled. */
export function estimateLineDimensionsValid(line: { dimensionsMandatory?: unknown; dimensionRule?: unknown; dimensions?: unknown; quantity?: unknown; uomId?: unknown; uomDecimalScale?: unknown }): boolean {
  if (line.dimensionsMandatory !== true) return true;
  const rule = readEstimateDimensionRule(line.dimensionRule);
  const calculated = calculateDimensionQuantity(rule, line.dimensions);
  return !!rule && !!calculated && calculated.quantity === line.quantity && rule.uomId === line.uomId && rule.decimalScale === line.uomDecimalScale;
}
