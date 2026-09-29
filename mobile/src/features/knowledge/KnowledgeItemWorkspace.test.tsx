import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { KnowledgeItemWorkspace } from "./KnowledgeItemWorkspace";
import { newRecommendationRule } from "../../../../shared/knowledge/knowledgeRecommendationPresentation";
import { useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { ApiError } from "../../core/http/apiClient";
import type { AuthenticatedSession } from "../../contracts/session";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./knowledgeRuntime", () => ({ ...jest.requireActual("./knowledgeRuntime"), useKnowledgeContext: jest.fn() }));
jest.mock("../../navigation/useScreenBack", () => ({ useBackInterceptor: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("./KnowledgeModeEditor", () => ({ KnowledgeModeEditor: ({ payload, onChange, readOnly }: {
  payload: KnowledgeJsonObject; onChange: (value: KnowledgeJsonObject) => void; readOnly: boolean;
}) => {
  const { TextInput } = require("react-native") as typeof import("react-native");
  return <TextInput accessibilityLabel="Mode paragraph" value={typeof payload.modeDescription === "string" ? payload.modeDescription : ""}
    editable={!readOnly} onChangeText={value => onChange({ ...payload, modeDescription: value })} />;
} }));
jest.mock("./KnowledgeQualityEditor", () => ({ KnowledgeQualityEditor: () => null }));

const meta = { createdAt: "2026-09-25T00:00:00Z", updatedAt: "2026-09-25T00:00:00Z", createdById: "tester", updatedById: "tester" };
const revision = { id: "rev-a", status: "draft", revisionNumber: 2, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, ...meta };
const item = { mainLineId: "line-a", mainLineName: "Synthetic joinery", basketId: "basket-a", basketName: "Joinery", itemType: "main_line", status: "draft", version: 11, draftRevisionId: "rev-a", draftRevision: revision, activeRevisionId: null, activeRevision: null, allowedActions: ["update_section"], completeness: revision.completeness, blockers: [], warnings: [], ...meta } as unknown as KnowledgeItemDetail;
const uoms = [{ id: "area", name: "Square feet", status: "active", decimalScale: 2 }, { id: "number", name: "Number", status: "active", decimalScale: 0 }];
const page = (items: unknown[]) => ({ items, pagination: { offset: 0, limit: 100, total: items.length, hasMore: false } });
const section = (payload: KnowledgeJsonObject = { uomId: "area" }, version = 4) => ({ id: "section-a", revisionId: "rev-a", mainLineId: "line-a", sectionKey: "overview", version, payload, applicability: "configured", ...meta } as KnowledgeSectionEnvelope);

async function setup({ update = true, itemType = "main_line", advancedPayload = {}, advancedFailure = false, pricingPayload = {}, pricingFailure = false, pricingPending = false, recommendationsPayload = {}, recommendationsFailure = false, recommendationsPending = false }: {
  update?: boolean; itemType?: "main_line" | "temporary"; advancedPayload?: KnowledgeJsonObject; advancedFailure?: boolean; pricingPayload?: KnowledgeJsonObject; pricingFailure?: boolean; pricingPending?: boolean; recommendationsPayload?: KnowledgeJsonObject; recommendationsFailure?: boolean; recommendationsPending?: boolean;
} = {}) {
  let latestItem = { ...item, itemType } as KnowledgeItemDetail;
  let failAdvanced = advancedFailure;
  let failPricing = pricingFailure;
  let pricingError: Error = new Error("Unavailable");
  let failRecommendations = recommendationsFailure;
  let releasePricingLoad: () => void = () => {};
  const pricingLoad = pricingPending ? new Promise<void>(resolve => { releasePricingLoad = resolve; }) : Promise.resolve();
  let releaseRecommendationLoad: () => void = () => {};
  const recommendationLoad = recommendationsPending ? new Promise<void>(resolve => { releaseRecommendationLoad = resolve; }) : Promise.resolve();
  const sections = new Map<string, KnowledgeSectionEnvelope>([
    ["overview", section()],
    ["advanced", { ...section(advancedPayload), sectionKey: "advanced" }],
    ["pricing", { ...section(pricingPayload), sectionKey: "pricing" }],
    ["recommendations", { ...section(recommendationsPayload), sectionKey: "recommendations", applicability: itemType === "temporary" ? "not_applicable" : "not_configured" }]
  ]);
  const updateSection = jest.fn(async (_id, _rev, key, body) => {
    const previous = sections.get(key)!;
    const saved = { ...previous, payload: body.payload, version: body.expectedVersion + 1, applicability: key === "recommendations" && Array.isArray(body.payload.budgetAlterations) && body.payload.budgetAlterations.length ? "configured" : body.applicability } as KnowledgeSectionEnvelope;
    sections.set(key, saved);
    latestItem = { ...latestItem, version: body.expectedAggregateVersion + 1 };
    return { ...saved, aggregateVersion: latestItem.version };
  });
  const api = {
    getKnowledgeItem: jest.fn(async () => latestItem), getKnowledgeHistory: jest.fn(async () => page([revision])),
    getKnowledgeSection: jest.fn(async (_id, _rev, key) => { if (key === "advanced" && failAdvanced) throw new Error("Unavailable"); if (key === "pricing") { await pricingLoad; if (failPricing) throw pricingError; } if (key === "recommendations") { await recommendationLoad; if (failRecommendations) throw new Error("Unavailable"); } return sections.get(key)!; }),
    listKnowledgeMasters: jest.fn(async type => page(type === "uoms" ? uoms : [])),
    listKnowledgeBaskets: jest.fn(async () => page([{ id: "basket-a", name: "Joinery", status: "active" }])),
    listKnowledgeItems: jest.fn(async () => page([{ ...item, mainLineId: "line-b", mainLineName: "Frame kit", itemType: "main_line", status: "active", version: 1 }])),
    listKnowledgeSubBaskets: jest.fn(async () => page([])),
    getKnowledgeBasketQuality: jest.fn(async () => ({ basketId: "basket-a", parameters: [], version: 1 })), updateKnowledgeSection: updateSection
  };
  const context = { api, key: (...parts: unknown[]) => ["knowledge", ...parts], scopeKey: "test:user", ready: true, canRead: true, canUpdate: update, canCreate: false, canLifecycle: false, canCreateQualityOptions: false, refresh: jest.fn(async () => undefined) } as unknown as KnowledgeMobileContext;
  jest.mocked(useKnowledgeContext).mockReturnValue(context);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onBack = jest.fn();
  await render(<QueryClientProvider client={client}><KnowledgeItemWorkspace session={{} as AuthenticatedSession} mainLineId="line-a" onBack={onBack} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }).props.accessibilityState.disabled).toBe(!update));
  return { api, context, client, onBack, setSection: (value: KnowledgeSectionEnvelope) => { sections.set(value.sectionKey, value); }, setItem: (value: KnowledgeItemDetail) => { latestItem = value; client.setQueryData(context.key("detail", "line-a"), value); }, setAdvancedFailure: (value: boolean) => { failAdvanced = value; }, setPricingFailure: (value: boolean, cause: Error = new Error("Unavailable")) => { failPricing = value; pricingError = cause; }, releasePricingLoad, setRecommendationFailure: (value: boolean) => { failRecommendations = value; }, releaseRecommendationLoad };
}
async function editUom() {
  await fireEvent.press(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Number" }));
}
beforeEach(() => jest.clearAllMocks());

it("uses captured versions after background refresh and guards leaving unsaved Overview", async () => {
  const test = await setup();
  await editUom();
  await act(async () => { test.client.setQueryData(test.context.key("detail", "line-a"), { ...item, version: 22 }); });
  await fireEvent.press(screen.getByRole("button", { name: "Back to Main Baskets" }));
  expect(test.onBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(test.onBack).toHaveBeenCalledTimes(1));
  expect(test.api.updateKnowledgeSection).toHaveBeenCalledWith("line-a", "rev-a", "overview", expect.objectContaining({ expectedVersion: 4, expectedAggregateVersion: 11, payload: { uomId: "number" } }));
});

it("keeps a failed save on screen, then permits explicit discard and navigation", async () => {
  const test = await setup();
  test.api.updateKnowledgeSection.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try later"));
  await editUom();
  await fireEvent.press(screen.getByRole("button", { name: "Back to Main Baskets" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(screen.getAllByText("Try later").length).toBeGreaterThan(0));
  expect(test.onBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Discard and continue" }));
  expect(test.onBack).toHaveBeenCalledTimes(1);
});

it("retains conflict values and requires explicit review before a fresh-version save", async () => {
  const test = await setup();
  test.api.updateKnowledgeSection.mockImplementationOnce(async () => { test.setSection(section({ uomId: "area" }, 9)); throw new ApiError(409, "VERSION_CONFLICT", "Changed"); });
  await editUom();
  await fireEvent.press(screen.getByRole("button", { name: "Save Overview" }));
  await screen.findByText("Review newer configuration");
  expect(screen.getByRole("button", { name: "Save Overview" })).toBeDisabled();
  expect(screen.getByText("Your retained values")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Use my reviewed changes" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save Overview" }));
  await waitFor(() => expect(test.api.updateKnowledgeSection).toHaveBeenCalledTimes(2));
  expect(test.api.updateKnowledgeSection).toHaveBeenLastCalledWith("line-a", "rev-a", "overview", expect.objectContaining({ expectedVersion: 9, payload: { uomId: "number" } }));
});

it("keeps overview controls and saves inaccessible without update permission", async () => {
  const test = await setup({ update: false });
  expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save Overview" })).toBeNull();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
});

it("keeps all tabs accessible and saved context expandable without obscuring the editor", async () => {
  const test = await setup();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  expect(screen.getByRole("progressbar", { name: "Configuration completeness" })).toHaveProp("accessibilityValue", expect.objectContaining({ now: 0, min: 0, max: 100 }));
  expect(screen.getByText("0 of 4 tabs configured")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Quick summary" })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));
  expect(screen.queryByText("Main Basket")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  expect(screen.getByText("Main Basket")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Revision history" }));
  expect(screen.getByRole("button", { name: "View revision 2" })).toBeDisabled();
  await editUom();
  await fireEvent.press(screen.getByRole("tab", { name: "Mode" }));
  expect(screen.getByText("Unsaved Configuration changes")).toBeTruthy();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Discard and continue" }));
  expect(screen.getByRole("tab", { name: "Mode" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
});

it("shows a tab-based percentage and count from a refreshed item", async () => {
  const test = await setup();
  const sections = ["overview", "advanced", "pricing", "recommendations", "quality", "quantity-margin", "scope"].map(sectionKey => ({
    sectionKey, state: ["overview", "advanced", "quality"].includes(sectionKey) ? "complete" : "not_configured", findings: []
  }));
  await act(async () => { test.setItem({ ...item, completeness: { percentage: 75, sections, blockers: [], warnings: [] } } as KnowledgeItemDetail); });
  await waitFor(() => expect(screen.getByRole("progressbar", { name: "Configuration completeness" })).toHaveProp("accessibilityValue", expect.objectContaining({ now: 75 })));
  expect(screen.getByText("3 of 4 tabs configured")).toBeTruthy();
});

it("renders all four saved Mode rates, thresholds, impacts and margins in the mobile Quick summary", async () => {
  const calculation = { baseRatePaise: 12_345, lowQuantityLimit: "0", impactBps: 0, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 };
  const test = await setup({ advancedPayload: {
    pmcMinimumMarginBps: 1_250, pmcMarginBps: 1_750,
    subVendorMinimumMarginBps: 500, subVendorMarginBps: 1_500,
    modeCalculations: {
      pmc: calculation,
      sub_vendor: { ...calculation, baseRatePaise: 150_000, lowQuantityLimit: "6", impactBps: 1_250 },
      in_house_labor: { ...calculation, baseRatePaise: 9_800, lowQuantityLimit: "12", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 },
      in_house_material: { ...calculation, baseRatePaise: 45_025, lowQuantityLimit: "9", impactBps: 125, minimumMarkupBps: 2_000, startingMarkupBps: 3_000 }
    }
  } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  expect(within(summary).getByText("Unit price ₹123.45 per Square feet · Low quantity ≤0 · Impact 0% · Min 12.5% · Max 17.5%")).toBeTruthy();
  expect(within(summary).getByText("Unit price ₹1,500.00 per Square feet · Low quantity ≤6 · Impact 12.5% · Min 5% · Max 15%")).toBeTruthy();
  expect(within(summary).getByText("Unit price ₹98.00 per Square feet · Low quantity ≤12 · Impact 10% · Gross margin min 25% · start 35%")).toBeTruthy();
  expect(within(summary).getByText("Unit price ₹450.25 per Square feet · Low quantity ≤9 · Impact 1.25% · Gross margin min 20% · start 30%")).toBeTruthy();
  for (const label of ["PMC", "Sub-Vendor", "In-house Labor", "In-house Material"]) {
    expect(StyleSheet.flatten(within(summary).getByText(label).parent?.props.style).flexDirection).toBe("column");
  }
  await act(async () => {
    test.setSection({ ...section({ pmcMinimumMarginBps: 1_500, pmcMarginBps: 2_000,
      modeCalculations: { pmc: calculation } }, 5), sectionKey: "advanced" });
    await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "advanced") });
  });
  await waitFor(() => expect(within(summary).getByText("Unit price ₹123.45 per Square feet · Low quantity ≤0 · Impact 0% · Min 15% · Max 20%")).toBeTruthy());
  expect(within(summary).queryByText("Unit price ₹123.45 per Square feet · Low quantity ≤0 · Impact 0% · Min 12.5% · Max 17.5%")).toBeNull();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
});

it("reveals every confirmed Mode and Specifications value in a counted, accessible mobile disclosure", async () => {
  const longDescription = "Acoustic partitions with a confirmed site method. ".repeat(7).trim();
  await setup({ advancedPayload: {
    modeDescription: longDescription,
    modeConfigurations: [
      { id: "pmc-private", modeKind: "pmc", fields: [{ id: "crew-private", label: "Crew size", type: "number", options: [], value: "0" }], inclusions: [{ id: "transport-private", name: "Transport", selected: false }] },
      { id: "house-private", modeKind: "execution", executionSource: "in_house", fields: [{ id: "site-private", label: "Site ready", type: "checkbox", options: [], value: false }], exclusions: [{ id: "waste-private", name: "Waste removal", selected: true }] }
    ]
  }, pricingPayload: {
    brands: [{ id: "brand-private", name: "Acoustic Works", description: "Approved finish" }],
    specifications: [{ id: "spec-private", name: "Sound rated panel", brandId: "brand-private", description: "Fire tested" }],
    priceEntries: [{ inputAmountPaise: 999_999 }]
  } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  const disclosure = screen.getByRole("button", { name: /Show Mode details, \d+ more saved values/u });
  expect(disclosure).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));
  expect(within(summary).queryByText(longDescription)).toBeNull();
  await fireEvent.press(disclosure);
  expect(screen.getByRole("button", { name: /Hide Mode details, \d+ more saved values/u })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: true }));
  expect(within(summary).getByText(longDescription)).toBeTruthy();
  expect(StyleSheet.flatten(within(summary).getByText(longDescription).props.style).width).toBe("100%");
  for (const value of ["Transport · Not selected", "Waste removal · Selected", "Crew size", "Site ready", "0", "No", "Acoustic Works", "Approved finish", "Sound rated panel", "Fire tested"]) {
    expect(within(summary).getAllByText(value).length).toBeGreaterThan(0);
  }
  expect(within(summary).queryByText(/private|999,999|hidden compatibility/u)).toBeNull();
});

it("keeps confirmed Mode rows while Specifications loads, fails, retries, and later becomes stale", async () => {
  const test = await setup({ advancedPayload: { modeDescription: "Confirmed procurement method" }, pricingPayload: {
    brands: [{ id: "brand-private", name: "Confirmed Brand" }]
  }, pricingPending: true });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  expect(within(summary).getByText("Loading saved Specifications…")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /Show Mode details/u }));
  expect(within(summary).getByText("Confirmed procurement method")).toBeTruthy();
  await act(async () => { test.releasePricingLoad(); });
  await waitFor(() => expect(within(summary).getByText("Confirmed Brand")).toBeTruthy());
  test.setPricingFailure(true);
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "pricing") }); });
  await waitFor(() => expect(within(summary).getByText("The latest saved Specifications could not be loaded. Last saved details are shown.")).toBeTruthy());
  expect(within(summary).getByText("Confirmed procurement method")).toBeTruthy();
  expect(within(summary).getByText("Confirmed Brand")).toBeTruthy();
  test.setPricingFailure(false);
  test.setSection({ ...section({ brands: [{ id: "brand-private", name: "Refreshed Brand" }] }, 5), sectionKey: "pricing" });
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved Specifications" }));
  await waitFor(() => expect(within(summary).getByText("Refreshed Brand")).toBeTruthy());
  expect(within(summary).queryByText("Confirmed Brand")).toBeNull();
});

