import { describe, expect, it } from "vitest";

import {
  approvedProcurementSnapshotFromRows,
  procurementDashboardProjection
} from "../src/services/procurement.service.js";

const decidedAt = new Date("2026-09-01T10:00:00.000Z");

function approvedProject(input: {
  projectId: string;
  estimateId: string;
  basketId: string;
  basketName: string;
  lineId: string;
  lineAmountPaise: number;
  placement?: "direct_temporary" | "grouped_temporary";
}) {
  const subtotalPaise = input.lineAmountPaise;
  const gstPaise = Math.round(subtotalPaise * 0.18);
  const totalPaise = subtotalPaise + gstPaise;
  const line = {
    id: `${input.estimateId}-line`, source: "configuration", catalogueId: input.lineId,
    ...(input.placement ? { itemType: "temporary" } : {}),
    mainBasketId: input.basketId, mainBasketName: input.basketName,
    subBasketId: input.placement === "direct_temporary" ? null : `${input.basketId}-child`,
    subBasketName: input.placement === "direct_temporary" ? null : "Shared child",
    mainLineId: input.lineId, mainLineName: "Configured line",
    roomId: "room-a", roomName: "Living room", specification: null,
    unit: "sqft", quantity: 1, included: true,
    ratePaise: subtotalPaise, amountPaise: subtotalPaise,
    rate: subtotalPaise / 100, amount: subtotalPaise / 100
  };
  const estimate = {
    _id: input.estimateId, projectId: input.projectId, version: 4,
    status: "client_approved", designPlanStatus: "approved", designPlanVersion: 2,
    designPlanApprovedAt: decidedAt, designPlanApprovedById: "client-a",
    designPlanApprovalSource: "client_portal", lineItems: [line]
  };
  const round = {
    _id: `${input.estimateId}-round`, estimateId: input.estimateId,
    projectId: input.projectId, estimateVersion: 3,
    status: "approved", decision: "approve", decisionSource: "client_portal",
    decidedById: "client-a", decidedAt,
    estimateSnapshot: {
      lineItems: [line], subtotalPaise, gstPaise, totalPaise,
      subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100
    }
  };
  return { project: { _id: input.projectId }, estimate, approvedRounds: [round], task: null, bucket: null, entries: [] };
}

