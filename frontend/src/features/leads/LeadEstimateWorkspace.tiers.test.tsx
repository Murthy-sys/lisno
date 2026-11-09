import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import { estimationCatalogueKeys } from "./estimationCatalogueApi";
import type { EstimationCatalogueMainLine } from "./estimationCatalogueApi";
import type { EstimateTierComparisonInput } from "../estimates/estimateTierComparisonApi";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "test-estimator", role: "estimator_sales" }, reviewSession: { id: "test-session" }, status: "authenticated" }) }));
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));


vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
function fixture(withDimensions = false) {
  const dimensionRule = { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "unit", decimalScale: 2 };
  const source: EstimationCatalogueMainLine = { id: "main-line", mainLineId: "main-line", basketId: "basket", subBasketId: "sub", name: "Ceiling", displayOrder: 1,
    revisionId: "revision", itemVersion: 4, revisionVersion: 2, ...(withDimensions ? { dimensionsMandatory: true, dimensionRule } : {}), uom: { id: "unit", name: "sq ft", code: "SQFT", decimalScale: 2 },
    modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null }, applicableTiers: ["signature", "premium", "functional"], tierPricing: {
      signature: { modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null } },
      premium: { modeBaseRatesPaise: { pmc: 1500, sub_vendor: 2500, in_house: null } },
      functional: { modeBaseRatesPaise: { pmc: 0, sub_vendor: 0, in_house: null } }
    } };
  const line: ConfiguredEstimateLine = { id: "saved-line", source: "configuration", catalogueId: "main-line", roomId: "living", roomName: "Living & Dining",
    mainBasketId: "basket", mainBasketName: "Gypsum", subBasketId: "sub", subBasketName: "Ceilings", mainLineId: "main-line", mainLineName: "Ceiling", revisionId: "revision",
    uomId: "unit", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2, unit: "sq ft", quantity: 2, included: true,
    ...(withDimensions ? { dimensionsMandatory: true, dimensionRule, dimensions: { length: "2", width: "1", height: "3" } } : {}),
    pricingMode: "sub_vendor", rateSource: "manual", rate: 99, ratePaise: 9900, amount: 198, amountPaise: 19800, specification: null };
  let stored: EstimateDraft = { id: "estimate", version: 7, propertyType: "Villa", bedroomCount: 2, rooms: [{ id: "living", typeId: "living", label: "Living & Dining", sqft: 100, length: 10, width: 10 }],
    scopes: [], selectedMainBasketIds: ["basket"], lineItems: [line], subtotal: 198, gst: 35.64, total: 233.64, status: "draft", approvalRequired: false };
  const saves: EstimateDraftInput[] = [];
  const comparisons: EstimateTierComparisonInput[] = [];
  let comparisonFailure: number | null = null;
  let gate: Promise<void> | null = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input); const method = init?.method ?? "GET";
    if (url.endsWith("/leads/lead")) return Response.json({ data: { id: "lead", clientName: "Client", projectName: "Home", location: "Pune", propertyType: "Villa" } });
    if (url.endsWith("/leads/lead/estimate") && method === "GET") return Response.json({ data: stored });
    if (url.includes("/estimation/catalogue?")) return Response.json({ data: { items: [{ id: "basket", name: "Gypsum", displayOrder: 1, subBaskets: [{ id: "sub", basketId: "basket", name: "Ceilings", displayOrder: 1, mainLines: [source] }] }], pagination: { total: 1, hasMore: false, offset: 0, limit: 100 }, ineligibleLineCount: 0 } });
    if (url.includes("/estimation/catalogue/recommendations?")) return Response.json({ data: { sources: [] } });
    if (url.endsWith("/leads/lead/estimate/tier-comparison") && method === "POST") {
      const request = JSON.parse(String(init?.body)) as EstimateTierComparisonInput;
      comparisons.push(request);
      if (comparisonFailure !== null) return Response.json({ error: { code: "ESTIMATE_CONFIGURATION_CHANGED", message: "Configuration changed." } }, { status: comparisonFailure });
      return Response.json({ data: { roomId: "living", roomName: "Living & Dining", mainBasketId: "basket", mainBasketName: "Gypsum", subBasketId: "sub", subBasketName: "Ceilings", estimateVersion: stored.version,
        tiers: (["current", ...KNOWLEDGE_MODE_TIERS] as const).map(modeTier => {
          const lines = request.lines.map(value => {
            const ratePaise = modeTier === "current" && value.rateSource === "manual" ? 9900
              : source.tierPricing?.[modeTier === "current" ? value.modeTier : modeTier]?.modeBaseRatesPaise[value.pricingMode] ?? null;
            return { mainLineId: value.mainLineId, name: "Ceiling", quantity: value.quantity, uomName: "sq ft", ratePaise,
              amountPaise: ratePaise === null ? null : Math.round(ratePaise * value.quantity), unavailableReason: ratePaise === null ? "Price not configured" : null };
          });
          return { modeTier, label: modeTier === "current" ? "Mode" : KNOWLEDGE_MODE_TIER_LABELS[modeTier],
            available: lines.every(line => line.amountPaise !== null),
            subtotalPaise: lines.every(line => line.amountPaise !== null) ? lines.reduce((total, line) => total + line.amountPaise!, 0) : null, lines };
        }) } });
    }
    if (url.endsWith("/leads/lead/estimate") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as EstimateDraftInput; saves.push(body); await gate;
      stored = { ...stored, ...body, version: stored.version! + 1, lineItems: body.lineItems.map(value => value.source === "configuration" ? { ...line, ...value } : value) };
      return Response.json({ data: stored });
    }
    throw new Error(`${method} ${url}`);
  });
  const mount = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const rendered = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/estimator-sales/leads/lead/estimate"]}><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes></MemoryRouter></QueryClientProvider>);
    return { ...rendered, client };
  };
  return { mount, saves, comparisons, source, stored: () => stored, updateStored(next: EstimateDraft) { stored = next; }, pauseSave(promise: Promise<void>) { gate = promise; }, failComparison(status: number | null) { comparisonFailure = status; } };
}

