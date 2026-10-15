import { Bath, Bed, BedDouble, BedSingle, Briefcase, ChefHat, DoorOpen, Leaf, Pencil, ShowerHead, Sofa, type LucideIcon } from "lucide-react";
import type { RoomGroup } from "./RoomsMultiSelectDropdown";

export const MAX_BEDROOM_COUNT = 50;
export type EstimateRoomDefinition = {
  typeId: string;
  label: string;
  group: RoomGroup;
  sqft: number;
};

type SelectedRoom = { typeId: string; label: string };

export const normalizePropertyType = (propertyType: string) => propertyType.replace(/\s/g, "").toLowerCase();
export const requiresBedroomCount = (propertyType: string) => ["villa", "duplex", "penthouse"].includes(normalizePropertyType(propertyType));
export const isValidBedroomCount = (count: unknown): count is number => typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_BEDROOM_COUNT;
export function parseBedroomCount(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const count = Number(input);
  return isValidBedroomCount(count) ? count : null;
}

export function getBedroomCount(propertyType: string, explicitCount: number | null): number | null {
  if (requiresBedroomCount(propertyType)) return isValidBedroomCount(explicitCount) ? explicitCount : null;
  const fixedCounts: Record<string, number> = { "1bhk": 1, "2bhk": 2, "2.5bhk": 2, "3bhk": 3, "3.5bhk": 3, "4bhk": 4, studio: 0 };
  const normalized = normalizePropertyType(propertyType);
  return Object.hasOwn(fixedCounts, normalized) ? fixedCounts[normalized] : null;
}

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

export function getEstimateRoomDefinitions(propertyType: string, explicitCount: number | null): EstimateRoomDefinition[] {
  const definitions: EstimateRoomDefinition[] = [
    { typeId: "living", label: normalizePropertyType(propertyType) === "studio" ? "Living / Sleeping Area" : "Living & Dining", group: "Common Areas", sqft: 300 },
    { typeId: "kitchen", label: "Kitchen", group: "Common Areas", sqft: 120 },
    { typeId: "balcony", label: "Balcony / Utility", group: "Common Areas", sqft: 60 },
    { typeId: "foyer", label: "Foyer / Entrance", group: "Common Areas", sqft: 80 },
    { typeId: "study", label: "Home Office/Study", group: "Common Areas", sqft: 120 }
  ];
  const count = getBedroomCount(propertyType, explicitCount) ?? 0;
  for (let index = 1; index <= count; index += 1) {
    definitions.push(
      { typeId: index === 1 ? "master" : `bedroom${index}`, label: `Bedroom ${index}`, group: "Bedrooms", sqft: index === 1 ? 200 : index === 2 ? 150 : 130 },
      { typeId: `balcony_bedroom${index}`, label: `Bedroom ${index} Balcony`, group: "Bedrooms", sqft: 60 }
    );
  }
  definitions.push({ typeId: "bath_c", label: "Common Bathroom", group: "Bathrooms", sqft: 60 });
  for (let index = 1; index <= count; index += 1) {
    definitions.push({ typeId: index === 1 ? "bath_m" : `bath_bedroom${index}`, label: `Bedroom ${index} Bathroom`, group: "Bathrooms", sqft: index === 1 ? 80 : 60 });
  }
  definitions.push({ typeId: "custom", label: "Custom Room", group: "Other", sqft: 0 });
  return definitions;
}

// Saved labels participate in legacy item associations, so presentation never renames a saved room.
export function mergeSelectedRoomDefinitions(definitions: readonly EstimateRoomDefinition[], selected: readonly SelectedRoom[]): EstimateRoomDefinition[] {
  const selectedByType = new Map(selected.map((room) => [room.typeId, room]));
  const available = new Set(definitions.map((room) => room.typeId));
  return [
    ...definitions.map((definition) => ({ ...definition, label: selectedByType.get(definition.typeId)?.label ?? definition.label })),
    ...Array.from(selectedByType.values()).filter((room) => !available.has(room.typeId)).map((room) => ({
      typeId: room.typeId, label: room.label, group: "Previously selected" as const, sqft: 0
    }))
  ];
}
