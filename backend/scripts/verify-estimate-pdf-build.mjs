import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createEstimatePdfService } from "../dist/services/estimate-pdf.service.js";

const sourceLogo = await readFile(
  new URL("../src/assets/lisno-logo.svg", import.meta.url)
);
const compiledLogo = await readFile(
  new URL("../dist/assets/lisno-logo.svg", import.meta.url)
);
assert.deepEqual(compiledLogo, sourceLogo);

const service = createEstimatePdfService({
  now: () => new Date("2026-07-29T12:00:00.000Z")
});
const result = await service.generate({
  id: "compiled-estimate-pdf",
  version: 2,
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
    }
  ],
  lead: {
    clientName: "Aurora Homes",
    clientEmail: "projects@aurorahomes.example",
    projectName: "Aurora Villa",
    location: "Bengaluru"
  }
});

assert.equal(result.filename, "lisno-aurora-villa-estimate-v2.pdf");
assert.equal(result.bytes.subarray(0, 5).toString(), "%PDF-");
assert.ok(result.bytes.length > 1_000);

console.log(
  `Compiled estimate PDF verification passed (${result.bytes.length} bytes).`
);
