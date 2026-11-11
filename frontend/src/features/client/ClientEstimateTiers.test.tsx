import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { ApiError } from "../../api/client";
import { ClientEstimateTiers } from "./ClientEstimateTiers";
import * as api from "./estimateTiersApi";
import { componentPricingFixture } from "../leads/estimateComponentPricing.testFixtures";
import { toEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";

vi.mock("./estimateTiersApi", async original => ({ ...await original<typeof import("./estimateTiersApi")>(), getEstimateTiers: vi.fn(), updateEstimateTier: vi.fn(), updateEstimateTierGroup: vi.fn() }));
const source = { revisionId: "revision-1", itemVersion: 4, revisionVersion: 2, uomId: "sq-ft" };
const fixture = (): api.EstimateTiersDetail => ({ projectId: "project", estimateId: "estimate", estimateVersion: 7,
  editingAllowed: true, editingBlockReason: null, totalPaise: 11800, isIncomplete: false,
  lines: [{ id: "estimate-line", mainLineId: "main-line", mainLineName: "Ceiling", roomName: "Living", quantity: 2, uomName: "sq ft",
    pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 5000, amountPaise: 10000, choices: [
      { modeTier: "signature", available: true, unavailableReason: null, ratePaise: 5000, amountPaise: 10000, source },
      { modeTier: "premium", available: true, unavailableReason: null, ratePaise: 7000, amountPaise: 14000, source },
      { modeTier: "functional", available: false, unavailableReason: "Not applicable", ratePaise: null, amountPaise: null, source: null }
    ] }]
});
function setup(detail = fixture()) {
  const state = { detail };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } } });
  vi.mocked(api.getEstimateTiers).mockImplementation(async () => state.detail);
  vi.mocked(api.updateEstimateTier).mockImplementation(async (_project, id, input) => {
    state.detail = { ...state.detail, estimateVersion: state.detail.estimateVersion! + 1, totalPaise: 16520,
      lines: state.detail.lines.map(line => line.id === id ? { ...line, modeTier: input.modeTier, selectedInHouseComponentIds: input.selectedInHouseComponentIds,
        ratePaise: line.choices.find(choice => choice.modeTier === input.modeTier)!.ratePaise,
        amountPaise: line.choices.find(choice => choice.modeTier === input.modeTier)!.amountPaise } : line) };
    return state.detail;
  });
  const view = render(<QueryClientProvider client={client}><ClientEstimateTiers projectId="project" /></QueryClientProvider>);
  return { ...view, client, state };
}
const tier = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
beforeEach(() => vi.clearAllMocks());

