import { describe, expect, it } from "vitest";
import { formatProjectNumber, parseProjectNumber, readProjectNumber } from "../src/domain/project-number.js";

describe("project number format", () => {
  it.each([[1, "Lisno000001"], [2, "Lisno000002"], [999999, "Lisno999999"], [1000000, "Lisno1000000"],
    [Number.MAX_SAFE_INTEGER, "Lisno9007199254740991"]] as const)("formats %s without truncating", (value, text) => {
    expect(formatProjectNumber(value)).toBe(text);
    expect(parseProjectNumber(text)).toBe(value);
    expect(readProjectNumber(text)).toBe(text);
  });
  it.each([undefined, null])("normalizes absent %s", (value) => {
    expect(parseProjectNumber(value)).toBeNull();
    expect(readProjectNumber(value)).toBeNull();
  });
  it.each(["", "Lisno000000", "Lisno1", "Lisno0000001", "lisno000001", "Lisno10000000 ", "Lisno9007199254740992", "🌏🌏000001", 1])("rejects malformed %s", (value) => {
    expect(() => parseProjectNumber(value)).toThrow(expect.objectContaining({ code: "PROJECT_NUMBER_STATE_CONFLICT" }));
  });
  it.each([0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid counter %s", (value) => {
    expect(() => formatProjectNumber(value)).toThrow();
  });
});
