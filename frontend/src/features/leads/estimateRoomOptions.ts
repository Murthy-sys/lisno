import { Bath, Bed, BedDouble, BedSingle, Briefcase, ChefHat, DoorOpen, Leaf, Pencil, ShowerHead, Sofa, type LucideIcon } from "lucide-react";
export { MAX_BEDROOM_COUNT, normalizePropertyType, requiresBedroomCount, isValidBedroomCount, parseBedroomCount, getBedroomCount, getEstimateRoomDefinitions, mergeSelectedRoomDefinitions, type EstimateRoomDefinition } from "../../../../shared/estimation/estimateRoomOptions";

export function getRoomIcon(typeId: string): LucideIcon {
  if (typeId === "master") return BedDouble;
  if (typeId === "bedroom3") return BedSingle;
  if (/^bedroom\d+$/.test(typeId)) return Bed;
  if (typeId === "bath_m") return Bath;
  if (typeId === "bath_c" || /^bath_bedroom\d+$/.test(typeId)) return ShowerHead;
  if (typeId === "balcony" || /^balcony_bedroom\d+$/.test(typeId)) return Leaf;
  const icons: Record<string, LucideIcon> = { living: Sofa, kitchen: ChefHat, foyer: DoorOpen, study: Briefcase };
  return Object.hasOwn(icons, typeId) ? icons[typeId] : Pencil;
}
