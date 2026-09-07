import { describe, expect, it } from "vitest";

import { createKnowledgeModeConfiguration } from "./knowledgeModeConfiguration";
import { generateModeDescription, syncModeDescription } from "./knowledgeModeDescription";
import { defaultPmcScopeItems } from "./knowledgePmcScope";

function scope(inclusions: string[] = [], exclusions: string[] = []) {
  return {
    ...createKnowledgeModeConfiguration("pmc"),
    inclusions: defaultPmcScopeItems("inclusions").map((item) => ({ ...item, selected: inclusions.includes(item.name) })),
    exclusions: defaultPmcScopeItems("exclusions").map((item) => ({ ...item, selected: exclusions.includes(item.name) }))
  };
}

describe("Mode paragraph checklist synchronization", () => {
  it("adds missing labels independently, even after all custom wording is deleted", () => {
    const pmc = scope(["Transport"], ["Transport", "Shifting"]);
    expect(syncModeDescription("", pmc)).toBe("Inclusions: Transport. Exclusions: Transport, Shifting.");
    expect(syncModeDescription("Custom work for TV Unit.", pmc))
      .toBe("Custom work for TV Unit. Inclusions: Transport. Exclusions: Transport, Shifting.");
    expect(syncModeDescription("Custom work", scope([], ["Shifting"])))
      .toBe("Custom work. Exclusions: Shifting.");
  });

  it.each([
    ["Custom work, inclusions and exclusions.", "Custom work, inclusions Transport and exclusions Shifting."],
    ["Inclusions Exclusions", "Inclusions Transport Exclusions Shifting"],
    ["Inclusions\nExclusions", "Inclusions\nTransport\nExclusions Shifting"],
    ["Inclusions:\nTransport\nExclusions:\nShifting", "Inclusions:\nTransport\nExclusions:\nShifting"],
    ["Custom work. INCLUSIONS: none; Exclusions: none.", "Custom work. INCLUSIONS: Transport; Exclusions: Shifting."],
    ["Custom work, inclusions Transport, Transport and exclusions Unloading.", "Custom work, inclusions Transport and exclusions Shifting."],
    ["Exclusions: Unloading. Keep this sentence. Inclusions: none.", "Exclusions: Shifting. Keep this sentence. Inclusions: Transport."],
    ["Inclusions: bespoke site work. Exclusions: extra testing.", "Inclusions: Transport, bespoke site work. Exclusions: Shifting, extra testing."],
    ["Inclusions: Transport for onsite work. Keep this wording. Exclusions: Shifting.", "Inclusions: Transport for onsite work. Keep this wording. Exclusions: Shifting."],
    ["Inclusions: Transport.", "Inclusions: Transport. Exclusions: Shifting."]
  ])("updates existing labels without duplicating them: %s", (text, expected) => {
    const pmc = scope(["Transport"], ["Shifting"]);
    expect(syncModeDescription(text, pmc)).toBe(expected);
    expect(syncModeDescription(expected, pmc)).toBe(expected);
  });

  it("removes deselected values from their own lists without changing narrative wording", () => {
    const original = "Transport is arranged onsite. Inclusions: Transport, Shifting. Exclusions: Transport.";
    expect(syncModeDescription(original, scope(["Shifting"], ["Transport"])))
      .toBe("Transport is arranged onsite. Inclusions: Shifting. Exclusions: Transport.");
    expect(syncModeDescription(original, scope())).toBe("Transport is arranged onsite. Inclusions: none. Exclusions: none.");
  });

  it("handles custom names with punctuation and overlapping names without duplication", () => {
    const pmc = {
      ...scope(),
      inclusions: [
        { id: "long", name: "Transport labour", selected: true },
        { id: "short", name: "Transport", selected: false },
        { id: "custom", name: "Delivery (A+B)", selected: true },
        { id: "pf", name: "ESIC/ PF", selected: true }
      ]
    };
    const expected = "Inclusions: Transport labour, Delivery (A+B), ESIC/ PF.";
    expect(syncModeDescription("Inclusions: Transport, Transport labour, Delivery (A+B).", pmc)).toBe(expected);
    expect(syncModeDescription(expected, pmc)).toBe(expected);
  });

  it("keeps a generated paragraph stable and changes only its checklist values", () => {
    const original = generateModeDescription("TV Unit", scope());
    const selected = scope(["Transport", "Shifting"], ["Unloading"]);
    expect(syncModeDescription(original, selected)).toBe(generateModeDescription("TV Unit", selected));
    expect(syncModeDescription(generateModeDescription("TV Unit", selected), selected))
      .toBe(generateModeDescription("TV Unit", selected));
  });

  it("leaves wording without selected items or labels alone, including empty drafts", () => {
    expect(syncModeDescription("Custom work.\nKeep this wording.", undefined)).toBe("Custom work.\nKeep this wording.");
    expect(syncModeDescription("", scope())).toBe("");
    expect(syncModeDescription("Inclusions: custom work.", scope())).toBe("Inclusions: custom work.");
  });

  it("ignores invalid empty catalog names while the enclosing form reports validation", () => {
    expect(syncModeDescription("Inclusions: none.", { ...scope(), inclusions: [{ id: "invalid", name: "", selected: false }] }))
      .toBe("Inclusions: none.");
  });

  it("removes deleted custom values using the previous list, even when both lists used the same name", () => {
    const previous = { ...scope(),
      inclusions: [{ id: "custom-in", name: "Lift service", selected: true }],
      exclusions: [{ id: "custom-out", name: "Lift service", selected: true }]
    };
    const next = { ...previous, inclusions: [] };
    const expected = "Custom work. Inclusions: none. Exclusions: Lift service.";
    expect(syncModeDescription("Custom work. Inclusions: Lift service. Exclusions: Lift service.", next, previous)).toBe(expected);
    expect(syncModeDescription(expected, next)).toBe(expected);
  });
});
