import { describe, expect, it } from "vitest";

import { procurementDashboardProjection } from "../src/services/procurement.service.js";

const decidedAt = new Date("2026-09-01T10:00:00.000Z");

function approvedProject(input: {
  projectId: string;
  estimateId: string;
  basketId: string;
  basketName: string;
  lineId: string;
  lineAmountPaise: number;
}) {
  const subtotalPaise = input.lineAmountPaise;
  const gstPaise = Math.round(subtotalPaise * 0.18);
  const totalPaise = subtotalPaise + gstPaise;
  const line = {
    id: `${input.estimateId}-line`, source: "configuration", catalogueId: input.lineId,
    mainBasketId: input.basketId, mainBasketName: input.basketName,
    subBasketId: `${input.basketId}-child`, subBasketName: "Shared child",
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
});
