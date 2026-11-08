import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { renderEstimateTierComparisonPdf, type EstimateTierComparison } from "../src/services/estimate-tier-comparison.service.js";

function fixture(count = 2): EstimateTierComparison {
  return {
    mainBasketId: "basket", subBasketId: "sub", roomId: "room", roomName: "Living room",
    mainBasketName: "Carpentry", subBasketName: "Storage units", estimateVersion: 3,
    tiers: (["current", "signature", "premium", "functional"] as const).map((modeTier, index) => ({
      modeTier, label: ["Mode", "Signature", "Premium", "Functional"][index]!, available: true, subtotalPaise: 456_789 + index,
      lines: Array.from({ length: count }, (_, line) => ({ mainLineId: `line-${line}`, name: `Cabinet line ${String(line + 1).padStart(3, "0")}`,
        quantity: 12.345, uomName: "sq-ft", ratePaise: 12_345 + index, amountPaise: 152_399 + index, unavailableReason: null }))
    }))
  };
}
async function readPdf(bytes: Buffer) {
  const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages: string[] = [], bounds: Array<{ page: number; text: string; x: number; y: number; width: number }> = [];
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index), content = await page.getTextContent();
    expect(page.view[2]).toBeCloseTo(841.89, 1); expect(page.view[3]).toBeCloseTo(595.28, 1);
    pages.push(content.items.flatMap(item => "str" in item ? [item.str] : []).join(" ").replace(/\s+/gu, " "));
    for (const item of content.items) if ("str" in item && item.str.trim()) {
      bounds.push({ page: index, text: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
    }
  }
  await document.destroy();
  return { pages, bounds, text: pages.join(" ") };
}
function expectInsidePage(bounds: Awaited<ReturnType<typeof readPdf>>["bounds"]) {
  for (const bound of bounds) {
    expect(bound.x, bound.text).toBeGreaterThanOrEqual(31);
    expect(bound.x + bound.width, bound.text).toBeLessThan(811);
    expect(bound.y, bound.text).toBeGreaterThan(24);
    expect(bound.y, bound.text).toBeLessThan(569);
  }
  // Adjacent cells at the same baseline must not run into each other.
  for (const bound of bounds) {
    const next = bounds.filter(other => other.page === bound.page && Math.abs(other.y - bound.y) < 0.2 && other.x > bound.x + 0.1)
      .sort((left, right) => left.x - right.x)[0];
    if (next) expect(bound.x + bound.width, `${bound.text} / ${next.text}`).toBeLessThanOrEqual(next.x + 0.5);
  }
}

describe("tier comparison PDF presentation", () => {
  it("renders the proposal sections and preserves exact tier prices", async () => {
    const comparison = fixture();
    comparison.tiers[0]!.subtotalPaise = Number.MAX_SAFE_INTEGER;
    const pdf = await readPdf(await renderEstimateTierComparisonPdf(comparison));
    expect(pdf.pages).toHaveLength(4);
    expect(pdf.pages[0]).toContain("Tier comparison");
    expect(pdf.pages[0]).toContain("Living room");
    expect(pdf.pages[0]).toContain("Illustrative interior");
    expect(pdf.pages[1]).toContain("Same scope, different tiers");
    expect(pdf.pages[2]).toContain("Commercial summary");
    expect(pdf.pages[2]).toContain("Difference from Mode");
    expect(pdf.pages[2]).toContain("Total excluding GST");
    expect(pdf.pages[3]?.replace(/\s/gu, "")).toMatch(/Billofquantities/iu);
    for (const label of ["Item", "Unit", "Mode", "Signature", "Premium", "Functional", "Qty", "Rate", "Amount", "Sub-basket subtotal", "Excluding GST"])
      expect(pdf.pages[3]).toContain(label);
    expect(pdf.text.indexOf("Mode")).toBeLessThan(pdf.text.indexOf("Signature"));
    expect(pdf.text.indexOf("Signature")).toBeLessThan(pdf.text.indexOf("Premium"));
    expect(pdf.text.indexOf("Premium")).toBeLessThan(pdf.text.indexOf("Functional"));
    expect(pdf.text).toContain("12.345"); expect(pdf.text).toContain("123.45"); expect(pdf.text).toContain("1,523.99");
    expect(pdf.text).toContain("9,00,71,99,25,47,409.91");
    expect(pdf.text).not.toMatch(/margin|profit/iu);
    expectInsidePage(pdf.bounds);
  });

  it("labels component-derived rates and unavailable prices without inventing zero amounts", async () => {
    const comparison = fixture(1);
    comparison.tiers[0]!.lines[0]!.ratePaise = null;
    Object.assign(comparison.tiers[2]!.lines[0]!, { ratePaise: null, amountPaise: null, unavailableReason: "Select approved components before calculating this tier." });
    Object.assign(comparison.tiers[2]!, { available: false, subtotalPaise: null });
    const pdf = await readPdf(await renderEstimateTierComparisonPdf(comparison));
    expect(pdf.text).toContain("Selected components");
    expect(pdf.text).toContain("Incomplete");
    expect(pdf.text).toContain("Select approved components before calculating this tier.");
    expect(pdf.text).not.toContain("0.00");
    expectInsidePage(pdf.bounds);
  });

  it("repeats headers and numbers pages while continuing long names and reasons without clipping", async () => {
    const comparison = fixture(35);
    comparison.tiers.forEach(tier => { tier.lines[0]!.name = `${"Detailed joinery with custom internal storage. ".repeat(80)}NAME END SENTINEL`; });
    Object.assign(comparison.tiers[3]!.lines[0]!, {
      amountPaise: null, unavailableReason: `${"Choose the approved destination components and review their availability. ".repeat(90)}REASON END SENTINEL`
    });
    comparison.tiers[3]!.subtotalPaise = null;
    const pdf = await readPdf(await renderEstimateTierComparisonPdf(comparison));
    expect(pdf.pages.length).toBeGreaterThan(6);
    expect(pdf.text).toContain("NAME END SENTINEL");
    expect(pdf.text).toContain("REASON END SENTINEL");
    expect(pdf.text).toContain("Cabinet line 035");
    expect(pdf.text.match(/Sub-basket subtotal/gu)).toHaveLength(1);
    pdf.pages.slice(3).forEach((page, index) => {
      expect(page).toContain("Item"); expect(page).toContain("Signature"); expect(page).toContain("Rate");
      expect(page).toContain(`Page ${index + 3} of ${pdf.pages.length - 1}`);
    });
    expectInsidePage(pdf.bounds);
  });
});
