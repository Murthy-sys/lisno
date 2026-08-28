import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_SECTION_LABELS,
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatKnowledgePercentage
} from "./knowledgePresentation";

describe("knowledge presentation", () => {
  it("uses the exact closed section vocabulary", () => {
    expect(KNOWLEDGE_SECTION_LABELS["quantity-margin"]).toBe(
      "Quantity & margin"
    );
    expect(Object.keys(KNOWLEDGE_SECTION_LABELS)).toHaveLength(8);
  });

  it("formats paise and basis points only at the presentation boundary", () => {
    expect(formatKnowledgeMoney(7_500)).toMatch(/₹\s?75\.00/u);
    expect(formatKnowledgePercentage(500)).toBe("5.00%");
  });

  it("does not manufacture a date when the API value is invalid", () => {
    expect(formatKnowledgeDateTime("not-a-date")).toBe("Unavailable");
  });
});
