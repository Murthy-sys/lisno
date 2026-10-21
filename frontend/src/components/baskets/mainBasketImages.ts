// Representative decoration: 15 photos generated with the built-in image tool on 2026-10-08.
// Materials and furnishings reuse configuration-header.webp and projects-living-room.webp.
// All local thumbnails are 320×320 WebP, encoded with cwebp at quality 78.
import popGypsum from "../../assets/main-baskets/pop-gypsum.webp";
import pendantLighting from "../../assets/main-baskets/pendant-lighting.webp";
import painting from "../../assets/main-baskets/painting.webp";
import generalTools from "../../assets/main-baskets/general-tools.webp";
import electricalSwitches from "../../assets/main-baskets/electrical-switches.webp";
import onSiteWoodwork from "../../assets/main-baskets/on-site-woodwork.webp";
import modularCabinetry from "../../assets/main-baskets/modular-cabinetry.webp";
import decorativeCeiling from "../../assets/main-baskets/decorative-ceiling.webp";
import materialSamples from "../../assets/main-baskets/material-samples.webp";
import interiorFurnishings from "../../assets/main-baskets/interior-furnishings.webp";
import lightFixtures from "../../assets/main-baskets/light-fixtures.webp";
import glassPartition from "../../assets/main-baskets/glass-partition.webp";
import glassStair from "../../assets/main-baskets/glass-stair.webp";
import acpFacade from "../../assets/main-baskets/acp-facade.webp";
import slattedCeiling from "../../assets/main-baskets/slatted-ceiling.webp";
import pvcCeiling from "../../assets/main-baskets/pvc-ceiling.webp";
import metalFraming from "../../assets/main-baskets/metal-framing.webp";

const normalizeLabel = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const categoryPhotos = new Map<string, string>();
function register(photo: string, labels: readonly string[]) {
  for (const label of labels) categoryPhotos.set(normalizeLabel(label), photo);
}

register(popGypsum, ["POP / Gypsum", "POP Gypsum", "POP", "Gypsum", "False ceiling"]);
register(pendantLighting, ["Functional Lights Supply and Installation", "Functional Lights Supply & Installation", "Functional Lighting", "Lighting", "Pendant Lighting"]);
register(painting, ["Painting", "Painting Works", "Paint"]);
register(generalTools, ["General Items", "General Works", "General Tools"]);
register(electricalSwitches, ["Electrical Works", "Electrical", "Electrical Items", "Switches"]);
register(onSiteWoodwork, ["On-Site Carpentry Works", "Onsite Carpentry Works", "On Site Carpentry", "Carpentry", "Woodwork"]);
register(modularCabinetry, ["Modular", "Modular Carpentry", "Modular Carpentry Works", "Modular Works", "Modular Kitchen", "Modular Cabinetry"]);
register(decorativeCeiling, ["Decorative Ceiling", "Decorative Ceilings", "Decorative Ceiling Works"]);
register(materialSamples, ["Material Samples", "Materials", "Samples", "Other Materials", "Building Material", "Building Materials"]);
register(interiorFurnishings, ["Interior Furnishings", "Furnishings", "Furnishing", "Furniture", "Soft Furnishings", "Interior Material", "Interior Materials"]);
register(lightFixtures, ["Supply of Light Fixtures", "Light Fixtures", "Lighting Fixtures", "Light Fittings"]);
register(glassPartition, ["Glass Work", "Glass Works", "Glass Partition", "Glass Partitions"]);
register(glassStair, ["GL", "Glass Stair", "Glass Stairs", "Glass Railing", "Glass Railings"]);
register(acpFacade, ["ACP", "ACP Work", "ACP Works", "ACP Cladding", "ACP Facade", "Aluminium Composite Panels", "Aluminum Composite Panels"]);
register(slattedCeiling, ["Ceiling work", "Ceiling works", "Slatted Ceiling", "Slatted Ceilings", "Wooden Ceiling", "Wooden Ceilings"]);
register(pvcCeiling, ["PVC Ceiling", "PVC Ceilings", "PVC Ceiling Works"]);
register(metalFraming, ["Aluminium / Metal work", "Aluminium / Metal works", "Aluminum / Metal work", "Metal Work", "Metal Works", "Metal Framing", "Aluminium Work", "Aluminium Works", "Aluminum Work", "Aluminum Works"]);

/** Decorative label aliases only. Basket IDs remain authoritative for all estimate operations. */
export function resolveMainBasketImage(name: string): string | null {
  return categoryPhotos.get(normalizeLabel(name)) ?? null;
}
