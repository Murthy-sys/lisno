import { describe, expect, it } from "vitest";
import { PROPOSAL_LIMITS, type ProposalPublicationSnapshot, type ProposalResource } from "../src/contracts/vendor-basket-proposal.js";
import { validateProposalStructure } from "../src/services/vendor-basket-proposal-publication.js";

function resource<T>(kind: ProposalResource["kind"], resourceId: string, parentId: string | null, payload: T): ProposalResource<T> {
  return { proposalId: "bounds-proposal", headId: "bounds-head", resourceId, kind, parentId, payload, version: 1, digest: "fixture", savedById: "fixture-actor", savedAt: "2026-10-11T00:00:00.000Z" };
}
function snapshot(lines: number): ProposalPublicationSnapshot {
  return { proposalId: "bounds-proposal", basket: resource("basket", "bounds-basket", null, { name: "Bounds", description: null, displayOrder: 0 }),
    subBaskets: [resource("sub_basket", "bounds-sub", "bounds-basket", { name: "One sub", description: null, displayOrder: 0 })],
    mainLines: Array.from({ length: lines }, (_, index) => resource("main_line", `line-${index}`, "bounds-sub", { name: `Line ${index}`, description: null, displayOrder: index })),
    sections: Array.from({ length: lines }, (_, index) => resource("section", `pricing-${index}`, `line-${index}`, { sectionKey: "pricing" as const, applicability: "configured" as const, payload: {} })), quality: null };
}
function size(payload: unknown): number { return Buffer.byteLength(JSON.stringify(payload), "utf8"); }
function snapshotSize(value: ProposalPublicationSnapshot): number { return [value.basket, ...value.subBaskets, ...value.mainLines, ...value.sections].reduce((sum, entry) => sum + size(entry.payload), 0); }

describe("proposal structural safety ceilings", () => {
  // These isolate transport/storage ceilings. Canonical domain validation runs
  // separately and can impose stricter text, row and reference requirements.
  it("accepts 100 Main Lines and rejects 101", () => {
    expect(validateProposalStructure(snapshot(100))).toEqual([]);
    expect(validateProposalStructure(snapshot(101))).toContainEqual(expect.objectContaining({ code: "PROPOSAL_LIMIT_EXCEEDED" }));
  });
  it("enforces the exact 240 KiB canonical resource-byte boundary", () => {
    const value = snapshot(1); const target = value.sections[0]!;
    target.payload.payload.technicalDescription = "";
    target.payload.payload.technicalDescription = "x".repeat(PROPOSAL_LIMITS.resourceBytes - size(target.payload));
    expect(size(target.payload)).toBe(PROPOSAL_LIMITS.resourceBytes);
    expect(validateProposalStructure(value)).toEqual([]);
    target.payload.payload.technicalDescription += "x";
    expect(validateProposalStructure(value)).toContainEqual(expect.objectContaining({ resourceId: target.resourceId, message: expect.stringContaining("240 KiB") }));
  });
  it("accepts an 8 MiB snapshot and rejects one additional byte without exceeding a resource ceiling", () => {
    const value = snapshot(100);
    for (const section of value.sections) section.payload.payload.technicalDescription = "";
    let remaining = PROPOSAL_LIMITS.snapshotBytes - snapshotSize(value); let last = value.sections[0]!;
    for (const section of value.sections) {
      const count = Math.min(remaining, PROPOSAL_LIMITS.resourceBytes - size(section.payload));
      section.payload.payload.technicalDescription = "x".repeat(count); remaining -= count; last = section;
      if (!remaining) break;
    }
    expect(remaining).toBe(0); expect(snapshotSize(value)).toBe(PROPOSAL_LIMITS.snapshotBytes);
    expect(validateProposalStructure(value)).toEqual([]);
    last.payload.payload.technicalDescription += "x";
    expect(size(last.payload)).toBeLessThan(PROPOSAL_LIMITS.resourceBytes);
    expect(validateProposalStructure(value)).toContainEqual(expect.objectContaining({ resourceId: "bounds-basket", message: expect.stringContaining("8 MiB") }));
  });
  it("accepts 100 price records per line and rejects 101", () => {
    const value = snapshot(1); const entries = Array.from({ length: 100 }, () => ({}));
    value.sections[0]!.payload.payload.priceEntries = entries;
    expect(validateProposalStructure(value)).toEqual([]);
    entries.push({});
    expect(validateProposalStructure(value)).toContainEqual(expect.objectContaining({ resourceId: "pricing-0", message: expect.stringContaining("100 saved prices") }));
  });
  it("accepts 2,000 aggregate prices and rejects 2,001 while each line stays within its limit", () => {
    const value = snapshot(21);
    for (const section of value.sections.slice(0, 20)) section.payload.payload.priceEntries = Array.from({ length: 100 }, () => ({}));
    expect(validateProposalStructure(value)).toEqual([]);
    value.sections[20]!.payload.payload.priceEntries = [{}];
    expect(validateProposalStructure(value)).toEqual([expect.objectContaining({ resourceId: "bounds-basket", message: expect.stringContaining("2,000 saved prices") })]);
  });
});

