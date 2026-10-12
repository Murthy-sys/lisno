import { describe, expect, it } from "vitest";
import { proposalFixture, proposalHierarchyFixture, proposalSectionFixture } from "./proposal.fixtures";
import { proposalChangeSummaries } from "./proposalPresentation";
import type { ProposalChange } from "./proposalTypes";

describe("proposal review change summaries", () => {
  it("names each affected Main Line and maps its saved section to the workspace label", () => {
    const nodes = proposalHierarchyFixture();
    const second = { ...nodes[1], resourceId: "line-two", payload: { ...nodes[1].payload, name: "Exterior paint" } };
    const mode = proposalSectionFixture("advanced");
    const pricing = { ...proposalSectionFixture("pricing"), parentId: second.resourceId };
    const changes: ProposalChange[] = [mode, pricing].map(resource => ({ resourceId: resource.resourceId, kind: "section", change: "changed", before: resource, after: resource, fields: ["payload"] }));
    expect(proposalChangeSummaries(changes, [...nodes, second], "Stone finishes").map(summary => summary.title)).toEqual([
      "Stone installation · Mode settings updated", "Exterior paint · Mode pricing updated"
    ]);
  });

  it("uses removed Main Line metadata to identify its removed sections and gives a clear missing-name fallback", () => {
    const line = proposalHierarchyFixture()[1];
    const section = proposalSectionFixture("recommendations");
    const unknown = { ...section, resourceId: "unknown-section", parentId: "missing-line" };
    const changes: ProposalChange[] = [line, section, unknown].map(resource => ({ resourceId: resource.resourceId, kind: resource.kind, change: "removed", before: resource, after: null, fields: ["payload", "name"] }));
    expect(proposalChangeSummaries(changes, [], "Stone finishes").map(summary => summary.title)).toEqual([
      "Stone installation · Main Line removed", "Stone installation · Recommendations removed", "Main Line name unavailable · Recommendations removed"
    ]);
  });

  it("labels basket, Sub-Basket and shared quality changes without displaying technical fields", () => {
    const detail = proposalFixture();
    const sub = proposalHierarchyFixture()[0];
    const quality = { ...detail.basket, resourceId: "quality-one", kind: "quality" as const, payload: { parameters: [] } };
    const changes: ProposalChange[] = [
      { resourceId: detail.basket.resourceId, kind: "basket", change: "changed", before: detail.basket, after: detail.basket, fields: ["name", "description", "displayOrder", "payload"] },
      { resourceId: sub.resourceId, kind: "sub_basket", change: "added", before: null, after: sub, fields: ["name", "payload"] },
      { resourceId: quality.resourceId, kind: "quality", change: "changed", before: quality, after: quality, fields: ["parameters"] }
    ];
    const summaries = proposalChangeSummaries(changes, [], detail.name);
    expect(summaries.map(summary => summary.title)).toEqual(["Stone finishes · Main Basket updated", "Interior stone · Sub-Basket added", "Stone finishes · Shared basket quality updated"]);
    expect(summaries[0].description).toBe("Changed: name, description, display order.");
    expect(summaries.slice(1).map(summary => summary.description)).toEqual([null, null]);
    expect(JSON.stringify(summaries)).not.toContain("payload");
  });
  it("identifies proposed UOM and Surface changes and names precision edits", () => {
    const basket = proposalFixture().basket;
    const uom = { ...basket, resourceId: "uom-proposed", kind: "uom" as const, payload: { name: "Unit", code: "unit", description: null, decimalScale: 2 } };
    const surface = { ...basket, resourceId: "surface-proposed", kind: "surface" as const, payload: { name: "Ceiling", code: "ceiling", description: null } };
    const changes: ProposalChange[] = [
      { resourceId: uom.resourceId, kind: uom.kind, change: "changed", before: uom, after: uom, fields: ["decimalScale"] },
      { resourceId: surface.resourceId, kind: surface.kind, change: "added", before: null, after: surface, fields: ["name"] }
    ];
    expect(proposalChangeSummaries(changes, [], "Basket")).toMatchObject([
      { title: "Unit · Proposed UOM updated", description: "Changed: quantity decimal places." },
      { title: "Ceiling · Proposed Surface added" }
    ]);
  });

});