describe("client working estimate tiers", () => {
  it("renders governed combined prices and omits component IDs from comparison and tier-save requests", async () => {
    const detail = fixture(); const line = detail.lines[0]!;
    const evidence = componentPricingFixture("main-line");
    Object.assign(line, { roomId: "room", mainBasketId: "basket", subBasketId: "sub", subBasketName: "Ceilings", pricingMode: "in_house",
      ratePaise: null, amountPaise: evidence.totalPaise, inHouseUsage: "execution", aggregatePricing: toEstimateAggregatePricing(evidence), pricingBasis: evidence.formulaVersion });
    line.choices = line.choices.map(choice => ({ ...choice, inHouseUsage: "execution", inHousePricingState: "ready", ratePaise: null,
      amountPaise: evidence.totalPaise, aggregatePricing: { ...toEstimateAggregatePricing(evidence), modeTier: choice.modeTier }, pricingBasis: evidence.formulaVersion }));
    const inputs: Array<{ lines: Array<{ selectedInHouseComponentIds?: string[] }> }> = [];
    server.use(http.post("/api/v1/projects/project/estimate-tier-comparison", async ({ request }) => {
      inputs.push(await request.json() as typeof inputs[number]);
      return HttpResponse.json({ data: { mainBasketId: "basket", subBasketId: "sub", roomId: "room", roomName: "Living", mainBasketName: "Finishes", subBasketName: "Ceilings", estimateVersion: 7, tiers: [] } });
    }));
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling");
    expect(screen.getByText("Price including margin: ₹783.33")).toBeVisible();
    expect(screen.queryByRole("group", { name: /In-house components/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check tier comparison for Ceilings in Living" }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]!.lines[0]).not.toHaveProperty("selectedInHouseComponentIds");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await user.click(tier("Premium"));
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalled());
    expect(vi.mocked(api.updateEstimateTier).mock.calls[0]![2]).not.toHaveProperty("selectedInHouseComponentIds");
  });

  it.each([undefined, -50])("keeps the server total and its optional rounding adjustment (%s)", async roundOffPaise => {
    setup({ ...fixture(), totalPaise: roundOffPaise === undefined ? 10250 : 10200,
      ...(roundOffPaise === undefined ? {} : { roundOffPaise }) });
    await screen.findByText("Ceiling");
    expect(screen.getByText("Current total including GST").nextElementSibling).toHaveTextContent(roundOffPaise === undefined ? "₹102.5" : "₹102");
    if (roundOffPaise === undefined) expect(screen.queryByText("Round off")).not.toBeInTheDocument();
    else expect(screen.getByText("Round off").nextElementSibling).toHaveTextContent("−₹0.5");
    expect(api.updateEstimateTier).not.toHaveBeenCalled();
  });
  it("shows exact component selling amounts for null-rate In-house choices and saved details", async () => {
    const detail = fixture(); const line = detail.lines[0]!;
    const pricing = componentPricingFixture("main-line");
    Object.assign(line, { pricingMode: "in_house", ratePaise: null, amountPaise: 78333,
      pricingBasis: "in_house_components_v1", componentPricing: pricing, selectedInHouseComponentIds: ["component-a"] });
    Object.assign(line.choices[0]!, { ratePaise: null, amountPaise: 78333, pricingBasis: "in_house_components_v1", componentPricing: pricing,
      inHouseComponents: [{ id: "component-a", label: "Finishes / Ceiling", ratePaise: 30000, amountPaise: 78333, available: true }] });
    setup(detail); await screen.findByText("Ceiling");
    expect(tier("Mode")).toBeChecked();
    expect(screen.queryByRole("group", { name: "Configuration tier for Ceiling in Living" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Finishes / Ceiling ₹783.33 for this quantity" })).toBeChecked();
    expect(screen.getByText("Component selling amounts for Ceiling in Living · ₹783.33")).toBeVisible();
    expect(api.updateEstimateTier).not.toHaveBeenCalled();
  });

  it("shows all three choices, read-only server prices and unavailable options", async () => {
    setup(); await screen.findByText("Ceiling");
    expect(tier("Mode")).toBeChecked(); expect(tier("Functional")).toBeDisabled();
    expect(tier("Functional")).toHaveAccessibleDescription("1 item is unavailable in this mode.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("₹118")).toBeVisible(); expect(api.updateEstimateTier).not.toHaveBeenCalled();
  });

  it("compares a staged tier with configured prices and restores saved pricing when Mode is selected", async () => {
    const detail = fixture();
    Object.assign(detail.lines[0]!, { roomId: "room", mainBasketId: "basket", subBasketId: "sub", subBasketName: "Ceilings" });
    const inputs: Array<{ lines: Array<{ rateSource?: string }> }> = [];
    server.use(http.post("/api/v1/projects/project/estimate-tier-comparison", async ({ request }) => {
      inputs.push(await request.json() as typeof inputs[number]);
      return HttpResponse.json({ data: { mainBasketId: "basket", subBasketId: "sub", roomId: "room", roomName: "Living",
        mainBasketName: "Finishes", subBasketName: "Ceilings", estimateVersion: 7, tiers: [] } });
    }));
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling");
    for (const selection of [null, "Signature", "Mode"] as const) {
      if (selection) await user.click(tier(selection));
      await user.click(screen.getByRole("button", { name: "Check tier comparison for Ceilings in Living" }));
      const dialog = screen.getByRole("dialog", { name: "Price comparison: Ceilings in Living" });
      await waitFor(() => expect(within(dialog).getByRole("button", { name: "Download PDF" })).toBeEnabled());
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
    }
    expect(inputs.map(input => input.lines[0]?.rateSource)).toEqual([undefined, "configuration", undefined]);
    expect(api.updateEstimateTier).not.toHaveBeenCalled();
  });

  it("retains an explicit same-tier selection for a manual saved price and Mode cancels it", async () => {
    const detail = fixture(); detail.lines[0] = { ...detail.lines[0]!, ratePaise: 3000, amountPaise: 6000 };
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling");
    await user.click(tier("Signature"));
    expect(screen.getByRole("button", { name: "Save tier selection" })).toBeEnabled();
    expect(screen.getByText("Selected amount: ₹100")).toBeVisible();
    await user.click(tier("Mode"));
    expect(screen.queryByRole("button", { name: "Save tier selection" })).not.toBeInTheDocument();
    expect(api.updateEstimateTier).not.toHaveBeenCalled();
    await user.click(tier("Signature"));
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalledExactlyOnceWith("project", "estimate-line", { expectedVersion: 7, modeTier: "signature", ...source }));
  });

  it("saves one server-priced line with exact source/version fences and refreshes working totals", async () => {
    const user = userEvent.setup(); const { client } = setup(); await screen.findByText("Ceiling");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(tier("Premium")); expect(screen.getByText("Selected amount: ₹140")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalledExactlyOnceWith("project", "estimate-line", { expectedVersion: 7, modeTier: "premium", ...source }));
    await screen.findByText(/Your tier selection is saved/);
    expect(screen.getByText("₹165.2")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["client"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads"] });
    expect(screen.queryByRole("button", { name: "Save tier selection" })).not.toBeInTheDocument();
  });

  it("clears old component IDs and requires explicit available components for the destination tier", async () => {
    const detail = fixture(); const line = detail.lines[0]!;
    line.pricingMode = "in_house"; line.selectedInHouseComponentIds = ["old"];
    line.choices[0]!.inHouseComponents = [{ id: "old", label: "Original work", ratePaise: 5000, available: true }];
    line.choices[1] = { ...line.choices[1]!, ratePaise: null, amountPaise: null, inHouseComponents: [
      { id: "new", label: "Painting", ratePaise: 0, available: true }, { id: "missing", label: "Materials", ratePaise: null, available: false }
    ] };
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling"); await user.click(tier("Premium"));
    expect(screen.queryByLabelText(/Original work/)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Painting/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Materials/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save tier selection" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Painting/ }));
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalledWith("project", "estimate-line", { expectedVersion: 7, modeTier: "premium", ...source, selectedInHouseComponentIds: ["new"] }));
  });

  it("preserves a conflicted selection and requires explicit latest-version acknowledgement", async () => {
    const user = userEvent.setup(); const { state } = setup();
    vi.mocked(api.updateEstimateTier).mockImplementationOnce(async () => {
      state.detail = { ...state.detail, estimateVersion: 8 };
      throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "Changed");
    });
    await screen.findByText("Ceiling"); await user.click(tier("Premium")); await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await screen.findByRole("alert"); expect(tier("Premium")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save tier selection" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Use latest choices" }));
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenLastCalledWith("project", "estimate-line", { expectedVersion: 8, modeTier: "premium", ...source }));
  });

  it("does not silently rebase local selection on a background estimate/source refresh", async () => {
    const user = userEvent.setup(); const { client, state } = setup(); await screen.findByText("Ceiling"); await user.click(tier("Premium"));
    state.detail = { ...state.detail, estimateVersion: 10, lines: state.detail.lines.map(line => ({ ...line, choices: line.choices.map(choice => ({ ...choice, source: choice.source ? { ...choice.source, itemVersion: 6 } : null })) })) };
    await act(async () => { client.setQueryData(api.estimateTiersKeys.detail("project"), state.detail); });
    expect(tier("Premium")).toBeChecked(); await waitFor(() => expect(screen.getByRole("button", { name: "Save tier selection" })).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Use latest choices" })); await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalledWith("project", "estimate-line", { expectedVersion: 10, modeTier: "premium", ...source, itemVersion: 6 }));
  });

  it("retains a failed selection and retries the same exact command", async () => {
    const user = userEvent.setup(); setup(); vi.mocked(api.updateEstimateTier).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Offline"));
    await screen.findByText("Ceiling"); await user.click(tier("Premium")); await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await screen.findByRole("alert"); expect(tier("Premium")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await waitFor(() => expect(api.updateEstimateTier).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateEstimateTier).mock.calls[1]).toEqual(vi.mocked(api.updateEstimateTier).mock.calls[0]);
  });

  it.each(["review_pending", "closed", "not_started"] as const)("keeps %s estimate choices read-only", async editingBlockReason => {
    setup({ ...fixture(), editingAllowed: false, editingBlockReason }); await screen.findByText("Ceiling");
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save tier selection" })).not.toBeInTheDocument();
  });

  it("hides cached item details after an authorization failure", async () => {
    const user = userEvent.setup(); setup(); await screen.findByText("Ceiling"); await user.click(tier("Premium"));
    vi.mocked(api.updateEstimateTier).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
    vi.mocked(api.getEstimateTiers).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
    await user.click(screen.getByRole("button", { name: "Save tier selection" }));
    await screen.findByText("Current estimate choices are unavailable. Refresh before making changes.");
    expect(screen.queryByText("Ceiling")).not.toBeInTheDocument(); expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("saves the complete group atomically and blocks duplicate commands", async () => {
    const detail = fixture(); detail.lines.push({ ...detail.lines[0]!, id: "second-line", mainLineId: "wall", mainLineName: "Wall" });
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling");
    const modes = screen.getByRole("group", { name: "Modes for Items in Living" });
    await user.click(within(modes).getByRole("radio", { name: /^Premium/ }));
    expect(screen.getAllByText("Selected amount: ₹140")).toHaveLength(2);
    let resolve!: (detail: api.EstimateTiersDetail) => void;
    vi.mocked(api.updateEstimateTierGroup).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const button = screen.getByRole("button", { name: "Save tier selection" }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(api.updateEstimateTierGroup).toHaveBeenCalledExactlyOnceWith("project", { expectedVersion: 7,
      lines: [{ lineItemId: "estimate-line", modeTier: "premium", ...source }, { lineItemId: "second-line", modeTier: "premium", ...source }] }));
    expect(api.updateEstimateTier).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel selection" })).toBeDisabled();
    await act(async () => { resolve({ ...detail, estimateVersion: 8 }); });
  });

  it("restores original mixed tiers with Mode without saving", async () => {
    const detail = fixture(); detail.lines.push({ ...detail.lines[0]!, id: "second-line", mainLineId: "wall", mainLineName: "Wall", modeTier: "premium" });
    const user = userEvent.setup(); setup(detail); await screen.findByText("Ceiling");
    await user.click(tier("Premium"));
    await user.click(tier("Mode"));
    expect(screen.queryByRole("button", { name: "Save tier selection" })).not.toBeInTheDocument();
    expect(api.updateEstimateTier).not.toHaveBeenCalled(); expect(api.updateEstimateTierGroup).not.toHaveBeenCalled();
  });
});
