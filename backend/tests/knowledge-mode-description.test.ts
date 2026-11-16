import { describe, expect, it } from "vitest";
import { syncModeDescription } from "../src/domain/knowledge-mode-description.js";

describe("saved Mode description synchronization", () => {
  const scopes = { inclusions: [{ id: "delivery", name: "Delivery", selected: true }],
    exclusions: [{ id: "removal", name: "Removal", selected: true }] };

  it("keeps cleared paragraphs empty even when PMC and In-house scope items are selected", () => {
    expect(syncModeDescription("", scopes, undefined, scopes)).toBe("");
    expect(syncModeDescription("  \n", scopes, undefined, scopes)).toBe("  \n");
  });

  it("continues synchronizing existing wording with current scope selections", () => {
    expect(syncModeDescription("Prepared work. Inclusions: none. Exclusions: none.", scopes))
      .toBe("Prepared work. Inclusions: Delivery. Exclusions: Removal.");
  });
});