it("shows a separate Pricing error and excludes an unverified revision response without concealing Advanced", async () => {
  const test = await setup({ advancedPayload: { modeDescription: "Confirmed method" }, pricingFailure: true });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  await waitFor(() => expect(within(summary).getByText("Saved Specifications could not be loaded.")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: /Show Mode details/u }));
  expect(within(summary).getByText("Confirmed method")).toBeTruthy();
  test.setPricingFailure(false);
  test.setSection({ ...section({ brands: [{ id: "other-private", name: "Other revision brand" }] }), sectionKey: "pricing", revisionId: "rev-other" });
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved Specifications" }));
  await waitFor(() => expect(within(summary).getByText("Saved Specifications could not be verified for this revision.")).toBeTruthy());
  expect(within(summary).queryByText("Other revision brand")).toBeNull();
  expect(within(summary).getByText("Confirmed method")).toBeTruthy();
});

it("keeps saved Specifications visible and retryable when Mode fails independently", async () => {
  const test = await setup({ advancedFailure: true, pricingPayload: { brands: [{ id: "brand-private", name: "Saved Brand" }] } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  await waitFor(() => expect(within(summary).getByText("Saved Mode could not be loaded.")).toBeTruthy());
  expect(within(summary).getByText("Saved Brand")).toBeTruthy();
  test.setAdvancedFailure(false);
  test.setSection({ ...section({ modeDescription: "Recovered method" }), sectionKey: "advanced" });
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved Mode" }));
  await waitFor(() => expect(within(summary).getByText("PMC")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: /Show Mode details/u }));
  expect(within(summary).getByText("Recovered method")).toBeTruthy();
  expect(within(summary).getByText("Saved Brand")).toBeTruthy();
});

it("opens full Pricing-only text even when the preview and details have the same row count", async () => {
  const longDescription = "Full saved acoustic performance description. ".repeat(8).trim();
  await setup({ advancedFailure: true, pricingPayload: {
    brands: [{ id: "brand-private", name: "Saved Brand", description: longDescription }]
  } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-mode");
  expect(within(summary).getByText("Saved Brand")).toBeTruthy();
  expect(within(summary).queryByText(longDescription)).toBeNull();
  const disclosure = screen.getByRole("button", { name: "Show full Mode details" });
  expect(disclosure).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));
  await fireEvent.press(disclosure);
  expect(screen.getByRole("button", { name: "Hide full Mode details" })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: true }));
  expect(within(summary).getByText(longDescription)).toBeTruthy();
});

