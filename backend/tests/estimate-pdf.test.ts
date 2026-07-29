import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { estimateBuilderSections } from "../../frontend/src/features/leads/estimateBuilderCatalogue.ts";
import { estimatePdfCatalogue } from "../src/domain/estimate-pdf-catalogue.js";
import {
  createEstimatePdfService,
  type EstimatePdfInput
} from "../src/services/estimate-pdf.service.js";

const backendLogo = readFileSync(
  new URL("../src/assets/lisno-logo.svg", import.meta.url)
);

const fixture: EstimatePdfInput = {
  id: "estimate-pdf-1",
  version: 3,
  status: "sent_to_client",
  propertyType: "residential_apartment",
  subtotal: 9_500,
  gst: 1_710,
  total: 11_210,
  lineItems: [
    {
      catalogueId: "FC01",
      roomName: "Living room",
      specification: "Gypsum plain",
      unit: "sqft",
      rate: 95,
      quantity: 100,
      included: true,
      amount: 9_500
    },
    {
      catalogueId: "FL01",
      roomName: "Guest bedroom",
      specification: "Vitrified tiles 800×800",
      unit: "sqft",
      rate: 180,
      quantity: 120,
      included: false,
      amount: 21_600
    }
  ],
  lead: {
    clientName: "Aurora Homes",
    clientEmail: "projects@aurorahomes.example",
    projectName: "Aurora Villa",
    location: "Bengaluru"
  }
};

async function readPdf(bytes: Buffer) {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(
      new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)
    )
  }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" ")
    );
  }

  return {
    pageCount: pdf.numPages,
    pageTexts,
    text: pageTexts.join(" ")
  };
}

describe("estimate PDF catalogue", () => {
  it("exactly matches every normalized frontend catalogue entry", () => {
    const expectedEntries = estimateBuilderSections.flatMap((section) =>
      section.rows.map((row) => [
        row.id,
        {
          sectionId: section.id,
          sectionLabel: section.label,
          description: row.description.replaceAll("—", "-").replaceAll("–", "-")
        }
      ] as const)
    );
    const expectedIds = expectedEntries.map(([id]) => id);

    expect(new Set(expectedIds).size).toBe(expectedIds.length);
    expect(estimatePdfCatalogue.size).toBe(expectedEntries.length);
    expect([...estimatePdfCatalogue.keys()].sort()).toEqual([...expectedIds].sort());
    for (const [id, expected] of expectedEntries) {
      expect(estimatePdfCatalogue.get(id)).toEqual(expected);
    }
  });
});

