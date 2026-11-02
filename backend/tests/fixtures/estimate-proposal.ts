import type { EstimatePdfInput, EstimatePdfLine } from "../../src/services/estimate-pdf.service.js";
import { createEstimateProposal, type EstimateProposalMetadata } from "../../src/domain/estimate-proposal.js";

/** Synthetic reference-density data; no source-PDF client information is retained. */
export function proposalFixture(): EstimatePdfInput & { proposal: EstimateProposalMetadata } {
  const rooms = ["Entrance & Living", "Kitchen & Utility", "Master Bedroom", "Guest Bedroom", "Children's Bedroom", "Electrical & General"];
  const titles = ["Full-height storage unit", "Wall-mounted display console", "Open shelf with laminate finish", "False ceiling and perimeter cove", "Premium emulsion wall finish", "Hardware and installation"];
  const lineItems: EstimatePdfLine[] = rooms.flatMap((roomName, r) => titles.map((mainLineName, i) => {
    const quantity = 10 + r * 4 + i, ratePaise = 12500 + r * 1100 + i * 1500;
    return { source: "configuration", catalogueId: `config-${r}-${i}`, mainLineId: `line-${r}-${i}`, roomId: `room-${r}`, roomName,
      mainBasketId: `basket-${i % 2}`, mainBasketName: i % 2 ? "Finishes" : "Carpentry", mainLineName,
      specification: "Premium plywood, internal white laminate and external finish selected during design. Includes approved hardware and installation.",
      unit: "sqft", uomCode: "sqft", quantity, rate: ratePaise / 100, ratePaise, amount: quantity * ratePaise / 100, amountPaise: quantity * ratePaise, included: true };
  }));
  const subtotalPaise = lineItems.reduce((sum, line) => sum + line.amountPaise!, 0), gstPaise = Math.round(subtotalPaise * .18), totalPaise = subtotalPaise + gstPaise;
  return { id: "synthetic-proposal", version: 3, status: "sent_to_client", propertyType: "residential_apartment", subtotalPaise, gstPaise, totalPaise,
    subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100, lineItems,
    lead: { clientName: "Ananya Rao", clientEmail: "ananya@example.test", projectName: "Cedar Grove Residence", location: "Bengaluru" },
    proposal: createEstimateProposal({ issuedAt: new Date("2026-11-02T10:00:00.000Z"), projectNumber: "Lisno000125", estimateId: "synthetic-proposal", preparedBy: "Design Team" }) };
}