it("hides a cached Specifications section after access is denied while retaining allowed Mode details", async () => {
  const test = await setup({ advancedPayload: { modeDescription: "Allowed method" }, pricingPayload: {
    brands: [{ id: "brand-private", name: "Restricted Brand" }]
  } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show Mode details/u }));
  const summary = screen.getByTestId("saved-summary-mode");
  expect(within(summary).getByText("Restricted Brand")).toBeTruthy();
  test.setPricingFailure(true, new ApiError(403, "FORBIDDEN", "Access denied"));
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "pricing") }); });
  await waitFor(() => expect(within(summary).getByText("Saved Specifications is unavailable with your current access.")).toBeTruthy());
  expect(within(summary).queryByText("Restricted Brand")).toBeNull();
  expect(within(summary).getByText("Allowed method")).toBeTruthy();
  test.setPricingFailure(false);
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved Specifications" }));
  await waitFor(() => expect(within(summary).getByText("Restricted Brand")).toBeTruthy());
});

it("keeps Mode typing and a failed save out of Quick summary, then shows confirmed save and refetch", async () => {
  const test = await setup({ advancedPayload: { modeDescription: "Saved baseline" } });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show Mode details/u }));
  const summary = screen.getByTestId("saved-summary-mode");
  expect(within(summary).getByText("Saved baseline")).toBeTruthy();
  await fireEvent.press(screen.getByRole("tab", { name: "Mode" }));
  await fireEvent.changeText(screen.getByLabelText("Mode paragraph"), "Locally typed method");
  expect(within(summary).queryByText("Locally typed method")).toBeNull();
  test.api.updateKnowledgeSection.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Save unavailable"));
  await fireEvent.press(screen.getByRole("button", { name: "Save Mode" }));
  await waitFor(() => expect(screen.getAllByText("Save unavailable").length).toBeGreaterThan(0));
  expect(within(summary).getByText("Saved baseline")).toBeTruthy();
  expect(within(summary).queryByText("Locally typed method")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Save Mode" }));
  await waitFor(() => expect(within(summary).getByText("Locally typed method")).toBeTruthy());
  expect(test.api.updateKnowledgeSection).toHaveBeenCalledTimes(2);
  test.setSection({ ...section({ modeDescription: "Refetched method" }, 6), sectionKey: "advanced" });
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "advanced") }); });
  await waitFor(() => expect(within(summary).getByText("Refetched method")).toBeTruthy());
  expect(within(summary).queryByText("Locally typed method")).toBeNull();
});

