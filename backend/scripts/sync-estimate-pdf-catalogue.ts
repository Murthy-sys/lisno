import { writeFile } from "node:fs/promises";

import { estimateBuilderSections } from "../../frontend/src/features/leads/estimateBuilderCatalogue.ts";

const entries = estimateBuilderSections.flatMap((section) =>
  section.rows.map((row) => [
    row.id,
    {
      sectionId: section.id,
      sectionLabel: section.label,
      description: row.description.replaceAll("—", "-").replaceAll("–", "-")
    }
  ])
);

const source = `export interface EstimatePdfCatalogueEntry {
  sectionId: string;
  sectionLabel: string;
  description: string;
}

export const estimatePdfCatalogue: ReadonlyMap<string, EstimatePdfCatalogueEntry> =
  new Map(${JSON.stringify(entries, null, 2)});
`;

await writeFile(
  new URL("../src/domain/estimate-pdf-catalogue.ts", import.meta.url),
  source
);
