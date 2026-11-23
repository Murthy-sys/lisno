import { toEstimateAggregatePricing } from "../src/domain/estimate-aggregate-pricing.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { createEstimatePdfService } from "../src/services/estimate-pdf.service.js";
import { proposalPayments } from "../src/domain/estimate-proposal.js";
import { renderEstimateProposalPdf } from "../src/services/estimate-proposal-pdf/index.js";
import { money, proposalGroups } from "../src/services/estimate-proposal-pdf/content.js";
import { pmcProposalFixture, proposalFixture } from "./fixtures/estimate-proposal.js";

async function readPdf(bytes: Buffer) {
  const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages: string[] = [], bounds: Array<{ page: number; text: string; x: number; y: number; width: number }> = [];
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i), content = await page.getTextContent();
    expect(page.view[2]).toBeCloseTo(595.28, 1); expect(page.view[3]).toBeCloseTo(841.89, 1);
    pages.push(content.items.flatMap(item => "str" in item ? [item.str] : []).join(" ").replace(/\s+/gu, " "));
    for (const item of content.items) if ("str" in item && item.str.trim()) bounds.push({ page: i, text: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
  }
  await document.destroy();
  return { pages, bounds, text: pages.join(" ") };
}

describe("reference proposal booklet", () => {
  it.each([[2_222, 33, 14_600], [2_205, -50, 14_500], [2_255, 0, 14_600]])(
    "shows the saved final adjustment without changing GST (%i paise)", async (gstPaise, roundOffPaise, totalPaise) => {
      const fixture = proposalFixture();
      Object.assign(fixture, { subtotal: 123.45, subtotalPaise: 12_345, gst: gstPaise / 100, gstPaise,
        total: totalPaise / 100, totalPaise, roundOffPaise });
      const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
      const investment = pdf.pages.find(text => text.includes("Total payable"))!;
      expect(investment).not.toMatch(/\bGST\b/);
      expect(investment).toContain(money(totalPaise));
      if (roundOffPaise) {
        expect(investment).toContain(`${roundOffPaise < 0 ? "-" : "+"}${money(Math.abs(roundOffPaise))}`);
        expect(investment.indexOf("Round off")).toBeGreaterThan(investment.indexOf("Total payable"));
      } else expect(investment).not.toContain("Round off");
      for (const bound of pdf.bounds) expect(bound.x + bound.width, bound.text).toBeLessThan(550);
      await expect(renderEstimateProposalPdf({ ...fixture, roundOffPaise: roundOffPaise + 1 })).rejects.toThrow("totals do not reconcile");
    });

  it("renders the complete twelve-page composition with exact saved financial amounts and embedded searchable text", async () => {
    const fixture = proposalFixture();
    const { bytes } = await createEstimatePdfService().generate(fixture);
    const pdf = await readPdf(bytes);
    expect(pdf.pages).toHaveLength(12);
    ["A home,", "Dear Ananya Rao,", "Scope of work", "Detailed estimate", "Detailed estimate, continued", "Detailed estimate, continued", "Your project price", "Payment schedule", "From first sketch to handover", "What's not included", "Terms & specifications", "Let's begin"].forEach((title, i) => expect(pdf.pages[i]).toContain(title));
    expect(pdf.text).toContain(fixture.proposal.reference);
    expect(pdf.pages[6]).toContain(money(fixture.totalPaise!));
    expect(pdf.pages[6]).not.toContain(money(fixture.gstPaise!, false));
    for (const stage of proposalPayments(fixture.totalPaise!, fixture.proposal.terms.paymentStages)) expect(pdf.pages[7]).toContain(money(stage.amountPaise));
    expect(pdf.text).not.toContain("BY YOU");
    for (const bound of pdf.bounds) { expect(bound.x, bound.text).toBeGreaterThanOrEqual(45); expect(bound.x + bound.width, bound.text).toBeLessThan(550); expect(bound.y, bound.text).toBeGreaterThan(20); expect(bound.y, bound.text).toBeLessThan(820); }
  });
  it("quotes the saved PMC vendor payable per sqft and reconciles a mixed quotation", async () => {
    const fixture = proposalFixture();
    const pmc = { ...fixture.lineItems[0], pricingMode: "pmc" as const, pmcVendorPayable: true as const, unit: "sqft", quantity: 10,
      ratePaise: 10000, rate: 100, amountPaise: 100000, amount: 1000 };
    Object.assign(fixture, { subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000, roundOffPaise: 0 });
    fixture.lineItems = [pmc];
    const groups = proposalGroups(fixture);
    expect(groups[0]?.lines[0]).toMatchObject({ quantity: "10", unit: "sqft", rate: "118", amountPaise: 118000 });
    const vendorQuote = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(vendorQuote.text).toContain("Payable to vendor");
    expect(vendorQuote.text).toContain("₹ 1,180");
    expect(vendorQuote.text).not.toMatch(/excluding GST|PMC margin|GST @/i);
    const historical = await readPdf(await renderEstimateProposalPdf({ ...fixture, lineItems: [{ ...pmc, pmcVendorPayable: undefined }] }));
    expect(historical.text).toContain("Total payable");
    expect(historical.text).not.toContain("Payable to vendor");
    expect(historical.text).toContain("₹ 1,180");
    fixture.lineItems.push({ ...pmc, pmcVendorPayable: undefined, mainLineId: "paint", pricingMode: "sub_vendor", quantity: 1.25, rate: 0.1, ratePaise: 10, amount: 0.13, amountPaise: 13 });
    Object.assign(fixture, { subtotalPaise: 100013, gstPaise: 18002, totalPaise: 118000, roundOffPaise: -15 });
    expect(proposalGroups(fixture)[0]?.amountPaise).toBe(118015);
    const mixed = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(mixed.text).toContain("Total payable");
    expect(mixed.text).not.toContain("Payable to vendor");
    expect(mixed.text).toContain("-₹ 0.15");
  });
  it("shows each saved PMC share and recipient total without a PMC booking milestone", async () => {
    const fixture = pmcProposalFixture();
    const groups = proposalGroups(fixture);
    expect(groups.map(group => group.amountPaise)).toEqual([147500, 118000]);
    expect(groups[0].lines[0]).toMatchObject({ rate: "Vendor\n118", amountPaise: 147500 });
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("PMC estimated value: ₹ 1,475");
    expect(pdf.text).toContain("Payable to Lisno · 20% of estimated value: ₹ 295");
    expect(pdf.text).toContain("Payable to vendor · remaining 80%: ₹ 1,180");
    expect(pdf.text).toContain("Payable to Lisno · 15% of estimated value: ₹ 177");
    expect(pdf.text).toContain("Payable to vendor · remaining 85%: ₹ 1,003");
    expect(pdf.text).toContain("Percentage applied before tax; amounts include all taxes.");
    const investment = pdf.pages.find(text => text.includes("Your project price"))!;
    expect(investment).toContain("PMC payable to Lisno ₹ 472");
    expect(investment).toContain("PMC payable to vendors ₹ 2,183");
    expect(investment).toContain("Total PMC estimated value ₹ 2,655");
    expect(pdf.pages[1]).toContain("₹ 2,655");
    expect(pdf.pages.at(-1)).toContain("Total customer payable, including all taxes ₹ 2,655");
    expect(pdf.text).not.toMatch(/Booking advance|Five stages|stage 01|stage 02|PAYMENT STAGES/);
    expect(pdf.text).toContain("No PMC payment dates are specified in this proposal.");
    for (const bound of pdf.bounds) { expect(bound.y, `${bound.page}: ${bound.text}`).toBeGreaterThan(20); expect(bound.x + bound.width, bound.text).toBeLessThan(550); }
  });
  it("uses only non-PMC work for mixed milestones and retains a separate signed adjustment", async () => {
    const fixture = pmcProposalFixture(true);
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    const investment = pdf.pages.find(text => text.includes("Your project price"))!;
    expect(investment).toContain("Non-PMC work ₹ 295.15");
    expect(investment).toContain("Round off -₹ 0.15");
    expect(investment).toContain("Total customer payable ₹ 2,950");
    const schedule = pdf.pages.filter(text => text.includes("Non-PMC payment schedule")).join(" ");
    expect(schedule).toContain("Five stages apply only to non-PMC work of ₹ 295.15");
    for (const stage of proposalPayments(29515, fixture.proposal.terms.paymentStages)) expect(schedule).toContain(money(stage.amountPaise));
    expect(pdf.pages.at(-1)).toContain("Booking advance (non-PMC stage 01) ₹ 29.51");
    expect(pdf.pages.at(-1)).toContain("Total customer payable, including all taxes ₹ 2,950");
    expect(pdf.pages[1]).toContain("₹ 2,950");
    for (const bound of pdf.bounds) { expect(bound.y, `${bound.page}: ${bound.text}`).toBeGreaterThan(20); expect(bound.x + bound.width, bound.text).toBeLessThan(550); }
  });
  it("preserves the full PMC payment summary when all item details are hidden", async () => {
    const fixture = pmcProposalFixture(true);
    fixture.lineItems = [];
    fixture.includedPayablesPaise = [];
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).not.toMatch(/PMC ceiling|PMC installation|Non-PMC painting|20% of estimated value|15% of estimated value/);
    expect(pdf.text).toContain("PMC payable to Lisno ₹ 472");
    expect(pdf.text).toContain("PMC payable to vendors ₹ 2,183");
    expect(pdf.text).toContain("Total customer payable ₹ 2,950");
    expect(pdf.text).toContain("Area totals cover visible items; these payables cover the complete estimate.");
  });
  it("continues long PMC detail without losing the saved split and rejects invalid present evidence", async () => {
    const fixture = pmcProposalFixture();
    fixture.lineItems[0].specification = `${"A detailed saved PMC specification and installation requirement. ".repeat(180)}PMC SPECIFICATION END`;
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("PMC SPECIFICATION END");
    expect(pdf.text.match(/Payable to Lisno · 20% of estimated value: ₹ 295/gu)).toHaveLength(1);
    expect(pdf.pages.filter(text => text.includes("Detailed estimate")).length).toBeGreaterThan(2);
    for (const bound of pdf.bounds) { expect(bound.y, `${bound.page}: ${bound.text}`).toBeGreaterThan(20); expect(bound.x + bound.width, bound.text).toBeLessThan(550); }
    fixture.pmcPaymentSummary!.customerTotalPayablePaise += 1;
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("PMC payments do not reconcile");
  });
  it("uses stable room identifiers, preserves caller-authorized included rows, and does not invent a customer supplied scope", async () => {
    const fixture = proposalFixture(), a = fixture.lineItems[0], b = fixture.lineItems[1];
    fixture.lineItems = [{ ...a, roomId: "one", roomName: "Bedroom", mainLineName: "Visible saved item" }, { ...b, roomId: "two", roomName: "Bedroom", mainLineName: "Staff-authorized saved item", ...{ clientVisible: false } }, { ...a, included: false, mainLineName: "Unselected private item" }];
    expect(proposalGroups(fixture).map(group => group.id)).toEqual(["room:one", "room:two"]);
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("Visible saved item"); expect(pdf.text).toContain("Staff-authorized saved item");
    expect(pdf.text).not.toContain("Unselected private item"); expect(pdf.text).not.toContain("BY YOU");
    expect(pdf.text).toContain(money(fixture.totalPaise!));
  });
  it("continues a very long saved item without clipping or dropping its ending", async () => {
    const fixture = proposalFixture();
    fixture.lineItems = [{ ...fixture.lineItems[0], mainLineName: "Detailed custom joinery", specification: `${"Carefully measured cabinetry with approved finishes and hardware. ".repeat(180)}FINAL SPECIFICATION SENTINEL`, estimateNotes: ["UnbrokenReference".repeat(35)] }];
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("FINAL SPECIFICATION SENTINEL");
    expect(pdf.pages.filter(text => text.includes("Detailed estimate")).length).toBeGreaterThan(2);
    for (const bound of pdf.bounds.filter(item => item.page >= 4 && item.text.includes("Carefully"))) expect(bound.y).toBeGreaterThan(60);
  });
  it("retains paise, accent and Devanagari text with packaged fonts", async () => {
    const fixture = proposalFixture(); fixture.lead.clientName = "Renée नमन";
    fixture.lineItems = [{ ...fixture.lineItems[0], mainLineName: "Café cabinet", quantity: 1, ratePaise: 12345, amountPaise: 12345, rate: 1, amount: 1 }];
    fixture.subtotalPaise = 12345; fixture.gstPaise = 2222; fixture.totalPaise = 14567;
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("Renée"); expect(pdf.text).toContain("नमन"); expect(pdf.text).toContain("Café cabinet"); expect(pdf.text).toContain("₹ 145.67"); expect(pdf.text).not.toContain("123.45");
  });
  it("continues unusually long frozen workflow and commercial terms within page bounds", async () => {
    const fixture = proposalFixture(), terms = fixture.proposal.terms;
    const body = `${"A saved project term with specific scope and material requirements. ".repeat(27)} COMMERCIAL END`;
    fixture.proposal = { ...fixture.proposal, terms: { ...terms,
      clauses: terms.clauses.map((row, i) => i ? row : { ...row, body }),
      exclusions: terms.exclusions.map((row, i) => i ? row : { ...row, body }),
      materials: terms.materials.map((row, i) => i ? row : { ...row, specification: body }),
      workflow: terms.workflow.map((row, i) => i ? row : { ...row, steps: [body, body] }),
      paymentStages: terms.paymentStages.map((row, i) => i ? row : { ...row, description: body, trigger: body })
    } };
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text.match(/COMMERCIAL END/gu)?.length).toBe(7);
    for (const bound of pdf.bounds) { expect(bound.y, bound.text).toBeGreaterThan(20); expect(bound.x + bound.width, bound.text).toBeLessThan(550); }
  });
  it("bounds long group and client/project identities and rejects pathological room labels", async () => {
    const fixture = proposalFixture();
    const label = "Long residence name ".repeat(10).slice(0, 200);
    fixture.lead.clientName = label; fixture.lead.projectName = label;
    fixture.lineItems = [{ ...fixture.lineItems[0], roomName: label, amountPaise: 7_000_000_000_000_000 }];
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    for (const bound of pdf.bounds) { expect(bound.y, `${bound.page}: ${bound.text}`).toBeGreaterThan(7); expect(bound.x + bound.width, `${bound.page}: ${bound.text}`).toBeLessThan(550); }
    fixture.lineItems = Array.from({ length: 6 }, (_, i) => ({ ...fixture.lineItems[0], roomId: `long-room-${i}`, roomName: "W".repeat(200), amountPaise: 100 }));
    const wide = await readPdf(await renderEstimateProposalPdf(fixture));
    for (const bound of wide.bounds) expect(bound.y, `${bound.page}: ${bound.text}`).toBeGreaterThan(7);
    fixture.lineItems[0].roomName = "Long room description ".repeat(80);
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("room name is too long");
  });
  it("rejects corrupt logo artwork instead of producing an incomplete brand", async () => {
    await expect(renderEstimateProposalPdf(proposalFixture(), { logoSvg: Buffer.from("invalid logo") })).rejects.toThrow();
  });
  it("prints saved component money and dimensional precision, rejecting inconsistent snapshots", async () => {
    const fixture = proposalFixture();
    const component = { ...fixture.lineItems[0], pricingBasis: "in_house_components_v1" as const, pricingMode: "in_house" as const,
      rateSource: "configuration" as const, modeTier: "signature" as const, mainLineId: "component-line", revisionId: "saved-revision",
      sourceItemVersion: 2, sourceRevisionVersion: 3, uomId: "sqft", uomDecimalScale: 3, uomCode: "sqft", quantity: 1.235,
      rate: null, ratePaise: null, amount: 123.45, amountPaise: 12345, selectedInHouseComponentIds: ["part-one"],
      dimensionsMandatory: true, dimensions: { length: "1.2345", width: "1", height: "9" },
      dimensionRule: { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "sqft", decimalScale: 3 },
      componentPricing: { formulaVersion: "in_house_components_v1" as const, mainLineId: "component-line", revisionId: "saved-revision", sourceItemVersion: 2, sourceRevisionVersion: 3,
        modeTier: "signature" as const, quantity: "1.235", uom: { id: "sqft", code: "sqft", name: "Square feet", decimalScale: 3 }, selectedComponentIds: ["part-one"],
        components: [{ id: "part-one", basketId: "basket-one", subBasketId: null, basketName: "Saved carpentry", subBasketName: null, laborSellingPaise: 2345, materialSellingPaise: 10000, totalPaise: 12345 }],
        totalPaise: 12345, inputFingerprint: "a".repeat(64) } };
    fixture.lineItems = [component];
    const pdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(pdf.text).toContain("labour ₹ 27.67"); expect(pdf.text).toContain("material ₹ 118"); expect(pdf.text).toContain("total ₹ 145.67");
    expect(pdf.text).toContain("L 1.2345 × W 1 × H 9 ft"); expect(pdf.text).toContain("1.235");
    const { componentPricing, selectedInHouseComponentIds: _selected, ...aggregateLine } = component;
    fixture.lineItems = [{ ...aggregateLine, aggregatePricing: toEstimateAggregatePricing(componentPricing) }];
    const aggregatePdf = await readPdf(await renderEstimateProposalPdf(fixture));
    expect(aggregatePdf.text).not.toContain("Price including margin");
    expect(aggregatePdf.text).not.toMatch(/Saved carpentry|labour ₹ 27.67|material ₹ 118|part-one/);
    expect(fixture.lineItems[0].amountPaise).toBe(12345);
    fixture.lineItems = [{ ...component, amountPaise: 12346 }];
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("component amounts");
    fixture.lineItems = [{ ...component, quantity: 11.111 }];
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("invalid saved item details");
  });
  it("fails explicitly for unsupported glyphs and inconsistent saved totals", async () => {
    const fixture = proposalFixture(); fixture.lead.clientName = "Client 漢字";
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("unsupported");
    fixture.lead.clientName = "Sample Client"; fixture.totalPaise! += 1;
    await expect(renderEstimateProposalPdf(fixture)).rejects.toThrow("reconcile");
  });
});