it("keeps four touch-accessible tabs and readable activation checks for temporary items", async () => {
  const test = await setup();
  await act(async () => { test.client.setQueryData(test.context.key("detail", "line-a"), { ...item, itemType: "temporary", blockers: [{ code: "MISSING_UOM", message: "uomId is required before activation." }], warnings: [{ code: "MISSING_MODE", message: "advanced is not configured." }] }); });
  await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(4));
  const recommendationsTab = screen.getByRole("tab", { name: "Recommendation & Exclusions" });
  expect(StyleSheet.flatten(recommendationsTab.props.style).minHeight).toBeGreaterThanOrEqual(44);
  expect(within(recommendationsTab).getByText("Recommendations\n& Exclusions")).toBeTruthy();
  const tablist = recommendationsTab.parent!;
  const dockPadding = StyleSheet.flatten(tablist.parent!.props.style).paddingHorizontal as number;
  const tabs = within(tablist).getAllByRole("tab");
  const flex = tabs.map(tab => StyleSheet.flatten(tab.props.style).flex as number);
  for (const viewportWidth of [320, 411]) {
    const tabWidths = flex.map(weight => (viewportWidth - dockPadding * 2) * weight / flex.reduce((sum, value) => sum + value, 0));
    expect(Math.min(...tabWidths)).toBeGreaterThan(50);
    expect(tabWidths[2]).toBeGreaterThan(100);
  }
  await fireEvent.press(recommendationsTab);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Mandatory Item" })).toBeTruthy());
  expect(recommendationsTab).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  expect(screen.queryByText("Unit of measure is required before activation.")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Configuration checks" }));
  expect(screen.getByText("Unit of measure is required before activation.")).toBeTruthy();
  expect(screen.getByText("Mode is not configured.")).toBeTruthy();
  expect(screen.queryByText(/uomId/)).toBeNull();
});