describe("Sales estimate tier persistence", () => {
  it("keeps tier choices blocked after closing stale price information and editing quantity until a current read succeeds", async () => {
    const user = userEvent.setup(); const data = fixture(); data.failComparison(409); data.mount();
    await user.click(await screen.findByRole("button", { name: /^Tier price information for/ }));
    await screen.findByRole("button", { name: /^Retry tier prices/ });
    await user.click(screen.getByRole("button", { name: "Close" }));
    screen.getAllByRole("radio", { name: /tier for/ }).forEach(option => expect(option).toBeDisabled());
    const quantity = screen.getByRole("spinbutton", { name: /^Quantity/ });
    await user.clear(quantity);
    screen.getAllByRole("radio", { name: /tier for/ }).forEach(option => expect(option).toBeDisabled());
    await user.type(quantity, "3");
    screen.getAllByRole("radio", { name: /tier for/ }).forEach(option => expect(option).toBeDisabled());
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    expect(data.saves).toEqual([]);
    data.failComparison(null);
    await user.click(screen.getByRole("button", { name: /^Tier price information for/ }));
    await waitFor(() => expect(screen.getByRole("group", { name: /^Tier price suggestions/ })).toHaveTextContent(/If you choose Premium:.*₹25.*₹75/));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    expect(data.saves).toEqual([]);
  });
  it("retains the implicit manual baseline without a Mode control until an explicit same-tier choice", async () => {
    const user = userEvent.setup(); const data = fixture(); data.mount();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    expect(screen.queryByRole("radio", { name: /^Mode for/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Mode keeps current line choices.")).not.toBeInTheDocument();
    screen.getAllByRole("radio", { name: /tier for/ }).forEach(option => expect(option).not.toBeChecked());
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    expect(screen.queryByRole("group", { name: /^Tier price suggestions/ })).not.toBeInTheDocument();
    expect(data.comparisons).toEqual([]);
    const info = screen.getByRole("button", { name: /^Tier price information for/ });
    await user.click(info);
    const suggestions = screen.getByRole("group", { name: /^Tier price suggestions/ });
    await waitFor(() => expect(suggestions).toHaveTextContent(/If you choose Premium:.*₹25.*₹50/));
    expect(suggestions).toHaveTextContent(/If you choose Functional:.*₹0/);
    expect(data.saves).toEqual([]);
    await user.keyboard("{Escape}");
    expect(info).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(data.saves[0]!.lineItems[0]).toMatchObject({ modeTier: "signature", rateSource: "manual", ratePaise: 9900 });
    await screen.findByText("Estimate draft saved.");
    await waitFor(() => expect(screen.getByRole("radio", { name: /Signature tier for/ })).toBeEnabled());
    await user.click(screen.getByRole("radio", { name: /Signature tier for/ }));
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("20");
    await user.click(screen.getByRole("button", { name: /^Tier price information for/ }));
    await waitFor(() => expect(screen.getByRole("group", { name: /^Tier price suggestions/ })).toHaveTextContent(/If you choose Signature:.*₹20.*₹40/));
    expect(data.comparisons.at(-1)!.lines[0]).toMatchObject({ modeTier: "signature", rateSource: "configuration", quantity: 2 });
    expect(data.saves).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(2));
    expect(data.saves[1]!.lineItems[0]).toMatchObject({ modeTier: "signature", rateSource: "configuration", ratePaise: 2000 });
  });

  it("requests comparison for current group quantities with source pins and flags unsaved manual prices without saving", async () => {
    const user = userEvent.setup(); const data = fixture(); data.mount();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Check tier comparison for/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /^Check tier comparison for/ }));
    await screen.findByRole("dialog", { name: /^Price comparison:/ });
    await waitFor(() => expect(data.comparisons.length).toBeGreaterThanOrEqual(1));
    expect(data.comparisons[0]).toMatchObject({ expectedVersion: 7, roomId: "living", mainBasketId: "basket", subBasketId: "sub",
      lines: [{ mainLineId: "main-line", lineItemId: "saved-line", revisionId: "revision", itemVersion: 4, revisionVersion: 2,
        uomId: "unit", quantity: 2, pricingMode: "sub_vendor", modeTier: "signature", rateSource: "manual", manualRateChanged: false }] });
    await user.click(screen.getByRole("button", { name: "Close" }));
    const rate = screen.getByRole("textbox", { name: /Selling rate/ });
    await user.clear(rate); await user.type(rate, "101.25");
    await user.click(screen.getByRole("button", { name: /^Check tier comparison for/ }));
    await waitFor(() => expect(data.comparisons.at(-1)!.lines[0]).toMatchObject({ manualRateChanged: true }));
    expect(data.saves).toEqual([]);
  });

  it("loads saved PMC without writing or repricing and persists switch changes with the selected tier", async () => {
    const user = userEvent.setup(); const data = fixture();
    data.updateStored({ ...data.stored(), lineItems: data.stored().lineItems.map(line => ({
      ...line, classification: "special" as const, pricingMode: "pmc" as const, modeTier: "premium" as const
    })) });
    const view = data.mount();
    const pmc = await screen.findByRole("switch", { name: /PMC pricing mode.*Living & Dining/ });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    expect(pmc).toBeChecked();
    expect(screen.queryByRole("radio", { name: /pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    expect(screen.getByLabelText(/^Amount for/)).toHaveTextContent("₹198");
    expect(data.saves).toEqual([]);
    await act(async () => { await view.client.refetchQueries({ queryKey: estimationCatalogueKeys.ready }); });
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).toBeChecked(); expect(data.saves).toEqual([]);

    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("25");
    expect(screen.getByLabelText(/^Amount for/)).toHaveTextContent("₹50");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(data.saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [{ id: "saved-line", mainLineId: "main-line",
      classification: "special", pricingMode: "sub_vendor", modeTier: "premium", rateSource: "configuration",
      ratePaise: 2500, quantity: 2, itemVersion: 4, revisionVersion: 2 }] });
    await screen.findByText("Estimate draft saved."); view.unmount();
    const reloaded = data.mount();
    await screen.findByRole("switch", { name: /PMC pricing mode/ });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("25");
    expect(data.saves).toHaveLength(1);

    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("15");
    expect(screen.getByLabelText(/^Amount for/)).toHaveTextContent("₹30");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(2));
    expect(data.saves[1]).toMatchObject({ expectedVersion: 8, lineItems: [{ pricingMode: "pmc", modeTier: "premium",
      rateSource: "configuration", ratePaise: 1500, quantity: 2, itemVersion: 4, revisionVersion: 2 }] });
    await screen.findByText("Estimate draft saved."); reloaded.unmount(); data.mount();
    expect(await screen.findByRole("switch", { name: /PMC pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("15");
    expect(data.saves).toHaveLength(2);
  });

  it("refreshes untouched configured selections and rates after another session saves", async () => {
    const data = fixture(); const view = data.mount();
    await screen.findByRole("radio", { name: /Premium tier for/ });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    data.updateStored({ ...data.stored(), version: 8, lineItems: data.stored().lineItems.map(line => ({ ...line, modeTier: "premium" as const, rateSource: "configuration" as const, ratePaise: 2500, rate: 25 })) });
    await act(async () => { await view.client.refetchQueries({ queryKey: leadKeys.estimate("lead") }); });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeChecked());
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("25");
    expect(screen.queryByText(/Your local edits are preserved/)).not.toBeInTheDocument();
  });

  it("saves and reloads the selected tier with configured rates and exact estimate/source versions", async () => {
    const user = userEvent.setup(); const data = fixture(); const view = data.mount();
    await screen.findByRole("radio", { name: /Premium tier for/ });
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled());
    await user.click(screen.getByRole("radio", { name: /Premium tier for/ })); expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("25");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(data.saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [{ id: "saved-line", mainLineId: "main-line", modeTier: "premium", rateSource: "configuration", ratePaise: 2500, quantity: 2, itemVersion: 4, revisionVersion: 2 }] });
    await screen.findByText("Estimate draft saved."); view.unmount(); data.mount();
    expect(await screen.findByRole("radio", { name: /Premium tier for/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("25");
  });

  it("does not overwrite a later tier choice when an earlier save response arrives", async () => {
    const user = userEvent.setup(); const data = fixture(); data.mount();
    let finish!: () => void; data.pauseSave(new Promise(resolve => { finish = resolve; }));
    await screen.findByRole("radio", { name: /Premium tier for/ });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeEnabled()); await user.click(screen.getByRole("radio", { name: /Premium tier for/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    await user.click(screen.getByRole("radio", { name: /Functional tier for/ }));
    await act(async () => { finish(); }); await screen.findByText("Estimate draft saved.");
    expect(screen.getByRole("radio", { name: /Functional tier for/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("0");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(2));
    expect(data.saves[1]).toMatchObject({ expectedVersion: 8, lineItems: [{ modeTier: "functional", ratePaise: 0 }] });
  });
});


describe("Sales measurement persistence", () => {
  it("saves dimensions and their calculated quantity with source pins while retaining the manual rate", async () => {
    const data = fixture(true); const view = data.mount();
    await screen.findByRole("textbox", { name: /^Length/ });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Length/ })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: /^Length/ }), { target: { value: "2.50" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Width/ }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Height/ }), { target: { value: "9" } });
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("7.5");
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("99");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(data.saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [{ quantity: 7.5, expectedDimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "unit", decimalScale: 2 }, dimensions: { length: "2.5", width: "3", height: "9" }, itemVersion: 4, revisionVersion: 2, ratePaise: 9900, rateSource: "manual" }] });
    await screen.findByText("Estimate draft saved."); view.unmount(); data.mount();
    expect(await screen.findByRole("textbox", { name: /^Length/ })).toHaveValue("2.5");
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("7.5");
  });
  it("preserves a later raw measurement edit when an earlier save completes and blocks incomplete height", async () => {
    const data = fixture(true); data.mount();
    let finish!: () => void; data.pauseSave(new Promise(resolve => { finish = resolve; }));
    await screen.findByRole("textbox", { name: /^Length/ });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Length/ })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: /^Length/ }), { target: { value: "4" } });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(data.saves).toHaveLength(1));
    fireEvent.change(screen.getByRole("textbox", { name: /^Length/ }), { target: { value: "5.50" } });
    await act(async () => finish()); await screen.findByText("Estimate draft saved.");
    expect(screen.getByRole("textbox", { name: /^Length/ })).toHaveValue("5.50"); expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("5.5");
    fireEvent.change(screen.getByRole("textbox", { name: /^Height/ }), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Height/ }), { target: { value: "8" } });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(data.saves).toHaveLength(2));
    expect(data.saves[1]).toMatchObject({ expectedVersion: 8, lineItems: [{ quantity: 5.5, dimensions: { length: "5.5", width: "1", height: "8" } }] });
  });
});

