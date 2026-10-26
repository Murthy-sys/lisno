import type { EstimateComponentPricing, EstimateInHousePreviewLine } from "../../../../shared/estimation/estimateComponentPricing";
import type { ConfiguredEstimateLine, ConfiguredEstimateLineInput, EstimateDraft, EstimateDraftInput } from "../../features/leads/leadsApi";
import type { EstimationCatalogueBasket } from "../../features/leads/estimationCatalogueApi";
import type { ProcurementBasketDetail, ProcurementBasketList, ProcurementInHouseComponentBreakdown, ProcurementVendorCandidates } from "../../features/procurement/procurementBasketApi";

/** Synthetic values for the explicitly requested browser QA scenario. Never a production price source. */
export function createEnterpriseComponentAmounts() {
  const uom = { id: "component-uom", code: "SQFT", name: "sq ft", decimalScale: 2 };
  const components = [
    { id: "base", basketId: "basket-finishes", basketName: "Finishes", subBasketId: "sub-ceiling", subBasketName: "Ceiling", baseRatePaise: 30000 },
    { id: "paint", basketId: "basket-painting", basketName: "Painting", subBasketId: "sub-finish", subBasketName: "Decorative finish", baseRatePaise: 5000 }
  ];
  const mainLines = ["line-a", "line-b", "line-vendor"].map((id, index) => ({ id, mainLineId: id, basketId: "basket-source", subBasketId: "sub-source",
    name: ["Ceiling framework", "Cove installation", "Vendor protection"][index]!, displayOrder: index + 1, revisionId: `revision-${id}`,
    itemVersion: 2, revisionVersion: 3, itemType: "main_line" as const, itemStatus: "active" as const, revisionStatus: "draft" as const,
    modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null }, inHouseComponents: components, uom }));
  const catalogue: EstimationCatalogueBasket[] = [{ id: "basket-source", name: "Joinery", displayOrder: 1, subBaskets: [{ id: "sub-source", basketId: "basket-source", name: "Installation work", displayOrder: 1, mainLines, temporaryItems: [] }] }];
  function pricing(input: Pick<EstimateInHousePreviewLine, "mainLineId" | "quantity" | "selectedInHouseComponentIds">): EstimateComponentPricing {
    const quantityUnits = BigInt(Math.round(input.quantity * 100));
    const scope = (base: number, margin: number) => {
      const unit = input.quantity <= 1 ? BigInt(base) * 110n / 100n : BigInt(base);
      const subtotal = (unit * quantityUnits + 50n) / 100n;
      return Number((subtotal * 10000n + BigInt(10000 - margin) / 2n) / BigInt(10000 - margin));
    };
    const rows = components.filter(component => input.selectedInHouseComponentIds.includes(component.id)).map(component => {
      const other = input.mainLineId === "line-b";
      const laborSellingPaise = component.id === "paint" ? scope(2000, 0) : scope(other ? 5000 : 10000, other ? 0 : 2000);
      const materialSellingPaise = component.id === "paint" ? scope(3000, 0) : scope(other ? 10000 : 20000, other ? 0 : 2500);
      return { id: component.id, basketId: component.basketId, subBasketId: component.subBasketId, basketName: component.basketName, subBasketName: component.subBasketName,
        laborSellingPaise, materialSellingPaise, totalPaise: laborSellingPaise + materialSellingPaise };
    });
    return { formulaVersion: "in_house_components_v1", mainLineId: input.mainLineId, revisionId: `revision-${input.mainLineId}`,
      sourceItemVersion: 2, sourceRevisionVersion: 3, modeTier: "signature", quantity: String(input.quantity), uom,
      selectedComponentIds: input.selectedInHouseComponentIds, components: rows, totalPaise: rows.reduce((sum, row) => sum + row.totalPaise, 0),
      inputFingerprint: quantityUnits.toString(16).padStart(64, "0") };
  }
  function resolve(input: ConfiguredEstimateLineInput): ConfiguredEstimateLine {
    const source = mainLines.find(line => line.id === input.mainLineId)!;
    const calculated = input.included && input.pricingMode === "in_house" && input.rateSource === "configuration";
    const componentPricing = calculated ? pricing({ ...input, selectedInHouseComponentIds: input.selectedInHouseComponentIds ?? [] }) : undefined;
    const ratePaise = calculated ? null : input.rateSource === "configuration" ? source.modeBaseRatesPaise[input.pricingMode ?? "sub_vendor"] : input.ratePaise;
    const amountPaise = !input.included ? 0 : componentPricing?.totalPaise ?? (ratePaise === null ? null : Math.round(ratePaise * input.quantity));
    return { ...input, id: input.id ?? `saved-${source.id}`, mainBasketName: "Joinery", subBasketName: "Installation work", mainLineName: source.name,
      sourceItemVersion: 2, sourceRevisionVersion: 3, uomCode: uom.code, uomName: uom.name, uomDecimalScale: 2, unit: uom.name, specification: null,
      ratePaise, rate: ratePaise === null ? null : ratePaise / 100, amountPaise, amount: amountPaise === null ? null : amountPaise / 100,
      pricingBasis: calculated ? "in_house_components_v1" : undefined, componentPricing };
  }
  const totals = (rows: ConfiguredEstimateLine[]) => {
    const subtotalPaise = rows.reduce((sum, row) => sum + (row.included ? row.amountPaise ?? 0 : 0), 0), gstPaise = Math.round(subtotalPaise * .18);
    return { subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100 };
  };
  const initial = mainLines.map((line, index) => resolve({ source: "configuration", catalogueId: line.id, mainLineId: line.id,
    mainBasketId: line.basketId, subBasketId: line.subBasketId, roomId: "living-room", roomName: "Living Room", revisionId: line.revisionId,
    uomId: uom.id, itemVersion: 2, revisionVersion: 3, quantity: index === 1 ? 3 : 2, included: true, classification: "special",
    pricingMode: index === 2 ? "sub_vendor" : "in_house", rateSource: "configuration", ratePaise: null, modeTier: "signature",
    ...(index === 2 ? {} : { selectedInHouseComponentIds: index === 0 ? ["base", "paint"] : ["base"] }) }));
  let draft: EstimateDraft = { id: "estimate-components", version: 1, projectId: "project-one", propertyType: "3BHK",
    rooms: [{ id: "living-room", typeId: "living", label: "Living Room", length: 10, width: 12, sqft: 120 }], scopes: [],
    selectedMainBasketIds: ["basket-source"], selectedMainBasketClassifications: [{ mainBasketId: "basket-source", classification: "special" }],
    lineItems: initial, ...totals(initial), status: "draft", approvalRequired: false };
  const contribution = (row: ConfiguredEstimateLine, componentId: string) => {
    const component = row.componentPricing!.components.find(entry => entry.id === componentId)!;
    const other = row.mainLineId === "line-b", paint = componentId === "paint";
    return { sourceLineItemKey: row.id, componentId, roomId: row.roomId, quantity: String(row.quantity), unit: uom.name,
      laborAdjustedCostPaise: row.quantity * (paint ? 2000 : other ? 5000 : 10000), materialAdjustedCostPaise: row.quantity * (paint ? 3000 : other ? 10000 : 20000),
      laborSellingPaise: component.laborSellingPaise, materialSellingPaise: component.materialSellingPaise };
  };
  const breakdown: ProcurementInHouseComponentBreakdown = { complete: true, unavailableSourceLineItemKeys: [], adjustedCostPaise: 115000, sellingPaise: 133333,
    subBaskets: components.map(component => {
      const contributions = initial.filter(row => row.componentPricing?.selectedComponentIds.includes(component.id)).map(row => contribution(row, component.id));
      return { basketId: component.basketId, basketName: component.basketName, subBasketId: component.subBasketId, subBasketName: component.subBasketName,
        contributions, adjustedCostPaise: contributions.reduce((sum, row) => sum + row.laborAdjustedCostPaise + row.materialAdjustedCostPaise, 0),
        sellingPaise: contributions.reduce((sum, row) => sum + row.laborSellingPaise + row.materialSellingPaise, 0) };
    }) };
  const detail: ProcurementBasketDetail = { id: "basket-source", name: "Joinery", projectId: "project-one", classification: "special", automaticSubVendor: false,
    estimateSource: { estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: null }, preparationDigest: "a".repeat(64),
    boqReady: false, standardCost: null, includedLineCount: 3, readyLineCount: 3, approvedEstimatePaise: 137333, baseCostPaise: 119000, adjustedCostPaise: 119000,
    workingTotalPaise: 137333, workingTotalComplete: true, committedNetPaise: 0, state: "ready", inHouseComponentBreakdown: breakdown,
    lines: initial.map(row => ({ sourceLineItemKey: row.id, roomId: row.roomId, roomName: row.roomName, subBasketId: row.subBasketId, subBasketName: row.subBasketName,
      mainLineId: row.mainLineId, mainLineName: row.mainLineName, approvedQuantity: String(row.quantity), approvedUnit: uom.name, approvedAmountPaise: row.amountPaise,
      included: true, source: "configuration", baseUnitRatePaise: row.mainLineId === "line-a" ? 35000 : row.mainLineId === "line-b" ? 15000 : 2000, projectRate: { version: 0, overridePaise: null }, standardCost: null,
      estimateMode: { approvedClassification: "special", approvedPricingMode: row.pricingMode!, mode: row.pricingMode!, provenance: "line", issues: [] },
      mode: { state: "ready", decision: null, issues: [], options: [], availability: [], revision: { id: row.revisionId, version: 3, status: "draft", contentDigest: "a".repeat(64) }, uom, priceReferences: {},
        preview: { formulaVersion: "mode-margin-v2", mode: row.pricingMode!, quantity: String(row.quantity), quantityScale: 2,
          baseCostPaise: row.mainLineId === "line-a" ? 70000 : row.mainLineId === "line-b" ? 45000 : 4000,
          adjustedCostPaise: row.mainLineId === "line-a" ? 70000 : row.mainLineId === "line-b" ? 45000 : 4000,
          lowQuantityImpactPaise: 0, appliedImpactBps: null, sellingPaise: row.amountPaise!, finalVendorChargesPaise: null, floorSellingPaise: null,
          marginBps: null, discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
          settings: { scopes: [], configuredMarginBps: null, markupBasis: "starting" }, components: [] } }
    })) };
  const metrics = { includedLineCount: 2, boqReadyLineCount: 0, readinessPercent: 0, approvedEstimatePaise: 133333, currentCostPaise: 115000,
    currentCostComplete: true, unpricedLineCount: 0, committedNetPaise: 0, modeIssueCount: 0 };
  const list: ProcurementBasketList = { projectId: "project-one", estimateSource: detail.estimateSource, baskets: [detail], modeGroups: [{ ...metrics, mode: "in_house", basketCount: 1,
    baskets: [{ ...metrics, id: detail.id, name: detail.name, sourceLineItemKeys: initial.slice(0, 2).map(row => row.id) }], inHouseComponentBreakdown: breakdown },
      { ...metrics, mode: "sub_vendor", basketCount: 1, includedLineCount: 1, approvedEstimatePaise: 4000, currentCostPaise: 4000,
        baskets: [{ ...metrics, id: detail.id, name: detail.name, includedLineCount: 1, approvedEstimatePaise: 4000, currentCostPaise: 4000, sourceLineItemKeys: [initial[2]!.id] }] },
      { ...metrics, mode: "pmc", basketCount: 0, includedLineCount: 0, readinessPercent: null, approvedEstimatePaise: 0, currentCostPaise: 0, baskets: [] }] };
  return {
    read(path: string) {
      if (path === "/leads/lead-1/estimate") return draft;
      if (path === "/estimation/catalogue") return { items: catalogue, ineligibleLineCount: 0, pagination: { limit: 100, offset: 0, total: 1, hasMore: false } };
      if (path === "/estimation/catalogue/recommendations") return { sources: mainLines.map(line => ({ mainLineId: line.id, available: true, revisionId: line.revisionId, itemVersion: 2, revisionVersion: 3, rules: [], guidance: [] })) };
      if (path === "/procurement/projects/project-one/baskets") return list;
      if (path === "/procurement/projects/project-one/baskets/basket-source") return detail;
      if (path === "/projects/project-one/design-requirements") return { version: 0, sourceToken: "synthetic-empty", entries: [], blockers: [], canReadInternal: false };
      if (path === "/procurement/projects/project-one/baskets/basket-source/enquiries") return [];
      if (path === "/procurement/projects/project-one/baskets/basket-source/vendor-candidates") return {
        projectCity: { name: "Bengaluru", key: "bengaluru" }, items: [], total: 0, matchingVendorCount: 0,
        blockedReasonCounts: {}, limit: 50, offset: 0
      } satisfies ProcurementVendorCandidates;
      return undefined;
    },
    preview(body: { lines: EstimateInHousePreviewLine[] }) { return { lines: body.lines.map(line => ({ key: line.key, state: "ready", componentPricing: pricing(line), issues: [] })) }; },
    save(body: EstimateDraftInput) {
      if (body.expectedVersion !== draft.version) throw new Error("Synthetic estimate version changed.");
      const rows = body.lineItems.map(row => resolve(row as ConfiguredEstimateLineInput));
      draft = { ...draft, ...body, version: (draft.version ?? 0) + 1, lineItems: rows, ...totals(rows) };
      return draft;
    }
  };
}
