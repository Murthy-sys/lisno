export interface EstimateScopeCatalogueEntry {
  id: "FC" | "FL" | "LF" | "CA" | "CV" | "EL" | "PA";
  label: string;
  aliases: readonly string[];
}

export const estimateScopeCatalogue: readonly EstimateScopeCatalogueEntry[] = [
  { id: "FC", label: "False Ceiling", aliases: ["false ceiling", "ceiling plan", "rcp", "reflected ceiling"] },
  { id: "FL", label: "Flooring", aliases: ["flooring", "floor plan", "floor finish"] },
  { id: "LF", label: "Loose Furniture", aliases: ["loose furniture", "furniture layout"] },
  { id: "CA", label: "Carpentry", aliases: ["carpentry", "woodwork", "joinery"] },
  { id: "CV", label: "Civil", aliases: ["civil", "masonry"] },
  { id: "EL", label: "Electrical", aliases: ["electrical", "lighting", "power"] },
  { id: "PA", label: "Painting", aliases: ["painting", "paint"] }
];

export function isEstimateScopeId(value: string): value is EstimateScopeCatalogueEntry["id"] {
  return estimateScopeCatalogue.some((entry) => entry.id === value);
}