it("does not restore an old dimension policy when Configuration is refreshed during a save", async () => {
  const data = fixture(true); const view = data.mount();
  let finish!: () => void; data.pauseSave(new Promise(resolve => { finish = resolve; }));
  await screen.findByRole("textbox", { name: /^Length/ });
  await waitFor(() => expect(screen.getByRole("textbox", { name: /^Length/ })).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: /^Length/ }), { target: { value: "4" } });
  await userEvent.click(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(data.saves).toHaveLength(1));
  Object.assign(data.source, { dimensionsMandatory: false, dimensionRule: null, itemVersion: 5, revisionVersion: 3 });
  await act(async () => { await view.client.refetchQueries({ queryKey: estimationCatalogueKeys.ready }); });
  await waitFor(() => expect(screen.queryByRole("textbox", { name: /^Length/ })).not.toBeInTheDocument());
  expect(screen.getByRole("spinbutton", { name: /Quantity/ })).toHaveValue(4);
  await act(async () => finish()); await screen.findByText("Estimate draft saved.");
  expect(screen.queryByRole("textbox", { name: /^Length/ })).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /Quantity/ })).toHaveValue(4);
  fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "8" } });
  await userEvent.click(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(data.saves).toHaveLength(2));
  expect(data.saves[1]!.lineItems[0]).toMatchObject({ quantity: 8, dimensions: { length: "4", width: "1", height: "3" } });
  expect(data.saves[1]!.lineItems[0]).not.toHaveProperty("expectedDimensionRule");
});
