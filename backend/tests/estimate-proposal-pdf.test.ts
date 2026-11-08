import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { createEstimatePdfService } from "../src/services/estimate-pdf.service.js";
import { proposalPayments } from "../src/domain/estimate-proposal.js";
import { renderEstimateProposalPdf } from "../src/services/estimate-proposal-pdf/index.js";
import { money, proposalGroups } from "../src/services/estimate-proposal-pdf/content.js";
import { proposalFixture } from "./fixtures/estimate-proposal.js";

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
      expect(investment).toContain(money(gstPaise, false));
      expect(investment).toContain(money(totalPaise));
      if (roundOffPaise) {
        expect(investment).toContain(`${roundOffPaise < 0 ? "-" : "+"}${money(Math.abs(roundOffPaise))}`);
        expect(investment.indexOf("Round off")).toBeGreaterThan(investment.indexOf("GST"));
        expect(investment.indexOf("Round off")).toBeLessThan(investment.indexOf("Total payable"));
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
    expect(pdf.pages[6]).toContain(money(fixture.gstPaise!, false));
    for (const stage of proposalPayments(fixture.totalPaise!, fixture.proposal.terms.paymentStages)) expect(pdf.pages[7]).toContain(money(stage.amountPaise));
    expect(pdf.text).not.toContain("BY YOU");
    for (const bound of pdf.bounds) { expect(bound.x, bound.text).toBeGreaterThanOrEqual(45); expect(bound.x + bound.width, bound.text).toBeLessThan(550); expect(bound.y, bound.text).toBeGreaterThan(20); expect(bound.y, bound.text).toBeLessThan(820); }
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
    expect(pdf.text).toContain("Renée"); expect(pdf.text).toContain("नमन"); expect(pdf.text).toContain("Café cabinet"); expect(pdf.text).toContain("₹ 145.67"); expect(pdf.text).toContain("123.45");
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
    fixture.lineItems = [{ ...fixture.lineItems[0], roomName: label, amountPaise: 9_007_199_254_740_991 }];
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
    expect(pdf.text).toContain("labour ₹ 23.45"); expect(pdf.text).toContain("material ₹ 100"); expect(pdf.text).toContain("total ₹ 123.45");
    expect(pdf.text).toContain("L 1.2345 × W 1 × H 9 ft"); expect(pdf.text).toContain("1.235");
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
