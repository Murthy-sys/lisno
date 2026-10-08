import type { EstimationCatalogueBasket, EstimationModeBaseRatesPaise, EstimationRecommendationRule } from "../../features/leads/estimationCatalogueApi";
import type { ConfiguredEstimateLine, ConfiguredEstimateLineInput, EstimateDraft, EstimateDraftInput } from "../../features/leads/leadsApi";

const uom = { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 };
const initialCatalogue: EstimationCatalogueBasket[] = [{
  id: "basket-ceiling", name: "False ceiling", displayOrder: 1, directTemporaryItems: [],
  subBaskets: [{ id: "sub-ceiling", basketId: "basket-ceiling", name: "Ceiling finishes", displayOrder: 1, temporaryItems: [],
    mainLines: [
      { id: "line-ceiling", name: "False ceiling", modeBaseRatesPaise: { pmc: 12_000, sub_vendor: 15_000, in_house: 18_000 } },
      { id: "line-missing", name: "Ceiling detail with missing PMC price", modeBaseRatesPaise: { pmc: null, sub_vendor: 4_000, in_house: 5_000 } },
      { id: "line-zero", name: "Ceiling allowance with zero PMC price", modeBaseRatesPaise: { pmc: 0, sub_vendor: 1_000, in_house: 2_000 } }
    ].map((line, index) => ({ ...line, mainLineId: line.id, basketId: "basket-ceiling", subBasketId: "sub-ceiling", itemType: "main_line" as const,
      displayOrder: index + 1, revisionId: `revision-${line.id}`, itemStatus: "active" as const, revisionStatus: "draft" as const,
      itemVersion: 2, revisionVersion: 3, inHouseBaseRatePaise: line.modeBaseRatesPaise.in_house, uom }))
  }]
}, {
  id: "basket-painting", name: "Painting", displayOrder: 2, directTemporaryItems: [],
  subBaskets: [{ id: "sub-painting", basketId: "basket-painting", name: "Ceiling painting", displayOrder: 1, temporaryItems: [],
    mainLines: [{ id: "line-painting", mainLineId: "line-painting", name: "False ceiling painting", basketId: "basket-painting", subBasketId: "sub-painting",
      itemType: "main_line", displayOrder: 1, revisionId: "revision-line-painting", itemStatus: "active", revisionStatus: "draft",
      itemVersion: 4, revisionVersion: 5, modeBaseRatesPaise: { pmc: 2_000, sub_vendor: 2_500, in_house: 3_000 }, inHouseBaseRatePaise: 3_000, uom }]
  }]
}];