describe("estimate PDF service", () => {
  it("uses the exact frontend Lisno logo asset", () => {
    expect(backendLogo).toEqual(
      readFileSync(new URL("../../frontend/public/lisno-logo.svg", import.meta.url))
    );
  });

  it("generates a branded estimate containing only included line items", async () => {
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });

    const result = await service.generate(fixture);
    const pdf = await readPdf(result.bytes);

    expect(result.filename).toBe("lisno-aurora-villa-estimate-v3.pdf");
    expect(result.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.text).toContain("Interior Estimate");
    expect(pdf.text).toContain("Aurora Villa");
    expect(pdf.text).toContain("Aurora Homes");
    expect(pdf.text).toContain("projects@aurorahomes.example");
    expect(pdf.text).toContain("Residential Apartment");
    expect(pdf.text).toContain("estimate-pdf-1 / v3");
    expect(pdf.text).toContain("Sent To Client");
    expect(pdf.text).toContain("29 Jul 2026");
    expect(pdf.text).toContain("False ceiling - main area");
    expect(pdf.text).toContain("Living room");
    expect(pdf.text).toContain("INR 95");
    expect(pdf.text).toContain("INR 9,500");
    expect(pdf.text).toContain("Subtotal");
    expect(pdf.text).toContain("GST @ 18%");
    expect(pdf.text).toContain("Final total");
    expect(pdf.text).toContain("Valid for 30 days");
    expect(pdf.text).toContain("Rates are subject to material market changes");
    expect(pdf.text).toContain("Final scope depends on site measurement");
    expect(pdf.text).toContain("GST is applied as shown");
    expect(pdf.text).toContain("Lisno Interiors");
    expect(pdf.text).toContain("Page 1 of");
    expect(pdf.text).not.toContain("Floor finish");
    expect(pdf.text).not.toContain("Guest bedroom");
  });

  it("loads the backend logo asset when no logo override is provided", async () => {
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z")
    });

    const result = await service.generate(fixture);

    expect(result.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("falls back to the estimate ID when the project name has no safe filename characters", async () => {
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });

    const result = await service.generate({
      ...fixture,
      lead: {
        ...fixture.lead,
        projectName: "नमस्ते"
      }
    });

    expect(result.filename).toBe("lisno-estimate-pdf-1-estimate-v3.pdf");
  });

  it("preserves wrapped quantity and financial columns without clipping", async () => {
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });
    const result = await service.generate({
      ...fixture,
      lineItems: [
        {
          ...fixture.lineItems[0],
          unit: "square feet measured on finished floor area",
          rate: 123_456_789_012,
          quantity: 12_345.67,
          amount: 1_000_000_000_000_000_000_000_000
        }
      ]
    });

    const pdf = await readPdf(result.bytes);
    const compactText = pdf.text.replaceAll(" ", "");

    expect(compactText).toContain("squarefeetmeasuredonfinishedfloorarea");
    expect(compactText).toContain("INR1,23,45,67,89,012");
    expect(compactText).toContain("INR10,00,00,00,00,00,00,00,00,00,00,000");
  });

  it("bounds long overview fields before drawing the line-item table", async () => {
    const repeatedProject = Array.from(
      { length: 90 },
      () => "Aurora exceptionally detailed residence"
    ).join(" ");
    const repeatedClient = Array.from(
      { length: 70 },
      () => "Aurora Homes and Extended Family"
    ).join(" ");
    const repeatedLocation = Array.from(
      { length: 80 },
      () => "Bengaluru Karnataka India"
    ).join(" ");
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });

    const result = await service.generate({
      ...fixture,
      lead: {
        ...fixture.lead,
        projectName: repeatedProject,
        clientName: repeatedClient,
        location: repeatedLocation
      }
    });
    const pdf = await readPdf(result.bytes);

    expect(pdf.pageCount).toBe(1);
    expect(pdf.pageTexts[0]).toContain("Interior Estimate");
    expect(pdf.pageTexts[0]).toContain("Description");
    expect(pdf.pageTexts[0]).toContain("False ceiling - main area");
    expect(pdf.pageTexts[0]).toContain("Final total");
    expect(pdf.pageTexts[0]).toContain("Page 1 of 1");
  });

  it("splits an extreme single row across branded pages with repeated headings", async () => {
    const specification = `${Array.from(
      { length: 160 },
      (_, index) => `handcrafted-detail-${index + 1}`
    ).join(" ")} END-OF-SPECIFICATION`;
    const roomName = `${Array.from(
      { length: 100 },
      (_, index) => `family-room-zone-${index + 1}`
    ).join(" ")} END-OF-ROOM`;
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });

    const result = await service.generate({
      ...fixture,
      lineItems: [
        {
          ...fixture.lineItems[0],
          roomName,
          specification
        }
      ]
    });
    const pdf = await readPdf(result.bytes);
    const compactText = pdf.text.replaceAll(" ", "");

    expect(pdf.pageCount).toBeGreaterThan(1);
    expect(compactText.match(/handcrafted-detail-/g)?.length).toBe(160);
    expect(compactText).toContain("END-OF-SPECIFICATION");
    expect(compactText).toContain("END-OF-ROOM");
    for (const pageText of pdf.pageTexts) {
      expect(pageText).toContain("Interior Estimate");
      if (pageText.includes("handcrafted-detail-") || pageText.includes("END-OF-ROOM")) {
        expect(pageText).toContain("False Ceiling");
        for (const heading of ["Description", "Room", "Qty", "Unit rate", "Line total"]) {
          expect(pageText).toContain(heading);
        }
      }
    }
  });

  it("paginates long estimates and repeats table structure on continued pages", async () => {
    const repeatedLines = Array.from({ length: 80 }, (_, index) => ({
      ...fixture.lineItems[0],
      roomName: `Living room ${index + 1}`
    }));
    const longFixture: EstimatePdfInput = {
      ...fixture,
      subtotal: 760_000,
      gst: 136_800,
      total: 896_800,
      lineItems: repeatedLines
    };
    const service = createEstimatePdfService({
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      logoSvg: backendLogo
    });

    const result = await service.generate(longFixture);
    const pdf = await readPdf(result.bytes);

    expect(pdf.pageCount).toBeGreaterThanOrEqual(2);
    const lineItemPages = pdf.pageTexts.filter((pageText) =>
      pageText.includes("Living room")
    );
    expect(lineItemPages.length).toBeGreaterThanOrEqual(2);
    for (const pageText of lineItemPages) {
      expect(pageText).toContain("False Ceiling");
      for (const heading of ["Description", "Room", "Qty", "Unit rate", "Line total"]) {
        expect(pageText).toContain(heading);
      }
    }
    expect(pdf.text).toContain(`Page 1 of ${pdf.pageCount}`);
    expect(pdf.text).toContain(`Page ${pdf.pageCount} of ${pdf.pageCount}`);
  });
});
