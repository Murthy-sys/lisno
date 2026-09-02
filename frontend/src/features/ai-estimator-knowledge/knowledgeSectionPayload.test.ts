import { describe, expect, it } from "vitest";

import {
  knowledgeOverviewPayloadForUpdate,
  knowledgeSectionPayloadForUpdate
} from "./knowledgeSectionPayload";

describe("knowledge section update payloads", () => {
  it("rebases only edited Overview values onto the latest compatibility payload", () => {
    const latest = {
      description: "Latest description",
      uomId: "uom-server",
      surfaceIds: ["surface-server"],
      priorityId: "priority-server",
      modeIds: ["mode-server"],
      sectionApplicability: [{ id: "server-rule" }],
      unknownValue: { source: "server" }
    } as const;
    const staleLocal = {
      description: "Stale description",
      uomId: "uom-local",
      surfaceIds: ["surface-stale"],
      priorityId: "priority-stale",
      modeIds: ["mode-stale"],
      sectionApplicability: [{ id: "stale-rule" }],
      unknownValue: { source: "stale" }
    } as const;

    expect(
      knowledgeOverviewPayloadForUpdate(latest, staleLocal, new Set(["uomId"]))
    ).toEqual({ ...latest, uomId: "uom-local" });
    expect(latest.surfaceIds).toEqual(["surface-server"]);
  });

  it("preserves explicit Surface edits and supports clearing an edited UOM", () => {
    const latest = {
      uomId: "uom-server",
      surfaceIds: ["surface-server"],
      hidden: "preserve"
    } as const;
    const local = { surfaceIds: ["surface-local"] } as const;

    expect(
      knowledgeOverviewPayloadForUpdate(
        latest,
        local,
        new Set(["uomId", "surfaceIds"])
      )
    ).toEqual({ surfaceIds: ["surface-local"], hidden: "preserve" });
  });

  it("rebases only a locally edited Priority and supports clearing it", () => {
    const latest = {
      uomId: "uom-newer",
      priorityId: "priority-server",
      surfaceIds: ["surface-newer"],
      hiddenCompatibility: { source: "server" }
    } as const;

    expect(knowledgeOverviewPayloadForUpdate(
      latest,
      { priorityId: "priority-local", uomId: "uom-stale" },
      new Set(["priorityId"])
    )).toEqual({ ...latest, priorityId: "priority-local" });
    expect(knowledgeOverviewPayloadForUpdate(
      latest,
      { uomId: "uom-stale" },
      new Set(["priorityId"])
    )).toEqual({
      uomId: "uom-newer",
      surfaceIds: ["surface-newer"],
      hiddenCompatibility: { source: "server" }
    });
  });

  it("still strips server-enriched immutable price reference fields", () => {
    expect(knowledgeSectionPayloadForUpdate("pricing", {
      priceEntries: [{
        operation: "reference",
        priceEntryId: "price-entry-1",
        priceVersionId: "price-version-1",
        priceVersion: { totalAmountPaise: 12_345 }
      }]
    })).toEqual({
      priceEntries: [{
        operation: "reference",
        priceEntryId: "price-entry-1",
        priceVersionId: "price-version-1"
      }]
    });
  });

  it("serializes a new budget through the exact business-only allowlist", () => {
    expect(knowledgeSectionPayloadForUpdate("pricing", {
      specifications: [{ id: "spec-1", name: "Plywood" }],
      priceEntries: [{
        operation: "set_budget",
        vendorId: "vendor-1",
        uomId: "uom-1",
        // A stale client value must be discarded; fixed GST is server-owned.
        taxRuleId: "tax-1",
        inputAmountPaise: 12_000,
        effectiveFrom: "2026-09-02T04:30:00.000Z",
        effectiveTo: null,
        priceEntryId: "must-not-leak",
        priceVersionId: "must-not-leak",
        specificationId: "must-not-leak",
        modeId: "must-not-leak",
        taxVersionId: "must-not-leak",
        treatment: "exclusive",
        status: "active",
        baseAmountPaise: 12_000,
        taxAmountPaise: 2_160,
        totalAmountPaise: 14_160,
        versionNumber: 99
      }]
    })).toEqual({
      specifications: [{ id: "spec-1", name: "Plywood" }],
      priceEntries: [{
        operation: "set_budget",
        vendorId: "vendor-1",
        uomId: "uom-1",
        inputAmountPaise: 12_000,
        effectiveFrom: "2026-09-02T04:30:00.000Z",
        effectiveTo: null
      }]
    });
  });

  it("includes only the opaque source reference when updating a saved budget", () => {
    expect(knowledgeSectionPayloadForUpdate("pricing", {
      priceEntries: [{
        operation: "set_budget",
        sourcePriceVersionId: "version-1",
        vendorId: "vendor-2",
        uomId: "uom-1",
        // Server-owned fields from an enriched record must not be replayed.
        taxRuleId: "tax-2",
        inputAmountPaise: 25_050,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        effectiveTo: "2026-10-31T23:59:59.000Z",
        priceVersion: { totalAmountPaise: 999_999 },
        reviewRequired: true
      }]
    })).toEqual({
      priceEntries: [{
        operation: "set_budget",
        sourcePriceVersionId: "version-1",
        vendorId: "vendor-2",
        uomId: "uom-1",
        inputAmountPaise: 25_050,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        effectiveTo: "2026-10-31T23:59:59.000Z"
      }]
    });
  });

  it("omits a removed reference without creating a delete or replacement command", () => {
    expect(knowledgeSectionPayloadForUpdate("pricing", {
      brands: [{ id: "brand-1", name: "Vendor" }],
      priceEntries: []
    })).toEqual({
      brands: [{ id: "brand-1", name: "Vendor" }],
      priceEntries: []
    });
  });
});