it("saves a temporary Draft rule from the native editor and shows only confirmed saved details", async () => {
  const test = await setup({ itemType: "temporary" });
  await fireEvent.press(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Mandatory Item" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const savedSummary = screen.getByTestId("saved-summary-recommendations");
  expect(within(savedSummary).getByText("Not configured")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Add Mandatory Item" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Main Basket" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Joinery" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Related item" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Frame kit" }));
  await fireEvent.changeText(screen.getByLabelText("Reason"), "Required for temporary works");
  expect(within(savedSummary).queryByText(/Frame kit/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
  await waitFor(() => expect(test.api.updateKnowledgeSection).toHaveBeenCalledWith("line-a", "rev-a", "recommendations", expect.objectContaining({ expectedVersion: 4, expectedAggregateVersion: 11, payload: expect.objectContaining({ budgetAlterations: [expect.objectContaining({ targetMainLineId: "line-b", targetBasketId: "basket-a", targetType: "catalog", reason: "Required for temporary works" })] }) })));
  await waitFor(() => expect(within(savedSummary).getByText(/Frame kit/)).toBeTruthy());
  expect(screen.getByRole("button", { name: "Save Recommendation & Exclusions" })).toBeDisabled();
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "recommendations") }); });
  await waitFor(() => expect(test.api.getKnowledgeSection.mock.calls.filter(([, , key]) => key === "recommendations")).toHaveLength(2));
  expect(within(screen.getByTestId("saved-summary-recommendations")).getByText(/Frame kit/)).toBeTruthy();
  await act(async () => { test.setItem({ ...item, itemType: "temporary", draftRevisionId: null, draftRevision: null, activeRevisionId: null, activeRevision: null }); });
  await waitFor(() => expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("No revision available.")).toBeTruthy());
  expect(within(screen.getByTestId("saved-summary-recommendations")).queryByText(/Frame kit/)).toBeNull();
});