describe("hierarchy intake structural boundary", () => {
  function intake(): ProposalPublicationSnapshot {
    const value = snapshot(1); value.requestMode = "hierarchy_intake"; value.sections = [];
    value.basket.payload.description = "Requested basket";
    value.subBaskets[0]!.payload.description = "Requested child";
    return value;
  }
  it("requires descriptions and a Main Line before submission but permits an incomplete saved draft", () => {
    expect(validateProposalStructure(intake())).toEqual([]);
    const value = intake(); value.basket.payload.description = null; value.subBaskets[0]!.payload.description = " "; value.mainLines = [];
    expect(validateProposalStructure(value, true)).toEqual([]);
    const codes = validateProposalStructure(value).map((finding) => finding.code);
    expect(codes.filter((code) => code === "DESCRIPTION_REQUIRED")).toHaveLength(2);
    expect(codes).toContain("PROPOSAL_HIERARCHY_REQUIRED");
  });
  it("rejects hidden Configuration payloads, extra children, quality and proposed masters", () => {
    const attempts: Array<(value: ProposalPublicationSnapshot) => void> = [
      (value) => { value.sections = snapshot(1).sections; },
      (value) => { value.quality = resource("quality", "quality", "bounds-basket", { parameters: [] }); },
      (value) => { value.subBaskets.push(resource("sub_basket", "another-sub", "bounds-basket", { name: "Other", description: "Other", displayOrder: 1 })); },
      (value) => { Object.assign(value.mainLines[0]!.payload, { uomId: "unit", ratePaise: 100 }); },
      (value) => { value.mainLines[0]!.payload.description = "Hidden technical details"; },
      (value) => { value.masters = [{ ...resource("surface", "private-surface", null, { name: "Surface", code: "SURFACE", description: null }), kind: "surface" }]; }
    ];
    for (const mutate of attempts) {
      const value = intake(); mutate(value);
      expect(validateProposalStructure(value)).toContainEqual(expect.objectContaining({ code: "INVALID_INTAKE_CONTENT" }));
    }
  });
  it("keeps full proposals on their established structure rules and requires intake lines for existing parents", () => {
    const value = snapshot(0); value.target = { kind: "new_sub_basket", basketId: "bounds-basket" };
    expect(validateProposalStructure(value)).toEqual([]);
    value.requestMode = "hierarchy_intake"; value.subBaskets[0]!.payload.description = "New child";
    expect(validateProposalStructure(value).map((finding) => finding.code)).toContain("PROPOSAL_HIERARCHY_REQUIRED");
    value.mainLines = snapshot(1).mainLines;
    expect(validateProposalStructure(value)).toEqual([]);
  });
});
