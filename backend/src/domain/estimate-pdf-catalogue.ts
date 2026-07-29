export interface EstimatePdfCatalogueEntry {
  sectionId: string;
  sectionLabel: string;
  description: string;
}

export const estimatePdfCatalogue: ReadonlyMap<string, EstimatePdfCatalogueEntry> =
  new Map([
  [
    "FC01",
    {
      "sectionId": "FC",
      "sectionLabel": "False Ceiling",
      "description": "False ceiling - main area"
    }
  ],
  [
    "FC02",
    {
      "sectionId": "FC",
      "sectionLabel": "False Ceiling",
      "description": "Cove / pelmet boxing"
    }
  ],
  [
    "FC03",
    {
      "sectionId": "FC",
      "sectionLabel": "False Ceiling",
      "description": "Faux beam / design element"
    }
  ],
  [
    "FL01",
    {
      "sectionId": "FL",
      "sectionLabel": "Flooring",
      "description": "Floor finish"
    }
  ],
  [
    "FL02",
    {
      "sectionId": "FL",
      "sectionLabel": "Flooring",
      "description": "Skirting"
    }
  ],
  [
    "FL03",
    {
      "sectionId": "FL",
      "sectionLabel": "Flooring",
      "description": "Wall dado / bathroom wall tile"
    }
  ],
  [
    "CA01",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "TV unit"
    }
  ],
  [
    "CA02",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Wardrobe"
    }
  ],
  [
    "CA03",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Storage / loft"
    }
  ],
  [
    "CA04",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Wall paneling"
    }
  ],
  [
    "CA05",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Bed with storage"
    }
  ],
  [
    "CA06",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Study / bookcase unit"
    }
  ],
  [
    "CA07",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Dresser / vanity"
    }
  ],
  [
    "CA08",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Shoe rack / console"
    }
  ],
  [
    "CA09",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Modular kitchen"
    }
  ],
  [
    "CA10",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Kitchen island / breakfast bar"
    }
  ],
  [
    "CA11",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Crockery / display unit"
    }
  ],
  [
    "CA12",
    {
      "sectionId": "CA",
      "sectionLabel": "Carpentry",
      "description": "Pooja unit"
    }
  ],
  [
    "PA01",
    {
      "sectionId": "PA",
      "sectionLabel": "Painting",
      "description": "Wall & ceiling paint"
    }
  ],
  [
    "PA02",
    {
      "sectionId": "PA",
      "sectionLabel": "Painting",
      "description": "Texture / feature wall"
    }
  ],
  [
    "PA03",
    {
      "sectionId": "PA",
      "sectionLabel": "Painting",
      "description": "Wallpaper"
    }
  ],
  [
    "EL01",
    {
      "sectionId": "EL",
      "sectionLabel": "Electrical",
      "description": "Light / fan / switch points"
    }
  ],
  [
    "EL02",
    {
      "sectionId": "EL",
      "sectionLabel": "Electrical",
      "description": "AC points (15A)"
    }
  ],
  [
    "EL03",
    {
      "sectionId": "EL",
      "sectionLabel": "Electrical",
      "description": "LED strip cove / cove lighting"
    }
  ],
  [
    "EL04",
    {
      "sectionId": "EL",
      "sectionLabel": "Electrical",
      "description": "Recessed spotlights"
    }
  ],
  [
    "EL05",
    {
      "sectionId": "EL",
      "sectionLabel": "Electrical",
      "description": "Geyser / exhaust point"
    }
  ],
  [
    "CV01",
    {
      "sectionId": "CV",
      "sectionLabel": "Civil & Plumbing",
      "description": "Waterproofing"
    }
  ],
  [
    "CV02",
    {
      "sectionId": "CV",
      "sectionLabel": "Civil & Plumbing",
      "description": "Bathroom plumbing - fittings"
    }
  ],
  [
    "CV03",
    {
      "sectionId": "CV",
      "sectionLabel": "Civil & Plumbing",
      "description": "EWC / WC"
    }
  ],
  [
    "CV04",
    {
      "sectionId": "CV",
      "sectionLabel": "Civil & Plumbing",
      "description": "Kitchen plumbing - sink"
    }
  ],
  [
    "LF01",
    {
      "sectionId": "LF",
      "sectionLabel": "Loose Furniture",
      "description": "Sofa"
    }
  ],
  [
    "LF02",
    {
      "sectionId": "LF",
      "sectionLabel": "Loose Furniture",
      "description": "Dining table + chairs"
    }
  ],
  [
    "LF03",
    {
      "sectionId": "LF",
      "sectionLabel": "Loose Furniture",
      "description": "Centre / coffee table"
    }
  ],
  [
    "LF04",
    {
      "sectionId": "LF",
      "sectionLabel": "Loose Furniture",
      "description": "Mattress"
    }
  ]
]);
