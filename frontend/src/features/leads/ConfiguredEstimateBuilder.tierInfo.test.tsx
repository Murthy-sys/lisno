import type { ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { getEstimateTierComparison, type EstimateTierComparison, type EstimateTierComparisonRequest } from "../estimates/estimateTierComparisonApi";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import { createConfiguredLine, type ConfiguredLineDraft, type ConfiguredTierGroupScope } from "./configuredEstimate";
import type { EstimationCatalogue, EstimationCatalogueMainLine } from "./estimationCatalogueApi";

vi.mock("../estimates/estimateTierComparisonApi", async importOriginal => ({
  ...await importOriginal<typeof import("../estimates/estimateTierComparisonApi")>(),
  getEstimateTierComparison: vi.fn()
}));
const read = vi.mocked(getEstimateTierComparison);
const rooms = [{ id: "living", typeId: "living", label: "Living Room", sqft: 100 },
  { id: "bedroom", typeId: "bedroom", label: "Bedroom", sqft: 70 }];
const moneyPaise = (value: number) => `₹${value / 100}`;
const tiers = ["signature", "premium", "functional"] as const;

function fixture() {
  const source = (mainLineId: string, name: string, subBasketId: string, rate: number): EstimationCatalogueMainLine => ({
    id: mainLineId, mainLineId, name, basketId: "interiors", subBasketId, displayOrder: 1,
    revisionId: `revision-${mainLineId}`, itemVersion: 2, revisionVersion: 3,
    uom: { id: "sqft", code: "SQFT", name: "sq ft", decimalScale: 2 },
    applicableTiers: [...tiers], modeBaseRatesPaise: { pmc: rate, sub_vendor: rate, in_house: null },
    tierPricing: Object.fromEntries(tiers.map(modeTier => [modeTier, { modeBaseRatesPaise: { pmc: rate, sub_vendor: rate, in_house: null } }]))
  });
  const mainLines = Array.from({ length: 23 }, (_, index) => source(`finish-${index}`, `Finish ${String(index).padStart(2, "0")}`, "finishes", 1200 + index * 100));
  const catalogue: EstimationCatalogue = { ineligibleLineCount: 0, items: [{
    id: "interiors", name: "Interiors", displayOrder: 1,
    directTemporaryItems: [{ ...source("direct-work", "Direct work", "unused", 3300), itemType: "temporary", subBasketId: null }],
    subBaskets: [
      { id: "finishes", basketId: "interiors", name: "Finishes", displayOrder: 1, mainLines },
      { id: "walls", basketId: "interiors", name: "Walls", displayOrder: 2, mainLines: [source("wall-finish", "Wall finish", "walls", 7700)] }
    ]
  }] };
  const line = (mainLineId: string, subBasketId: string | null, quantity: number, room = rooms[0]!) => ({
    ...createConfiguredLine(catalogue, room, { mainLineId, basketId: "interiors", subBasketId })!,
    included: true, quantity, pricingMode: "sub_vendor" as const, modeTier: "signature" as const,
    rateSource: "configuration" as const, rateInput: "12"
  });
  const lines: ConfiguredLineDraft[] = [
    ...mainLines.map((item, index) => ({ ...line(item.mainLineId, "finishes", index === 0 ? 2 : index === 21 ? 5 : 1), included: index < 22 })),
    line("finish-0", "finishes", 17, rooms[1]),
    line("wall-finish", "walls", 3), line("direct-work", null, 4)
  ];
  return { catalogue, lines };
}

function request(scope: ConfiguredTierGroupScope, lines: readonly ConfiguredLineDraft[]): EstimateTierComparisonRequest {
  return { target: { kind: "lead", id: "lead-one" }, input: { ...scope, expectedVersion: 7,
    lines: lines.map(line => ({ mainLineId: line.mainLineId, revisionId: line.revisionId, itemVersion: line.itemVersion!,
      revisionVersion: line.revisionVersion!, uomId: line.uomId, quantity: line.quantity,
      pricingMode: line.pricingMode ?? "sub_vendor", modeTier: line.modeTier ?? "signature", rateSource: line.rateSource })) } };
}

function response({ input }: EstimateTierComparisonRequest): EstimateTierComparison {
  return { roomId: input.roomId, roomName: rooms.find(room => room.id === input.roomId)!.label,
    mainBasketId: input.mainBasketId, mainBasketName: "Interiors", subBasketId: input.subBasketId,
    subBasketName: input.subBasketId === null ? null : input.subBasketId === "walls" ? "Walls" : "Finishes", estimateVersion: input.expectedVersion!,
    tiers: (["current", ...tiers] as const).map(modeTier => {
      const lines = input.lines.map(line => {
        const ratePaise = line.mainLineId === "wall-finish" ? 7700 : line.mainLineId === "direct-work" ? 3300 : 1200 + Number(line.mainLineId.slice(7)) * 100;
        return { mainLineId: line.mainLineId, name: line.mainLineId, quantity: line.quantity, uomName: "sq ft",
          ratePaise, amountPaise: ratePaise * line.quantity, unavailableReason: null };
      });
      return { modeTier, label: modeTier === "current" ? "Mode" : modeTier, available: true,
        subtotalPaise: lines.reduce((total, line) => total + line.amountPaise, 0), lines };
    }) };
}

type BuilderProps = ComponentProps<typeof ConfiguredEstimateBuilder>;
function setup() {
  const data = fixture();
  const onUpdateLine = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let props: BuilderProps = { ...data, rooms, activeRoomId: "living", onSelectRoom: vi.fn(),
    selectedMainBasketIds: new Set(["interiors"]), itemPresentation: "catalogue", onUpdateLine,
    tierSuggestionContext: "actor-one/session-one/lead-one", getTierComparison: request,
    onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false, roomTotal: () => 0, roomIcons: {}, moneyPaise, editable: true };
  const tree = () => <QueryClientProvider client={client}><ConfiguredEstimateBuilder {...props} /></QueryClientProvider>;
  const view = render(tree());
  return { ...data, onUpdateLine, update: (change: Partial<BuilderProps>) => { props = { ...props, ...change }; view.rerender(tree()); } };
}

const mainTrigger = () => screen.getByRole("button", { name: "Tier price information for Interiors, Finishes in Living Room" });
async function openMainInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(mainTrigger());
  const dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Finishes in Living Room" });
  expect(await within(dialog).findAllByText("₹12 / sq ft; ₹24 for 2 sq ft, excluding GST.", {}, { timeout: 1500 })).toHaveLength(3);
  return dialog;
}

