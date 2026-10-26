import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as backend from "../src/domain/estimate-dimensions.js";
import * as shared from "../../shared/estimation/estimateDimensions.js";

const uom = { id: "area-uom", code: "SQFT", name: "Square foot", decimalScale: 2 };
const rule = backend.resolveEstimateDimensionRule(uom)!;
const dimensions = { length: "2.50", width: "3.002", height: "99.000" };

describe("configured estimate dimensions", () => {
  it("keeps backend and client calculation implementations byte-identical", () => {
    expect(readFileSync(new URL("../src/domain/estimate-dimensions.ts", import.meta.url), "utf8"))
      .toBe(readFileSync(new URL("../../shared/estimation/estimateDimensions.ts", import.meta.url), "utf8"));
    expect(shared.calculateDimensionQuantity(rule, dimensions)).toEqual(backend.calculateDimensionQuantity(rule, dimensions));
  });
  it.each([
    ["SQ-FT", "Square feet", "ft", "sq_ft"], ["M²", "square metres", "m", "sq_m"],
    ["sq_cm", "Square centimeters", "cm", "sq_cm"], ["mm2", "square millimetres", "mm", "sq_mm"],
    ["SQ.IN.", "square inches", "in", "sq_in"], ["YD²", "square yards", "yd", "sq_yd"]
  ])("resolves explicit area aliases %s / %s", (code, name, inputUnit, quantityUnit) => {
    expect(backend.resolveEstimateDimensionRule({ ...uom, code, name })).toEqual({ ...rule, inputUnit, quantityUnit });
  });
  it("accepts one recognized area alias without guessing unknown or conflicting units", () => {
    expect(backend.resolveEstimateDimensionRule({ ...uom, code: "CUSTOM" })).toEqual(rule);
    for (const pair of [["SQFT", "Square metre"], ["SQFT", "Each"], ["RFT", "Square foot"], ["NOS", "Each"], ["M3", "Cubic metre"], ["custom", "area by drawing"]]) {
      expect(backend.resolveEstimateDimensionRule({ ...uom, code: pair[0], name: pair[1] })).toBeNull();
    }
    expect(backend.resolveEstimateDimensionRule({ ...uom, decimalScale: 4 })).toBeNull();
  });
  it("multiplies only Length and Width, rounds once half-up, and canonicalizes all measurements", () => {
    expect(backend.calculateDimensionQuantity(rule, dimensions)).toEqual({ dimensions: { length: "2.5", width: "3.002", height: "99" }, quantity: 7.51, quantityUnits: 751 });
    expect(backend.calculateDimensionQuantity(rule, { ...dimensions, height: "0.000001" })?.quantity).toBe(7.51);
    expect(backend.calculateDimensionQuantity({ ...rule, decimalScale: 0 }, { length: "1", width: "2.5", height: "8" })?.quantity).toBe(3);
    expect(backend.calculateDimensionQuantity({ ...rule, decimalScale: 3 }, { length: "0.100001", width: "0.500005", height: "1" })?.quantity).toBe(0.05);
  });
  it.each([null, {}, { length: "1", width: "2" }, { length: "1", width: "2", height: "0" }, { ...dimensions, length: "-1" },
    { ...dimensions, length: "1e3" }, { ...dimensions, length: 1 }, { ...dimensions, width: "0.1234567" },
    { ...dimensions, length: "9007199254.740992" }, { ...dimensions, extra: "1" }])("rejects invalid or incomplete measurements %#", value => {
    expect(backend.canonicalEstimateDimensions(value)).toBeNull();
    expect(backend.calculateDimensionQuantity(rule, value)).toBeNull();
  });
  it("rejects rounded zero, unsafe quantities and non-area or forged rules", () => {
    expect(backend.calculateDimensionQuantity(rule, { length: "0.000001", width: "0.000001", height: "1" })).toBeNull();
    expect(backend.calculateDimensionQuantity(rule, { length: "9007199254", width: "9007199254", height: "1" })).toBeNull();
    expect(backend.calculateDimensionQuantity({ ...rule, quantityUnit: "sq_m" }, dimensions)).toBeNull();
    expect(backend.calculateDimensionQuantity({ ...rule, formula: "length_width_height" }, dimensions)).toBeNull();
  });
  it("validates the frozen active rule and quantity while leaving inactive history independent", () => {
    const line = { dimensionsMandatory: true, dimensionRule: rule, dimensions, quantity: 7.51, uomId: "area-uom", uomDecimalScale: 2 };
    expect(backend.estimateLineDimensionsValid(line)).toBe(true);
    expect(backend.estimateLineDimensionsValid({ ...line, quantity: 750.99 })).toBe(false);
    expect(backend.estimateLineDimensionsValid({ ...line, uomId: "changed" })).toBe(false);
    expect(backend.estimateLineDimensionsValid({ ...line, uomDecimalScale: 3 })).toBe(false);
    expect(backend.estimateLineDimensionsValid({ ...line, dimensionsMandatory: false, dimensionRule: null, quantity: 42 })).toBe(true);
    expect(backend.estimateLineDimensionsValid({ quantity: 3 })).toBe(true);
    expect(backend.estimateDimensionRulesEqual(null, undefined)).toBe(true);
    expect(backend.estimateDimensionRulesEqual(rule, { ...rule })).toBe(true);
    expect(backend.estimateDimensionRulesEqual(rule, { ...rule, decimalScale: 1 })).toBe(false);
  });
});
