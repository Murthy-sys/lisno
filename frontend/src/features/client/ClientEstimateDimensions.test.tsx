import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDimensionQuantity } from "../../../../shared/estimation/estimateDimensions";
import { ApiError } from "../../api/client";
import { ClientEstimateTiers } from "./ClientEstimateTiers";
import * as api from "./estimateTiersApi";

vi.mock("./estimateTiersApi", async original => ({ ...await original<typeof import("./estimateTiersApi")>(), getEstimateTiers: vi.fn(), updateEstimateTier: vi.fn(), updateEstimateDimensions: vi.fn() }));
const source = { revisionId: "revision", itemVersion: 4, revisionVersion: 2, uomId: "sq-ft" };
const fixture = (): api.EstimateTiersDetail => ({ projectId: "project", estimateId: "estimate", estimateVersion: 7, editingAllowed: true, editingBlockReason: null, totalPaise: 11800, isIncomplete: false,
  lines: [{ id: "estimate-line", mainLineId: "main-line", mainLineName: "Ceiling", roomName: "Living", quantity: 2, uomName: "sq ft",
    dimensionsMandatory: true, dimensionsNeedReview: false, dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "sq-ft", decimalScale: 2 },
    pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 5000, amountPaise: 10000, choices: [
      { modeTier: "signature", available: true, unavailableReason: null, ratePaise: 5000, amountPaise: 10000, source },
      { modeTier: "premium", available: true, unavailableReason: null, ratePaise: 7000, amountPaise: 14000, source },
      { modeTier: "functional", available: false, unavailableReason: "Not applicable", ratePaise: null, amountPaise: null, source }
    ] }] });
function setup(detail = fixture()) {
  const state = { detail };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } } });
  vi.mocked(api.getEstimateTiers).mockImplementation(async () => state.detail);
  vi.mocked(api.updateEstimateDimensions).mockImplementation(async (_project, id, input) => {
    state.detail = { ...state.detail, estimateVersion: state.detail.estimateVersion! + 1,
      lines: state.detail.lines.map(line => {
        if (line.id !== id) return line;
        const calculated = calculateDimensionQuantity(line.dimensionRule, input.dimensions)!;
        return { ...line, dimensions: calculated.dimensions, quantity: calculated.quantity, dimensionsNeedReview: false,
          amountPaise: line.ratePaise === null ? null : Math.round(line.ratePaise * calculated.quantity) };
      }) };
    return state.detail;
  });
  const view = render(<QueryClientProvider client={client}><ClientEstimateTiers projectId="project" /></QueryClientProvider>);
  return { ...view, client, state };
}
const tier = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
function enterDimensions(length = "2", width = "3", height = "4") {
  for (const [field, value] of [["Length", length], ["Width", width], ["Height", height]]) fireEvent.change(screen.getByRole("textbox", { name: new RegExp(`^${field}`) }), { target: { value } });
}
beforeEach(() => vi.clearAllMocks());