it("guards unsaved temporary recommendations and keeps the summary at the saved value after discard", async () => {
  const test = await setup({ itemType: "temporary" });
  await fireEvent.press(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Exclusion" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add Exclusion" }));
  await fireEvent.press(screen.getByRole("tab", { name: "Mode" }));
  expect(screen.getByText("Unsaved Configuration changes")).toBeTruthy();
  expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("Not configured")).toBeTruthy();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Discard and continue" }));
  expect(screen.getByRole("tab", { name: "Mode" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
});

it("keeps temporary recommendations readable without update permission or on archived items", async () => {
  const exclusion = { ...newRecommendationRule("exclusions"), targetBasketId: "basket-a", targetMainLineId: "line-b", targetSubBasketId: null, targetType: "catalog", reason: "Already included" };
  const test = await setup({ update: false, itemType: "temporary", recommendationsPayload: { budgetAlterations: [exclusion] } });
  await fireEvent.press(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "View rule 1" })).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Add Exclusion" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save Recommendation & Exclusions" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "View rule 1" }));
  expect(screen.getByRole("combobox", { name: "Related action" })).toBeDisabled();
  await act(async () => { test.client.setQueryData(test.context.key("detail", "line-a"), { ...item, itemType: "temporary", status: "archived", allowedActions: [] }); });
  expect(screen.queryByRole("button", { name: "Add Exclusion" })).toBeNull();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
});