beforeEach(() => { read.mockReset(); read.mockImplementation(async input => response(input)); });

describe("Configured estimate Sub Basket information scope", () => {
  it("places comparison after information in the removable Sub Basket header with independent controls", async () => {
    const user = userEvent.setup(); const data = setup();
    const onRemoveSubBasket = vi.fn(); data.update({ onRemoveSubBasket });
    const group = screen.getByRole("region", { name: "Finishes" });
    const header = group.querySelector<HTMLElement>(".configured-estimate-sub-basket__header")!;
    const info = within(header).getByRole("button", { name: "Tier price information for Interiors, Finishes in Living Room" });
    const comparison = within(header).getByRole("button", { name: "Check tier comparison for Interiors, Finishes in Living Room" });
    const remove = within(header).getByRole("button", { name: "Remove Finishes Sub Basket from Living Room" });
    const disclosure = within(header).getByRole("button", { name: /^Finishes,/ });
    expect(Array.from(header.querySelectorAll("button"))).toEqual([disclosure, info, comparison, remove]);
    expect(group.querySelectorAll(".estimate-sub-basket-modes")).toHaveLength(1);
    expect(comparison.parentElement?.tagName).toBe("SPAN");
    const directComparison = screen.getByRole("button", { name: "Check tier comparison for Direct items in Interiors in Living Room" });
    expect(directComparison.parentElement?.tagName).toBe("DIV");

    await user.click(comparison);
    const dialog = screen.getByRole("dialog", { name: "Price comparison: Interiors, Finishes in Living Room" });
    expect(await within(dialog).findByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(comparison).toHaveFocus();
    expect(onRemoveSubBasket).not.toHaveBeenCalled();
    expect(data.onUpdateLine).not.toHaveBeenCalled();
    await user.click(remove);
    expect(onRemoveSubBasket).toHaveBeenCalledWith({ roomId: "living", mainBasketId: "interiors", subBasketId: "finishes" });
  });

  it("reads only on opening and includes selected lines beyond pagination/search without including other scopes", async () => {
    const user = userEvent.setup(); const data = setup();
    expect(screen.queryByRole("checkbox", { name: "Include Finish 21 in Living Room" })).not.toBeInTheDocument();
    expect(screen.queryByText(/If you choose/)).not.toBeInTheDocument();
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(read).not.toHaveBeenCalled();

    let dialog = await openMainInfo(user);
    expect(within(dialog).getAllByRole("heading", { level: 3 })).toHaveLength(22);
    expect(within(dialog).getByRole("heading", { name: "Finish 21" })).toBeVisible();
    const input = read.mock.calls[0]![0].input;
    expect(input).toMatchObject({ roomId: "living", mainBasketId: "interiors", subBasketId: "finishes" });
    expect(input.lines).toHaveLength(22);
    expect(input.lines.find(line => line.mainLineId === "finish-0")?.quantity).toBe(2);
    expect(input.lines.find(line => line.mainLineId === "finish-21")?.quantity).toBe(5);
    expect(input.lines.some(line => ["finish-22", "wall-finish", "direct-work"].includes(line.mainLineId))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Finish 00");
    const group = screen.getByRole("region", { name: "Finishes" });
    const disclosure = within(group).getByRole("button", { name: /^Finishes,/ });
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(mainTrigger()).toBeVisible();
    dialog = await openMainInfo(user);
    expect(within(dialog).getAllByRole("heading", { level: 3 })).toHaveLength(22);
    expect(within(dialog).getByRole("heading", { name: "Finish 21" })).toBeVisible();
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(data.onUpdateLine).not.toHaveBeenCalled();
  });

  it("separates Direct items and an unequal Sub Basket while information reads leave the draft unchanged", async () => {
    const user = userEvent.setup(); const data = setup();
    await user.click(screen.getByRole("button", { name: "Tier price information for Direct items in Interiors in Living Room" }));
    let dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Direct items in Living Room" });
    await waitFor(() => expect(within(dialog).getAllByText("₹33 / sq ft; ₹132 for 4 sq ft, excluding GST.")).toHaveLength(3));
    expect(read.mock.calls[0]![0].input).toMatchObject({ subBasketId: null, lines: [{ mainLineId: "direct-work", quantity: 4 }] });
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Tier price information for Interiors, Walls in Living Room" }));
    dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Walls in Living Room" });
    await waitFor(() => expect(within(dialog).getAllByText("₹77 / sq ft; ₹231 for 3 sq ft, excluding GST.")).toHaveLength(3));
    expect(read.mock.calls.at(-1)![0].input).toMatchObject({ subBasketId: "walls", lines: [{ mainLineId: "wall-finish", quantity: 3 }] });
    expect(data.onUpdateLine).not.toHaveBeenCalled();
  });

  it.each(["identity", "room", "group"] as const)("dismisses information when its %s context changes", async change => {
    const user = userEvent.setup(); const data = setup(); await openMainInfo(user);
    if (change === "identity") data.update({ tierSuggestionContext: "actor-two/session-two/lead-one" });
    else if (change === "room") data.update({ activeRoomId: "bedroom" });
    else data.update({ catalogue: { ...data.catalogue, items: data.catalogue.items.map(basket => ({ ...basket,
      subBaskets: basket.subBaskets.filter(subBasket => subBasket.id !== "finishes") })) } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText(/If you choose/)).not.toBeInTheDocument();
    expect(data.onUpdateLine).not.toHaveBeenCalled();
  });

  it("keeps tiers blocked for an invalid included line until explicit exclusion and a fresh scope read", async () => {
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."));
    const user = userEvent.setup(); const data = setup();
    const pair = data.lines.filter(line => line.roomId === "living" && ["finish-0", "finish-1"].includes(line.mainLineId));
    data.update({ lines: pair });
    const tierOptions = (name: string) => screen.getAllByRole("radio", {
      name: new RegExp(`tier for Interiors, Finishes, ${name} in Living Room$`)
    });
    for (const option of [...tierOptions("Finish 00"), ...tierOptions("Finish 01")]) expect(option).toBeEnabled();

    await user.click(mainTrigger());
    let dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Finishes in Living Room" });
    expect(await within(dialog).findAllByText("The estimate or Configuration changed. Refresh before comparing tier prices.")).toHaveLength(6);
    expect(read.mock.calls[0]![0].input.lines.map(line => line.mainLineId)).toEqual(["finish-0", "finish-1"]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    for (const option of [...tierOptions("Finish 00"), ...tierOptions("Finish 01")]) expect(option).toBeDisabled();

    const invalidLines = pair.map(line => line.mainLineId === "finish-0" ? { ...line, quantity: 0 } : line);
    data.update({ lines: invalidLines });
    await user.click(mainTrigger());
    dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Finishes in Living Room" });
    expect(await within(dialog).findAllByText("₹13 / sq ft; ₹13 for 1 sq ft, excluding GST.")).toHaveLength(3);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]![0].input.lines).toMatchObject([{ mainLineId: "finish-1", quantity: 1 }]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    for (const option of [...tierOptions("Finish 00"), ...tierOptions("Finish 01")]) expect(option).toBeDisabled();

    data.update({ lines: invalidLines.map(line => line.mainLineId === "finish-0" ? { ...line, included: false } : line) });
    for (const option of tierOptions("Finish 01")) expect(option).toBeDisabled();
    await user.click(mainTrigger());
    dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Finishes in Living Room" });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(await within(dialog).findAllByText("₹13 / sq ft; ₹13 for 1 sq ft, excluding GST.")).toHaveLength(3);
    expect(read.mock.calls[2]![0].input.lines).toMatchObject([{ mainLineId: "finish-1", quantity: 1 }]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => { for (const option of tierOptions("Finish 01")) expect(option).toBeEnabled(); });
    expect(data.onUpdateLine).not.toHaveBeenCalled();
  });

  it("cancels a pending information read on close and ignores its late result", async () => {
    let resolve!: (result: EstimateTierComparison) => void;
    read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); const data = setup();
    await user.click(mainTrigger());
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    const [requested, signal] = read.mock.calls[0]!;
    const dialog = screen.getByRole("dialog", { name: "Tier prices: Interiors, Finishes in Living Room" });
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => { resolve(response(requested)); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/If you choose/)).not.toBeInTheDocument();
    expect(data.onUpdateLine).not.toHaveBeenCalled();
  });
});