describe("client working estimate dimensions", () => {
  it("requires all inputs, calculates only length × width and sends no rate/tier/quantity edit", async () => {
    setup(); await screen.findByText("Ceiling"); expect(tier("Premium")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Enter dimensions for Ceiling" }));
    enterDimensions("2.5", "3", ""); expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Height/ }), { target: { value: "99" } });
    expect(screen.getByLabelText("Calculated quantity for Ceiling in Living")).toHaveTextContent("7.5");
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await screen.findByText(/Your dimensions are saved/);
    expect(api.updateEstimateDimensions).toHaveBeenCalledExactlyOnceWith("project", "estimate-line", { expectedVersion: 7, ...source, expectedDimensionRule: fixture().lines[0]!.dimensionRule, dimensions: { length: "2.5", width: "3", height: "99" } });
    expect(api.updateEstimateTier).not.toHaveBeenCalled(); expect(tier("Signature")).toBeChecked(); expect(tier("Premium")).toBeEnabled();
    expect(screen.getByText("Living · 7.5 sq ft")).toBeVisible(); expect(screen.getByText("₹375")).toBeVisible();
  });
  it("allows required measurements before a configured price is available", async () => {
    const detail = fixture(); detail.lines[0]!.choices.forEach(choice => { choice.available = false; choice.ratePaise = null; });
    setup(detail); await screen.findByText("Ceiling"); await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ }));
    enterDimensions(); expect(screen.getByRole("button", { name: "Save dimensions" })).toBeEnabled();
  });
  it("preserves conflicted measurements and explicitly reviews the refreshed rule before retry", async () => {
    const { state } = setup();
    vi.mocked(api.updateEstimateDimensions).mockImplementationOnce(async () => {
      const nextSource = { ...source, itemVersion: 5, uomId: "sq-m" };
      state.detail = { ...state.detail, estimateVersion: 8, lines: state.detail.lines.map(line => ({ ...line, uomName: "sq m", dimensionsNeedReview: true,
        dimensionRule: { formula: "length_width", inputUnit: "m", quantityUnit: "sq_m", uomId: "sq-m", decimalScale: 2 },
        choices: line.choices.map(choice => ({ ...choice, source: nextSource })) })) };
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED", "Changed");
    });
    await screen.findByText("Ceiling"); await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ })); enterDimensions();
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" })); await screen.findByRole("button", { name: "Use latest measurement rule" });
    expect(screen.getByRole("textbox", { name: /^Length/ })).toHaveValue("2"); expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Use latest measurement rule" }));
    expect(screen.getByRole("textbox", { name: /^Length \(m\)/ })).toHaveValue("2"); expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Confirm dimensions for/ })); await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await waitFor(() => expect(api.updateEstimateDimensions).toHaveBeenLastCalledWith("project", "estimate-line", { expectedVersion: 8, ...source, itemVersion: 5, uomId: "sq-m", expectedDimensionRule: state.detail.lines[0]!.dimensionRule, dimensions: { length: "2", width: "3", height: "4" } }));
  });
  it("blocks overlapping tier edits and double submission while measurements are saving", async () => {
    const detail = fixture(); setup(detail); await screen.findByText("Ceiling"); await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ })); enterDimensions();
    let resolve!: (value: api.EstimateTiersDetail) => void;
    vi.mocked(api.updateEstimateDimensions).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const save = screen.getByRole("button", { name: "Save dimensions" }); fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(api.updateEstimateDimensions).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: /^Length/ })).toBeDisabled(); expect(tier("Premium")).toBeDisabled(); expect(screen.getByRole("button", { name: "Cancel dimensions" })).toBeDisabled();
    await act(async () => resolve({ ...detail, estimateVersion: 8 }));
  });
  it("does not expose measurement mutation controls for a locked estimate", async () => {
    setup({ ...fixture(), editingAllowed: false, editingBlockReason: "review_pending" }); await screen.findByText("Ceiling");
    expect(screen.queryByRole("button", { name: /Enter dimensions/ })).not.toBeInTheDocument();
  });
  it("detects a same-ID unit-rule change even when estimate and Main Line versions are unchanged", async () => {
    const { client, state } = setup(); await screen.findByText("Ceiling");
    await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ })); enterDimensions();
    state.detail = { ...state.detail, lines: state.detail.lines.map(line => ({ ...line, uomName: "sq m", dimensionsNeedReview: true,
      dimensionRule: { ...line.dimensionRule!, inputUnit: "m", quantityUnit: "sq_m" } })) };
    await act(async () => { client.setQueryData(api.estimateTiersKeys.detail("project"), state.detail); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled());
    expect(screen.getByRole("textbox", { name: /^Length \(ft\)/ })).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: "Use latest measurement rule" }));
    expect(screen.getByRole("textbox", { name: /^Length \(m\)/ })).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: /Confirm dimensions for/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await waitFor(() => expect(api.updateEstimateDimensions).toHaveBeenCalledWith("project", "estimate-line", {
      expectedVersion: 7, ...source, expectedDimensionRule: state.detail.lines[0]!.dimensionRule, dimensions: { length: "2", width: "3", height: "4" }
    }));
  });
  it("preserves a failed measurement command and retries the same values and rule", async () => {
    setup(); vi.mocked(api.updateEstimateDimensions).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Retry"));
    await screen.findByText("Ceiling"); await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ })); enterDimensions();
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await screen.findByText("Your dimensions could not be saved. They are preserved; try again.");
    expect(screen.getByRole("textbox", { name: /^Height/ })).toHaveValue("4");
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await waitFor(() => expect(api.updateEstimateDimensions).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateEstimateDimensions).mock.calls[1]).toEqual(vi.mocked(api.updateEstimateDimensions).mock.calls[0]);
  });
  it("retains measurements and directs a configured price conflict to Sales without a futile retry", async () => {
    const { state } = setup(); vi.mocked(api.updateEstimateDimensions).mockRejectedValueOnce(new ApiError(409, "ESTIMATE_DIMENSIONS_PRICE_CHANGED", "Sales review required"));
    await screen.findByText("Ceiling"); await userEvent.click(screen.getByRole("button", { name: /Enter dimensions/ })); enterDimensions();
    await userEvent.click(screen.getByRole("button", { name: "Save dimensions" }));
    await screen.findByText("The configured price changed. Ask Sales to review this item before saving dimensions. Your measurements are preserved.");
    expect(screen.getByRole("textbox", { name: /^Length/ })).toHaveValue("2"); expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Use latest measurement rule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel dimensions" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Check for Sales update" }));
    expect(screen.getByRole("button", { name: "Save dimensions" })).toBeDisabled();
    state.detail = { ...state.detail, estimateVersion: 8 };
    await userEvent.click(screen.getByRole("button", { name: "Check for Sales update" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use latest measurement rule" }));
    expect(screen.getByRole("textbox", { name: /^Length/ })).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: /Confirm dimensions for/ }));
    expect(screen.getByRole("button", { name: "Save dimensions" })).toBeEnabled();
  });
});
