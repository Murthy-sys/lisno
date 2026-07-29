import { mkdir, writeFile } from "node:fs/promises";

import {
  createEstimatePdfService,
  type EstimatePdfInput,
  type EstimatePdfLine
} from "../src/services/estimate-pdf.service.js";

const catalogueGroups = [
  ["FC01", "FC02", "FC03"],
  ["FL01", "FL02", "FL03"],
  ["CA06", "CA09", "CA10"],
  ["EL01", "EL03", "EL05"]
] as const;

const lineItems: EstimatePdfLine[] = catalogueGroups.flatMap(
  (catalogueIds, groupIndex) =>
    Array.from({ length: 9 }, (_, rowIndex) => {
      const itemIndex = groupIndex * 9 + rowIndex;
      const quantity = 18 + itemIndex * 2;
      const rate = 185 + groupIndex * 275 + rowIndex * 35;

      return {
        catalogueId: catalogueIds[rowIndex % catalogueIds.length],
        roomName: `Residence level ${groupIndex + 1} - extended family room zone ${rowIndex + 1}`,
        specification:
          "Premium-grade materials with coordinated edge detailing, concealed supports, protective finish, and final installation after verified site measurements.",
        unit: groupIndex === 2 ? "running feet" : "sqft",
        rate,
        quantity,
        included: true,
        amount: rate * quantity
      };
    })
);

const subtotal = lineItems.reduce((sum, line) => sum + line.amount, 0);
const gst = Math.round(subtotal * 0.18);
const fixture: EstimatePdfInput = {
  id: "estimate-visual-qa-2026-07-29",
  version: 7,
  status: "sent_to_client",
  propertyType: "residential_apartment",
  subtotal,
  gst,
  total: subtotal + gst,
  lineItems,
  lead: {
    clientName: "Ananya Rao and the Rao Extended Family",
    clientEmail: "ananya.rao@example.com",
    projectName:
      "The Courtyard House - Complete Interior Transformation for a Multi-Generational Bengaluru Residence",
    location: "Indiranagar, Bengaluru, Karnataka"
  }
};

const result = await createEstimatePdfService({
  now: () => new Date("2026-07-29T12:00:00.000Z")
}).generate(fixture);
const outputUrl = new URL(
  "../../output/pdf/lisno-estimate-sample.pdf",
  import.meta.url
);

await mkdir(new URL(".", outputUrl), { recursive: true });
await writeFile(outputUrl, result.bytes);

console.log(
  `Wrote ${result.bytes.length} bytes to ${outputUrl.pathname} (${lineItems.length} line items).`
);
