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
});
