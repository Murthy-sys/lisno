import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_SECTION_LABELS,
  KNOWLEDGE_WORKSPACE_SECTION_LABELS,
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatKnowledgePercentage,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise
} from "./knowledgePresentation";
import {
  KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS,
  KNOWLEDGE_WORKSPACE_SECTION_KEYS
} from "./knowledgeWorkspaceSections";

describe("knowledge presentation", () => {
  it("preserves the exact closed backend section vocabulary for editors", () => {
    expect(KNOWLEDGE_SECTION_LABELS["quantity-margin"]).toBe(
      "Quantity & margin"
    );
    expect(Object.keys(KNOWLEDGE_SECTION_LABELS)).toHaveLength(8);
  });

  it("uses the exact four-key workspace vocabulary without changing backend ownership", () => {
    expect(KNOWLEDGE_WORKSPACE_SECTION_KEYS).toEqual([
      "overview",
      "mode",
      "recommendations",
      "quality"
    ]);
    expect(KNOWLEDGE_WORKSPACE_SECTION_LABELS.mode).toBe("Mode");
    expect(Object.keys(KNOWLEDGE_WORKSPACE_SECTION_LABELS)).toHaveLength(4);
    expect(KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS.mode).toEqual([
      "advanced",
      "pricing",
      "quantity-margin"
    ]);
    expect(KNOWLEDGE_SECTION_LABELS.pricing).toBe("Pricing");
  });

  it("formats paise and basis points only at the presentation boundary", () => {
    expect(formatKnowledgeMoney(7_500)).toMatch(/₹\s?75\.00/u);
    expect(formatKnowledgePercentage(500)).toBe("5.00%");
  });

  it.each([
    [0, /₹\s?0\.00/u],
    [1, /₹\s?0\.01/u],
    [12_345_678, /₹\s?1,23,456\.78/u],
    [Number.MAX_SAFE_INTEGER, /₹\s?9,00,71,99,25,47,409\.91/u]
  ])("formats %i paise exactly in INR", (paise, expected) => {
    expect(formatKnowledgeMoney(paise)).toMatch(expected);
  });

  it("does not manufacture a date when the API value is invalid", () => {
    expect(formatKnowledgeDateTime("not-a-date")).toBe("Unavailable");
  });

  it.each([
    ["0", 0],
    ["0.01", 1],
    ["75", 7_500],
    ["75.5", 7_550],
    ["75.50", 7_550],
    ["11800.00", 1_180_000]
  ])("parses %s rupees as exactly %i paise", (rupees, paise) => {
    expect(parseRupeeInputToPaise(rupees)).toEqual({ status: "valid", paise });
  });

  it.each(["", ".", "0.", "75."])(
    "preserves the incomplete editing state %j",
    (value) => {
      expect(parseRupeeInputToPaise(value)).toEqual({ status: "incomplete" });
    }
  );

  it.each(["-1", "1e2", "1E2", "abc", "1.001", " 75", "75 ", ".50"])(
    "rejects malformed rupee input %j",
    (value) => {
      expect(parseRupeeInputToPaise(value)).toEqual({
        status: "invalid",
        reason: "format"
      });
    }
  );

  it("rejects paise above the safe integer boundary without rounding", () => {
    expect(parseRupeeInputToPaise("90071992547409.91")).toEqual({
      status: "valid",
      paise: Number.MAX_SAFE_INTEGER
    });
    expect(parseRupeeInputToPaise("90071992547409.92")).toEqual({
      status: "invalid",
      reason: "unsafe"
    });
  });

  it.each([
    [0, "0"],
    [1, "0.01"],
    [7_550, "75.50"],
    [11_800, "118.00"],
    [1_180_000, "11800.00"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"]
  ])("formats %i paise as canonical editable text %s", (paise, rupees) => {
    expect(formatPaiseForRupeeInput(paise)).toBe(rupees);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid paise value %s",
    (paise) => {
      expect(() => formatPaiseForRupeeInput(paise)).toThrow(RangeError);
    }
  );
});