/** Local-only mutable data for the explicitly gated mode-pricing browser scenario. */
export function createEnterpriseEstimateModes(options: { basketCards?: boolean; recommendationScroll?: boolean } = {}) {
  const catalogue = structuredClone(initialCatalogue);
  if (options.basketCards || options.recommendationScroll) {
    Object.assign(catalogue[0]!, { name: "POP / Gypsum", description: "POP, gypsum boards, related materials and installation items for false ceilings and wall finishes." });
    Object.assign(catalogue[1]!, { displayOrder: 3, description: "Interior and exterior painting works, primers, putty, paints and accessories." });
    catalogue.splice(1, 0, {
      id: "basket-lighting", name: "Functional Lights Supply and Installation", displayOrder: 2,
      description: "Supply and installation of functional lighting items including panels, downlights, and fixtures.",
      subBaskets: [], directTemporaryItems: []
    });
    catalogue.push(
      { id: "basket-general", name: "General Items", displayOrder: 4,
        description: "Miscellaneous and general items required for interior projects.", subBaskets: [], directTemporaryItems: [] },
      { id: "basket-electrical", name: "Electrical Works", displayOrder: 5,
        description: null, subBaskets: [], directTemporaryItems: [] },
      { id: "basket-carpentry", name: "On-Site Carpentry Works", displayOrder: 6,
        description: "On-site wooden carpentry, shutters, frames and custom woodwork.", subBaskets: [], directTemporaryItems: [] }
    );
  }
  if (options.recommendationScroll) {
    const appendLines = (basketId: string, subBasketId: string, name: string, entries: Array<[string, string]>) => {
      const basket = catalogue.find((item) => item.id === basketId)!;
      let subBasket = basket.subBaskets.find((item) => item.id === subBasketId);
      if (!subBasket) {
        subBasket = { id: subBasketId, basketId, name, displayOrder: basket.subBaskets.length + 1, mainLines: [], temporaryItems: [] };
        basket.subBaskets.push(subBasket);
      }
      for (const [id, lineName] of entries) {
        const base = 1_500 + (subBasket.mainLines.length + 1) * 175;
        subBasket.mainLines.push({ id, mainLineId: id, basketId, subBasketId, name: lineName, itemType: "main_line",
          displayOrder: subBasket.mainLines.length + 1, revisionId: `revision-${id}`, revisionVersion: 2, itemVersion: 3,
          itemStatus: "active", revisionStatus: "draft", uom,
          modeBaseRatesPaise: { pmc: base, sub_vendor: base + 500, in_house: base + 1_000 }, inHouseBaseRatePaise: base + 1_000 });
      }
    };
    appendLines("basket-ceiling", "sub-ceiling", "Ceiling finishes", [
      ["line-probable-source", "Ambient ceiling details"],
      ["line-required-source", "Recessed ceiling support"],
      ["line-mixed-source", "Decorative ceiling assembly"],
      ["line-cove", "Cove in Gypsum"],
      ["line-unavailable-source", "Restored ceiling border"]
    ]);
    appendLines("basket-painting", "sub-painting", "Ceiling painting", [
      ["line-paint-primer", "Interior ceiling primer"], ["line-paint-putty", "Wall surface preparation and putty"],
      ["line-paint-accent", "Accent wall painting"], ["line-paint-protection", "Finished surface protection"]
    ]);
    appendLines("basket-lighting", "sub-lighting", "Functional lights", [
      ["line-subbasket-source", "Decorative wall lighting"], ["line-lighting-regular", "Ceiling downlights"],
      ["line-lighting-track", "Adjustable track lighting"], ["line-lighting-pendant", "Pendant light installation"],
      ["line-lighting-sconce", "Wall-mounted reading light installation"]
    ]);
    appendLines("basket-lighting", "sub-lighting-additions", "Integrated lighting additions", [
      ["line-lighting-driver", "Dimmable lighting driver"],
      ["line-lighting-channel", "Recessed aluminium lighting channel with diffuser, connectors and concealed mounting accessories"]
    ]);
    appendLines("basket-general", "sub-general", "General works", [
      ["line-general-cleaning", "Site cleaning"], ["line-general-protection", "Floor protection"],
      ["line-general-delivery", "Material handling"], ["line-general-access", "Access preparation"], ["line-general-disposal", "Debris disposal"]
    ]);
    appendLines("basket-electrical", "sub-electrical", "Electrical provisions", [
      ["line-electrical-wiring", "Concealed electrical wiring"], ["line-electrical-socket", "Power socket provision"],
      ["line-electrical-switch", "Lighting switch provision"], ["line-electrical-data", "Data point provision"],
      ["line-electrical-testing", "Electrical continuity testing"]
    ]);
    appendLines("basket-carpentry", "sub-carpentry", "Woodwork installation", [
      ["line-carpentry-trim", "Timber wall trim"], ["line-carpentry-frame", "Decorative timber frame"],
      ["line-carpentry-panel", "Wall panelling installation"], ["line-carpentry-hardware", "Cabinet hardware fitting"],
      ["line-carpentry-finish", "Final timber finish inspection"]
    ]);
  }
  const sources = () => catalogue.flatMap((basket) => basket.subBaskets.flatMap((subBasket) => subBasket.mainLines.map((line) => ({ basket, subBasket, line }))));
  function recommendationRules(mainLineId: string): EstimationRecommendationRule[] {
    if (!options.recommendationScroll) return [];
    const direct = (targetId: string, requirement: "must" | "can", reason: string): EstimationRecommendationRule => {
      const target = sources().find(({ line }) => line.mainLineId === targetId)!;
      return { id: `rule-${mainLineId}-${targetId}`, requirement, reason, targetKind: "main_line",
        targetBasketId: target.basket.id, targetSubBasketId: target.subBasket.id, targetMainLineId: targetId,
        targetRevisionId: target.line.revisionId, targetRevisionVersion: target.line.revisionVersion!, targetItemVersion: target.line.itemVersion!,
        available: true, completionRequired: false };
    };
    if (mainLineId === "line-ceiling" || mainLineId === "line-probable-source") {
      return [direct("line-cove", "can", "A gypsum cove can provide a concealed edge for ambient lighting.")];
    }
    if (mainLineId === "line-required-source") {
      return [direct("line-cove", "must", "This configured recessed support requires the gypsum cove assembly.")];
    }
    if (mainLineId === "line-mixed-source") {
      return [direct("line-painting", "must", "Complete the decorative assembly with its specified paint finish."),
        direct("line-cove", "can", "A cove is an optional addition to the decorative assembly.")];
    }
    if (mainLineId === "line-subbasket-source") {
      const basket = catalogue.find((item) => item.id === "basket-lighting")!;
      const subBasket = basket.subBaskets.find((item) => item.id === "sub-lighting-additions")!;
      return [{ id: "rule-lighting-additions", requirement: "can", reason: "Review the optional driver and concealed channel for dimmable wall lighting.",
        targetKind: "sub_basket", targetBasketId: basket.id, targetSubBasketId: subBasket.id, targetMainLineId: null,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null, available: true, completionRequired: false,
        unavailableChildCount: 0, children: subBasket.mainLines.map((line) => ({ mainLineId: line.mainLineId, available: true,
          completionRequired: false, revisionId: line.revisionId, revisionVersion: line.revisionVersion!, itemVersion: line.itemVersion! })) }];
    }
    if (mainLineId === "line-unavailable-source") {
      return [{ id: "rule-unavailable-border", requirement: "can", reason: "The configured heritage border accessory is currently unavailable.",
        targetKind: "main_line", targetBasketId: "basket-ceiling", targetSubBasketId: "sub-ceiling", targetMainLineId: "line-unavailable-border",
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null, available: false, completionRequired: true }];
    }
    return [];
  }
  function resolve(input: ConfiguredEstimateLineInput, index: number): ConfiguredEstimateLine {
    const source = sources().find(({ line }) => line.mainLineId === input.mainLineId);
    if (!source) throw new Error("Unknown synthetic Main Line.");
    const { basket, subBasket, line } = source;
    const pricingMode = input.classification === "standard" ? "sub_vendor" : input.pricingMode;
    const ratePaise = input.rateSource === "configuration" && pricingMode ? line.modeBaseRatesPaise?.[pricingMode] ?? null : input.ratePaise;
    if (ratePaise !== null && (!Number.isSafeInteger(ratePaise) || ratePaise < 0)) throw new Error("Invalid synthetic rate.");
    const quantityHundredths = Math.round(input.quantity * 100);
    if (!Number.isSafeInteger(quantityHundredths) || quantityHundredths < 0 || Math.abs(quantityHundredths / 100 - input.quantity) > 1e-9) throw new Error("Invalid synthetic quantity.");
    const amountPaise = ratePaise === null ? null : Number((BigInt(ratePaise) * BigInt(quantityHundredths) + 50n) / 100n);
    return { ...input, id: input.id ?? `qa-estimate-line-${index}`, itemType: "main_line", pricingMode,
      mainBasketId: basket.id, mainBasketName: basket.name, subBasketId: subBasket.id, subBasketName: subBasket.name,
      mainLineName: line.name, revisionId: line.revisionId, itemVersion: line.itemVersion, revisionVersion: line.revisionVersion,
      sourceItemVersion: line.itemVersion, sourceRevisionVersion: line.revisionVersion, sourceItemStatus: line.itemStatus, sourceRevisionStatus: line.revisionStatus,
      uomId: uom.id, uomName: uom.name, uomCode: uom.code, uomDecimalScale: uom.decimalScale,
      unit: uom.code, specification: null, ratePaise, rate: ratePaise === null ? null : ratePaise / 100,
      amountPaise, amount: amountPaise === null ? null : amountPaise / 100 };
  }
  function totals(lineItems: ConfiguredEstimateLine[]) {
    const subtotalPaise = lineItems.reduce((sum, line) => sum + (line.included ? line.amountPaise ?? 0 : 0), 0);
    const gstPaise = Number((BigInt(subtotalPaise) * 18n + 50n) / 100n);
    const totalPaise = subtotalPaise + gstPaise;
    return { subtotalPaise, gstPaise, totalPaise, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100 };
  }
  const initialLines = sources().map(({ basket, subBasket, line }, index) => resolve({
    source: "configuration", catalogueId: line.id, mainLineId: line.id, roomId: "living-room", roomName: "Living Room",
    mainBasketId: basket.id, subBasketId: subBasket.id, revisionId: line.revisionId, uomId: uom.id,
    classification: basket.id === "basket-ceiling" ? "special" : "standard",
    pricingMode: basket.id === "basket-ceiling" ? "pmc" : "sub_vendor", rateSource: "configuration", ratePaise: null,
    quantity: line.id === "line-ceiling" ? 10 : line.id === "line-painting" ? 20 : 1,
    included: line.id === "line-ceiling" || line.id === "line-painting"
  }, index));
  const scrollRooms = [
    { id: "living-room", typeId: "living", label: "Living Room", icon: "", sqft: 192, length: 16, width: 12 },
    { id: "master-bedroom", typeId: "master-bedroom", label: "Master Bedroom", icon: "", sqft: 143, length: 13, width: 11 }
  ];
  const scrollLines = options.recommendationScroll ? scrollRooms.flatMap((room, roomIndex) => sources().map(({ basket, subBasket, line }, index) => {
    const quantity = roomIndex === 0 ? line.id === "line-ceiling" ? 10 : 3 : line.id === "line-painting" ? 7 : 2;
    return resolve({ source: "configuration", catalogueId: line.id, mainLineId: line.id, roomId: room.id, roomName: room.label,
      mainBasketId: basket.id, subBasketId: subBasket.id, revisionId: line.revisionId, uomId: uom.id,
      classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", ratePaise: null, quantity,
      included: roomIndex === 0 ? ["line-ceiling", "line-general-cleaning"].includes(line.id)
        : ["line-painting", "line-carpentry-trim"].includes(line.id)
    }, roomIndex * sources().length + index);
  })) : [];
  const savedLines = options.recommendationScroll ? scrollLines : options.basketCards ? [] : initialLines;
  let draft: EstimateDraft = {
    id: "estimate-1", projectId: "project-1", version: 1, propertyType: "3BHK",
    rooms: options.recommendationScroll ? scrollRooms : [scrollRooms[0]!], scopes: [],
    selectedMainBasketIds: options.recommendationScroll ? catalogue.map((basket) => basket.id)
      : options.basketCards ? ["basket-ceiling"] : ["basket-ceiling", "basket-painting"],
    selectedMainBasketClassifications: options.recommendationScroll ? catalogue.map((basket) => ({ mainBasketId: basket.id, classification: "standard" }))
      : options.basketCards ? [{ mainBasketId: "basket-ceiling", classification: "standard" }]
      : [{ mainBasketId: "basket-ceiling", classification: "special" }, { mainBasketId: "basket-painting", classification: "standard" }],
    lineItems: savedLines, ...totals(savedLines), status: "draft", approvalRequired: false
  };
  return {
    read(path: string, params: URLSearchParams): unknown {
      if (path === "/leads/lead-1/estimate") {
        const lineItems = draft.lineItems.map((line, index) => resolve(line as ConfiguredEstimateLine, index));
        return { ...draft, lineItems, ...totals(lineItems) };
      }
      if (path === "/estimation/catalogue") return { items: catalogue, ineligibleLineCount: 0,
        pagination: { limit: 100, offset: 0, total: catalogue.length, hasMore: false } };
      if (path === "/estimation/catalogue/recommendations") return { sources: (params.get("mainLineIds") ?? "").split(",").filter(Boolean).map((mainLineId) => {
        const source = sources().find(({ line }) => line.mainLineId === mainLineId)?.line;
        return { mainLineId, available: Boolean(source), revisionId: source?.revisionId ?? null,
          revisionVersion: source?.revisionVersion ?? null, itemVersion: source?.itemVersion ?? null, rules: recommendationRules(mainLineId), guidance: [] };
      }) };
      return undefined;
    },
    save(body: unknown) {
      const input = body as EstimateDraftInput;
      if (!input || !Array.isArray(input.lineItems) || !Array.isArray(input.rooms) || !Array.isArray(input.scopes) ||
        input.lineItems.some((line) => line.source !== "configuration")) throw new Error("Invalid synthetic configured estimate.");
      if (input.expectedVersion !== draft.version) throw new Error("The synthetic estimate version changed. Reload the draft.");
      const lineItems = input.lineItems.map((line, index) => resolve(line as ConfiguredEstimateLineInput, index));
      draft = { ...draft, ...input, version: (draft.version ?? 0) + 1, lineItems, ...totals(lineItems) };
      return structuredClone(draft);
    },
    updateConfiguration(detail: unknown) {
      const change = detail as { mainLineId?: string; modeBaseRatesPaise?: EstimationModeBaseRatesPaise } | null;
      const line = sources().find(({ line }) => line.mainLineId === change?.mainLineId)?.line;
      const rates = change?.modeBaseRatesPaise;
      if (!line || !rates || !["pmc", "sub_vendor", "in_house"].every((mode) => {
        const value = rates[mode as keyof EstimationModeBaseRatesPaise];
        return value === null || Number.isSafeInteger(value) && value >= 0;
      })) return;
      line.modeBaseRatesPaise = { ...rates };
      line.inHouseBaseRatePaise = rates.in_house;
      line.revisionVersion = (line.revisionVersion ?? 0) + 1;
    }
  };
}
