import { describe, expect, it } from "vitest";
import { questionVisible, validateVendorInductionAnswers, validateVendorInductionQuestions } from "../src/domain/vendor-induction.js";
import type { VendorInductionQuestion } from "../src/contracts/vendor-induction.js";

const yesNo: VendorInductionQuestion = { id: "safety", key: "safety", section: "Site safety", prompt: "Do you subcontract site work?",
  helpText: null, type: "yes_no", required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: null };
const detail: VendorInductionQuestion = { id: "subcontractors", key: "subcontractors", section: "Site safety", prompt: "Describe your subcontractor controls",
  helpText: null, type: "paragraph", required: true, enabled: true, options: [], unit: null, min: null, max: null,
  showIf: { questionId: "safety", optionIds: ["yes"] } };

describe("vendor induction questionnaire invariants", () => {
  it("requires a previous enabled conditional source and rejects duplicate/error keys", () => {
    expect(validateVendorInductionQuestions([yesNo, detail], true)).toHaveLength(2);
    expect(() => validateVendorInductionQuestions([{ ...yesNo, enabled: false }, detail].filter(q => q.enabled), true)).toThrow();
    expect(() => validateVendorInductionQuestions([detail, yesNo], true)).toThrow();
    expect(() => validateVendorInductionQuestions([yesNo, { ...detail, key: "safety" }])).toThrow();
    expect(() => validateVendorInductionQuestions([{ ...yesNo, key: "#REF!" }])).toThrow();
  });
  it("validates only visible required answers and omits hidden answers", () => {
    expect(questionVisible(detail, new Map([["safety", false]]))).toBe(false);
    expect(validateVendorInductionAnswers([yesNo, detail], [{ questionId: "safety", value: false }])).toEqual([{ questionId: "safety", value: false }]);
    expect(() => validateVendorInductionAnswers([yesNo, detail], [{ questionId: "safety", value: true }])).toThrow();
    expect(() => validateVendorInductionAnswers([yesNo, detail], [{ questionId: "safety", value: false }, { questionId: "subcontractors", value: "hidden" }])).toThrow();
    expect(validateVendorInductionAnswers([yesNo, detail], [{ questionId: "safety", value: true }, { questionId: "subcontractors", value: " Staff process " }]))
      .toEqual([{ questionId: "safety", value: true }, { questionId: "subcontractors", value: "Staff process" }]);
  });
  it("bounds number and choice answers to the immutable question definition", () => {
    const number: VendorInductionQuestion = { ...yesNo, id: "crew", key: "crew", type: "number", prompt: "How many trained crew members?",
      unit: "people", min: 1, max: 200 };
    const choice: VendorInductionQuestion = { ...yesNo, id: "lead_time", key: "lead_time", type: "single_choice",
      options: [{ id: "fast", label: "Under a week" }, { id: "standard", label: "1-2 weeks" }] };
    expect(() => validateVendorInductionAnswers([number, choice], [{ questionId: "crew", value: 0 }, { questionId: "lead_time", value: "fast" }])).toThrow();
    expect(() => validateVendorInductionAnswers([number, choice], [{ questionId: "crew", value: 12 }, { questionId: "lead_time", value: "other" }])).toThrow();
    expect(validateVendorInductionAnswers([number, choice], [{ questionId: "crew", value: 12 }, { questionId: "lead_time", value: "fast" }])).toHaveLength(2);
  });
});
