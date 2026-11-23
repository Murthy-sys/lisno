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

/** Unequal PMC rows use saved 20% and 15% shares; currency values are in paise. */
export function pmcProposalFixture(mixed = false): EstimatePdfInput & { proposal: EstimateProposalMetadata } {
  const fixture = proposalFixture();
  const subtotalPaise = mixed ? 210013 : 185000, gstPaise = mixed ? 37802 : 33300;
  const totalPaise = mixed ? 247800 : 218300, roundOffPaise = mixed ? -15 : 0;
  const taxBasis = { subtotalPaise, gstPaise };
  fixture.lineItems = [
    { ...fixture.lineItems[0], mainLineName: "PMC ceiling", quantity: 10, ratePaise: 10000, rate: 100, amountPaise: 100000, amount: 1000,
      pricingMode: "pmc", pmcVendorPayable: true,
      pmcPaymentSplit: { version: 1, marginBps: 2000, vendorAmountPaise: 100000, lisnoAmountPaise: 25000, estimatedValuePaise: 125000,
        vendorPayablePaise: 118000, lisnoPayablePaise: 29500, totalPayablePaise: 147500, taxBasis } },
    { ...fixture.lineItems[6], mainLineName: "PMC installation", quantity: 1.25, ratePaise: 68000, rate: 680, amountPaise: 85000, amount: 850,
      pricingMode: "pmc", pmcVendorPayable: true,
      pmcPaymentSplit: { version: 1, marginBps: 1500, vendorAmountPaise: 85000, lisnoAmountPaise: 15000, estimatedValuePaise: 100000,
        vendorPayablePaise: 100300, lisnoPayablePaise: 17700, totalPayablePaise: 118000, taxBasis } }
  ];
  if (mixed) fixture.lineItems.push({ ...fixture.lineItems[0], mainLineId: "non-pmc-paint", mainLineName: "Non-PMC painting", pricingMode: "sub_vendor", pmcVendorPayable: undefined,
    pmcPaymentSplit: undefined, quantity: 1, ratePaise: 25013, rate: 250.13, amountPaise: 25013, amount: 250.13 });
  return { ...fixture, subtotalPaise, gstPaise, totalPaise, roundOffPaise, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100,
    pmcPaymentSummary: { version: 1, vendorPayablePaise: 218300, lisnoPayablePaise: 47200, pmcTotalPayablePaise: 265500,
      otherWorkPayablePaise: mixed ? 29515 : 0, nonPmcMilestoneBasisPaise: mixed ? 29515 : 0, roundOffPaise, customerTotalPayablePaise: mixed ? 295000 : 265500 } };
}
