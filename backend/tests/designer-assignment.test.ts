import { describe, expect, it } from "vitest";
import type { DesignerSuggestion } from "../src/contracts/designer-assignment.js";
import { compareDesignerSuggestions, designerLanguageMatch, designerLocationMatch, normalizeDesignerMatchText } from "../src/domain/designer-assignment.js";

describe("Designer recommendation matching", () => {
  it("matches saved text conservatively without inferring aliases or city substrings", () => {
    expect(normalizeDesignerMatchText("  Ｐｕｎｅ  Central  ")).toBe("pune central");
    expect(designerLocationMatch("Pune Central", " pune   CENTRAL ", "Pune")).toBe("same_location");
    expect(designerLocationMatch("Kothrud, Pune", "Different area", "Pune")).toBe("city_text");
    expect(designerLocationMatch("New Pune Road", "Different area", "Pune")).toBe("none");
    expect(designerLocationMatch("Bangalore", "Whitefield", "Bengaluru")).toBe("none");
    expect(designerLocationMatch(null, "Pune", "Pune")).toBe("unknown");
    expect(designerLocationMatch("Pune", null, null)).toBe("unknown");
  });
  it("distinguishes preferred, known, missing and nonmatching languages", () => {
    expect(designerLanguageMatch("hindi", "hindi", ["english", "hindi"])).toBe("preferred");
    expect(designerLanguageMatch("hindi", "english", ["english", "hindi"])).toBe("known");
    expect(designerLanguageMatch("hindi", "english", ["english"])).toBe("none");
    expect(designerLanguageMatch("hindi", null, [])).toBe("unknown");
    expect(designerLanguageMatch(null, "hindi", ["hindi"])).toBe("unknown");
  });
  it("orders workload first, then language, location, and stable name and ID", () => {
    const row = (id: string, count: number, languageMatch: DesignerSuggestion["languageMatch"], locationMatch: DesignerSuggestion["locationMatch"]): DesignerSuggestion => ({
      id, name: "Designer", activeProjectCount: count, languagesKnown: [], preferredLanguage: null, location: null,
      languageMatch, locationMatch, eligible: true, blockedReason: null
    });
    const items = [row("busy", 3, "preferred", "same_location"), row("no-match", 0, "none", "none"),
      row("known", 1, "known", "same_location"), row("preferred-far", 1, "preferred", "none"),
      row("same-b", 1, "preferred", "same_location"), row("same-a", 1, "preferred", "same_location")];
    expect(items.sort(compareDesignerSuggestions).map(item => item.id)).toEqual(["no-match", "same-a", "same-b", "preferred-far", "known", "busy"]);
  });
});
