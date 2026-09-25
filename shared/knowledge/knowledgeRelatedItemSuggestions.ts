import type { KnowledgeBasket, KnowledgeItemListItem, KnowledgeSubBasket } from "./knowledgeTypes";

/** Editorial suggestions, never persistent catalog identities or scope instructions. */
export interface KnowledgeRelatedItemSuggestion {
  readonly key: string;
  readonly basketName: string;
  readonly subBasketName: string;
  readonly name: string;
  readonly guidance: string;
}

export const KNOWLEDGE_RELATED_ITEM_SUGGESTIONS: readonly KnowledgeRelatedItemSuggestion[] = Object.freeze([
  {
    key: "electrical-recessed-led-downlight",
    basketName: "Electrical",
    subBasketName: "Ceiling lighting",
    name: "Recessed LED downlight",
    guidance: "A recessed ceiling fitting may need removal or a replacement mounting arrangement if its supporting ceiling is removed."
  },
  {
    key: "electrical-adjustable-recessed-spotlight",
    basketName: "Electrical",
    subBasketName: "Ceiling lighting",
    name: "Adjustable recessed spotlight",
    guidance: "Coordinate recessed mounting and aiming with the ceiling and the intended accent target."
  },
  {
    key: "electrical-ceiling-cove-led-strip",
    basketName: "Electrical",
    subBasketName: "Cove lighting",
    name: "LED strip light for ceiling cove",
    guidance: "Relevant where an actual cove or recess is part of the design; removing that cove prompts a lighting review."
  },
  {
    key: "electrical-surface-mounted-ceiling-light",
    basketName: "Electrical",
    subBasketName: "Ceiling lighting",
    name: "Surface-mounted ceiling light",
    guidance: "A possible alternative when the design moves away from recessed fittings; confirm a suitable mounting location."
  },
  {
    key: "gypsum-cove-detail",
    basketName: "POP / Gypsum",
    subBasketName: "Ceiling details",
    name: "Gypsum cove detail",
    guidance: "The architectural recess is a separate scope item from the light fitting."
  },
  {
    key: "gypsum-ceiling-service-access-panel",
    basketName: "POP / Gypsum",
    subBasketName: "Service access",
    name: "Ceiling service access panel",
    guidance: "Consider where concealed services require access; removing a ceiling may change that access arrangement."
  },
  {
    key: "modular-soft-close-cabinet-hinges",
    basketName: "Modular",
    subBasketName: "Kitchen hardware",
    name: "Soft-close cabinet hinge set",
    guidance: "Relevant to hinged cabinet shutters; confirm the actual shutter and hardware design and whether the fitting is already included."
  },
  {
    key: "modular-soft-close-drawer-runners",
    basketName: "Modular",
    subBasketName: "Kitchen hardware",
    name: "Soft-close drawer runner set",
    guidance: "Relevant to the associated drawer; confirm whether already included in the cabinet package."
  },
  {
    key: "modular-pull-out-kitchen-storage",
    basketName: "Modular",
    subBasketName: "Kitchen storage",
    name: "Pull-out kitchen storage unit",
    guidance: "An optional cabinet-specific storage accessory, not mandatory for every kitchen; check existing package inclusions."
  },
  {
    key: "modular-lift-up-shutter-fitting",
    basketName: "Modular",
    subBasketName: "Overhead cabinet hardware",
    name: "Lift-up cabinet shutter fitting",
    guidance: "Relevant only to a lift-up shutter configuration; check whether the cabinet package already includes the fitting."
  },
  {
    key: "carpentry-wardrobe-hanging-rail",
    basketName: "On Site Carpentry",
    subBasketName: "Wardrobe fittings",
    name: "Wardrobe hanging rail",
    guidance: "Relevant to a hanging compartment and unnecessary for a shelves-only compartment; check existing wardrobe inclusions."
  },
  {
    key: "carpentry-pull-out-wardrobe-basket",
    basketName: "On Site Carpentry",
    subBasketName: "Wardrobe fittings",
    name: "Pull-out wardrobe basket",
    guidance: "An optional accessory for the corresponding wardrobe compartment; check whether already included in the wardrobe package."
  }
].map((suggestion) => Object.freeze(suggestion)));

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * Names classify editorial content only. Catalog context is restricted by real IDs;
 * a suggestion is never converted into a saved item or selected automatically.
 * Callers must provide every catalog page and status before setting catalogReady.
 */
export function relatedItemSuggestions({ basket, subBasket, subBasketId, items, catalogReady }: {
  readonly basket: KnowledgeBasket | undefined;
  readonly subBasket: KnowledgeSubBasket | undefined;
  readonly subBasketId: string;
  readonly items: readonly KnowledgeItemListItem[];
  readonly catalogReady: boolean;
}): readonly KnowledgeRelatedItemSuggestion[] {
  if (!catalogReady || !basket) return [];
  if (subBasketId && (!subBasket || subBasket.id !== subBasketId || subBasket.basketId !== basket.id)) return [];

  const basketName = normalized(basket.name);
  const selectedSubName = subBasketId && subBasket ? normalized(subBasket.name) : null;

  return KNOWLEDGE_RELATED_ITEM_SUGGESTIONS.filter((suggestion) => {
    const suggestedSubName = normalized(suggestion.subBasketName);
    if (normalized(suggestion.basketName) !== basketName) return false;
    if (selectedSubName !== null && suggestedSubName !== selectedSubName) return false;

    return !items.some((item) => {
      if (item.basketId !== basket.id || (item.itemType ?? "main_line") !== "main_line") return false;
      if (normalized(item.mainLineName) !== normalized(suggestion.name)) return false;
      if (subBasketId && item.subBasketId !== subBasketId) return false;

      // An ID-matched selected sub-basket can supply a name absent from list data.
      const itemSubName = item.subBasketName ?? (
        subBasket?.basketId === basket.id && item.subBasketId === subBasket.id ? subBasket.name : null
      );
      return itemSubName !== null && normalized(itemSubName) === suggestedSubName;
    });
  });
}