it("retains temporary recommendation edits during a version conflict until review and resave", async () => {
  const rule = { ...newRecommendationRule("mandatory"), targetBasketId: "basket-a", targetMainLineId: "line-b", targetSubBasketId: null, targetType: "catalog", reason: "Original reason" };
  const test = await setup({ itemType: "temporary", recommendationsPayload: { budgetAlterations: [rule] } });
  await fireEvent.press(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit rule 1" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  await fireEvent.press(screen.getByRole("button", { name: "Show Recommendation & Exclusions details" }));
  const summary = screen.getByTestId("saved-summary-recommendations");
  expect(within(summary).getByText("Original reason")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit rule 1" }));
  await fireEvent.changeText(screen.getByLabelText("Reason"), "Updated reason");
  expect(within(summary).queryByText("Updated reason")).toBeNull();
  test.api.updateKnowledgeSection.mockImplementationOnce(async () => { test.setSection({ ...section({ budgetAlterations: [rule] }, 9), sectionKey: "recommendations", applicability: "configured" }); throw new ApiError(409, "VERSION_CONFLICT", "Changed"); });
  await fireEvent.press(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
  await screen.findByText("Review newer configuration");
  expect(screen.getByRole("button", { name: "Save Recommendation & Exclusions" })).toBeDisabled();
  expect(within(summary).getByText("Original reason")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Use my reviewed changes" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
  await waitFor(() => expect(test.api.updateKnowledgeSection).toHaveBeenLastCalledWith("line-a", "rev-a", "recommendations", expect.objectContaining({ expectedVersion: 9, payload: expect.objectContaining({ budgetAlterations: [expect.objectContaining({ reason: "Updated reason" })] }) })));
  await waitFor(() => expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("Updated reason")).toBeTruthy());
});

it("offers a summary retry when the first temporary recommendations load fails", async () => {
  const test = await setup({ itemType: "temporary", recommendationsFailure: true });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  const summary = screen.getByTestId("saved-summary-recommendations");
  await waitFor(() => expect(within(summary).getByText("Saved recommendations could not be loaded.")).toBeTruthy());
  test.setRecommendationFailure(false);
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved recommendations" }));
  await waitFor(() => expect(within(summary).getByText("Not configured")).toBeTruthy());
});

it("distinguishes loading, failed, empty, and missing-revision temporary summaries", async () => {
  const test = await setup({ itemType: "temporary", recommendationsPending: true });
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("Loading saved recommendations…")).toBeTruthy();
  await act(async () => { test.releaseRecommendationLoad(); });
  await waitFor(() => expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("Not configured")).toBeTruthy());
  test.setRecommendationFailure(true);
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("section", "line-a", "rev-a", "recommendations") }); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry saved recommendations" })).toBeTruthy());
  expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("The latest saved recommendations could not be loaded. Last saved details are shown.")).toBeTruthy();
  test.setRecommendationFailure(false);
  await fireEvent.press(screen.getByRole("button", { name: "Retry saved recommendations" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Retry saved recommendations" })).toBeNull());
  await act(async () => { test.setItem({ ...item, itemType: "temporary", draftRevisionId: null, draftRevision: null, activeRevisionId: null, activeRevision: null }); });
  await waitFor(() => expect(within(screen.getByTestId("saved-summary-recommendations")).getByText("No revision available.")).toBeTruthy());
});