describe("configured Procurement approval lineage", () => {
  it("keeps unequal projects and same-named child baskets keyed by exact parent IDs and paise", () => {
    const first = procurementDashboardProjection(approvedProject({
      projectId: "project-a", estimateId: "estimate-a", basketId: "basket-lower-a",
      basketName: "Joinery at approval", lineId: "line-a", lineAmountPaise: 12_125
    }));
    const second = procurementDashboardProjection(approvedProject({
      projectId: "project-b", estimateId: "estimate-b", basketId: "basket-lower-b",
      basketName: "Electrical at approval", lineId: "line-b", lineAmountPaise: 7_003
    }));
    expect(first).toMatchObject({ sourceSectionIds: ["basket-lower-a"], approvedAmountPaise: 12_125 });
    expect(second).toMatchObject({ sourceSectionIds: ["basket-lower-b"], approvedAmountPaise: 7_003 });
    expect(first.approvedAmountPaise + second.approvedAmountPaise).toBe(19_128);
  });
  it("keeps approved mode-priced amounts after a draft selling rate or mode changes", () => {
    const fixture = approvedProject({ projectId: "project-priced", estimateId: "estimate-priced", basketId: "basket-priced",
      basketName: "Approved work", lineId: "line-priced", lineAmountPaise: 12_125 });
    const published = { ...fixture.approvedRounds[0]!.estimateSnapshot.lineItems[0]!,
      classification: "special", pricingMode: "pmc", rateSource: "configuration" };
    const current = { ...published, pricingMode: "in_house", rateSource: "manual",
      ratePaise: 99_999, amountPaise: 99_999, rate: 999.99, amount: 999.99 };
    const projection = procurementDashboardProjection({ ...fixture,
      estimate: { ...fixture.estimate, lineItems: [current] },
      approvedRounds: [{ ...fixture.approvedRounds[0]!, estimateSnapshot: {
        ...fixture.approvedRounds[0]!.estimateSnapshot, lineItems: [published] } }] });
    expect(projection).toMatchObject({ approvedAmountPaise: 12_125, sourceLineItemKeys: ["estimate-priced-line"] });
  });

  it("reconciles direct and grouped temporary approved lines across unequal projects without a synthetic child", () => {
    const first = procurementDashboardProjection(approvedProject({
      projectId: "project-direct", estimateId: "estimate-direct", basketId: "painting",
      basketName: "Painting", lineId: "temporary-direct", lineAmountPaise: 12_125,
      placement: "direct_temporary"
    }));
    const second = procurementDashboardProjection(approvedProject({
      projectId: "project-grouped", estimateId: "estimate-grouped", basketId: "lights",
      basketName: "Functional Lights", lineId: "temporary-grouped", lineAmountPaise: 7_003,
      placement: "grouped_temporary"
    }));
    expect(first).toMatchObject({
      sourceSectionIds: ["painting"], sourceLineItemKeys: ["estimate-direct-line"],
      approvedAmountPaise: 12_125
    });
    expect(second).toMatchObject({
      sourceSectionIds: ["lights"], sourceLineItemKeys: ["estimate-grouped-line"],
      approvedAmountPaise: 7_003
    });
    expect(first.approvedAmountPaise + second.approvedAmountPaise).toBe(19_128);
  });

  it("projects every approved row by exact room and basket IDs without changing actionable lines", () => {
    const fixture = approvedProject({
      projectId: "project-all-lines", estimateId: "estimate-all-lines", basketId: "basket-a",
      basketName: "Same basket", lineId: "line-a", lineAmountPaise: 12_125
    });
    const first = {
      ...fixture.approvedRounds[0]!.estimateSnapshot.lineItems[0]!,
      revisionId: "revision-a", sourceRevisionVersion: 3, sourceRevisionStatus: "active",
      uomId: "uom-sqft", uomCode: "sqft", uomDecimalScale: 2
    };
    const second = {
      ...first, id: "second-line", roomId: "room-b", roomName: "Bedroom",
      mainBasketId: "basket-b", mainBasketName: "Same basket",
      subBasketId: "basket-b-child", subBasketName: "Shared child",
      catalogueId: "line-b", mainLineId: "line-b", mainLineName: "Configured line",
      revisionId: "revision-b", sourceRevisionVersion: 7,
      ratePaise: 7_003, amountPaise: 7_003, rate: 70.03, amount: 70.03
    };
    const excluded = {
      ...second, id: "excluded-line", catalogueId: "line-excluded", mainLineId: "line-excluded",
      included: false, ratePaise: null, amountPaise: null, rate: null, amount: null
    };
    const zero = {
      ...second, id: "zero-line", catalogueId: "line-zero", mainLineId: "line-zero",
      ratePaise: 0, amountPaise: 0, rate: 0, amount: 0
    };
    const legacy = {
      id: "legacy-line", source: "legacy", catalogueId: "CA02", roomName: "Store",
      specification: "Legacy fixture", unit: "nos", quantity: 1, included: true,
      rate: 0, amount: 0
    };
    const subtotalPaise = 19_128;
    const gstPaise = 3_443;
    const round = {
      ...fixture.approvedRounds[0]!,
      estimateSnapshot: {
        lineItems: [first, second, excluded, zero, legacy],
        subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise,
        subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100
      }
    };
    const snapshot = approvedProcurementSnapshotFromRows(fixture.estimate, [round]);

    expect(snapshot.allLineItems.map(({ key, included, amountPaise }) => ({ key, included, amountPaise }))).toEqual([
      { key: "estimate-all-lines-line", included: true, amountPaise: 12_125 },
      { key: "second-line", included: true, amountPaise: 7_003 },
      { key: "excluded-line", included: false, amountPaise: null },
      { key: "zero-line", included: true, amountPaise: 0 },
      { key: "legacy-line", included: true, amountPaise: 0 }
    ]);
    expect(snapshot.lineItems.map((line) => line.key)).toEqual([
      "estimate-all-lines-line", "second-line", "zero-line", "legacy-line"
    ]);
    expect(snapshot.allLineItems[0]).toMatchObject({
      roomId: "room-a", mainBasketId: "basket-a", subBasketId: "basket-a-child",
      mainLineId: "line-a", revisionId: "revision-a", sourceRevisionVersion: 3,
      sourceRevisionStatus: "active", uomId: "uom-sqft", uomCode: "sqft", uomDecimalScale: 2
    });
    expect(snapshot.allLineItems[1]).toMatchObject({
      roomId: "room-b", mainBasketId: "basket-b", subBasketId: "basket-b-child",
      mainLineId: "line-b", mainBasketName: "Same basket", revisionId: "revision-b"
    });
    expect(snapshot.allLineItems[4]).not.toHaveProperty("revisionId");
    expect(snapshot.subtotalPaise).toBe(19_128);
  });

  it("keeps historical optional configuration lineage absent and rejects mismatched identity", () => {
    const fixture = approvedProject({
      projectId: "project-history", estimateId: "estimate-history", basketId: "basket-history",
      basketName: "Historical", lineId: "line-history", lineAmountPaise: 4_321
    });
    const historical = approvedProcurementSnapshotFromRows(fixture.estimate, fixture.approvedRounds);
    expect(historical.allLineItems[0]).not.toHaveProperty("revisionId");
    expect(historical.allLineItems[0]).not.toHaveProperty("sourceRevisionVersion");
    expect(historical.allLineItems[0]).not.toHaveProperty("uomId");
    expect(historical.allLineItems[0]).not.toHaveProperty("uomDecimalScale");

    const source = fixture.approvedRounds[0]!.estimateSnapshot.lineItems[0]!;
    const missingHistoricalId = {
      ...fixture.approvedRounds[0]!,
      estimateSnapshot: {
        ...fixture.approvedRounds[0]!.estimateSnapshot,
        lineItems: [{ ...source, id: undefined }]
      }
    };
    expect(approvedProcurementSnapshotFromRows(fixture.estimate, [missingHistoricalId]).allLineItems[0]?.key)
      .toBe("legacy-estimate-line:estimate-history:3:0");
    const mismatched = {
      ...fixture.approvedRounds[0]!,
      estimateSnapshot: {
        ...fixture.approvedRounds[0]!.estimateSnapshot,
        lineItems: [{ ...source, mainLineId: "other-line" }]
      }
    };
    expect(() => approvedProcurementSnapshotFromRows(fixture.estimate, [mismatched])).toThrowError(
      expect.objectContaining({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" })
    );
    const invalidRevision = {
      ...fixture.approvedRounds[0]!,
      estimateSnapshot: {
        ...fixture.approvedRounds[0]!.estimateSnapshot,
        lineItems: [{ ...source, sourceRevisionVersion: 0 }]
      }
    };
    expect(() => approvedProcurementSnapshotFromRows(fixture.estimate, [invalidRevision])).toThrowError(
      expect.objectContaining({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" })
    );
    const duplicatedExcludedKey = {
      ...fixture.approvedRounds[0]!,
      estimateSnapshot: {
        ...fixture.approvedRounds[0]!.estimateSnapshot,
        lineItems: [source, { ...source, included: false, amountPaise: null, amount: null }]
      }
    };
    expect(() => approvedProcurementSnapshotFromRows(fixture.estimate, [duplicatedExcludedKey])).toThrowError(
      expect.objectContaining({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" })
    );
  });

  it("reads Main Basket classification only from the immutable approved snapshot by ID", () => {
    const fixture = approvedProject({ projectId: "classification-project", estimateId: "classification-estimate",
      basketId: "basket-a", basketName: "Same name", lineId: "main-a", lineAmountPaise: 12_125 });
    const first = { ...fixture.approvedRounds[0]!.estimateSnapshot.lineItems[0]!, classification: "special" };
    const second = { ...first, id: "other-line", catalogueId: "main-b", mainLineId: "main-b",
      mainBasketId: "basket-b", mainBasketName: "Same name", classification: "standard",
      amountPaise: 7_003, amount: 70.03, ratePaise: 7_003, rate: 70.03 };
    const subtotalPaise = 19_128;
    const round = { ...fixture.approvedRounds[0]!, estimateSnapshot: {
      ...fixture.approvedRounds[0]!.estimateSnapshot, lineItems: [first, second],
      selectedMainBasketIds: ["basket-a", "basket-b"],
      selectedMainBasketClassifications: [
        { mainBasketId: "basket-a", classification: "standard" },
        { mainBasketId: "basket-b", classification: "special" }
      ],
      subtotalPaise, gstPaise: 3_443, totalPaise: 22_571,
      subtotal: 191.28, gst: 34.43, total: 225.71
    } };
    const mutableEstimate = { ...fixture.estimate, lineItems: [{ ...first, classification: "special" }] };
    const approved = approvedProcurementSnapshotFromRows(mutableEstimate, [round]);
    expect(approved.mainBasketClassifications["basket-a"]).toBe("standard");
    expect(approved.mainBasketClassifications["basket-b"]).toBe("special");
    expect(approved.allLineItems.map(line => line.mainBasketId)).toEqual(["basket-a", "basket-b"]);
    expect(approved.allLineItems[0]).not.toHaveProperty("mainBasketClassification");
    expect(approvedProcurementSnapshotFromRows(fixture.estimate, fixture.approvedRounds).mainBasketClassifications)
      .toEqual({});
    const invalid = { ...round, estimateSnapshot: { ...round.estimateSnapshot,
      selectedMainBasketClassifications: [
        { mainBasketId: "basket-a", classification: "standard" },
        { mainBasketId: "basket-b", classification: "unrecognized" }
      ] } };
    expect(() => approvedProcurementSnapshotFromRows(mutableEstimate, [invalid])).toThrowError(
      expect.objectContaining({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" }));
  });
});
