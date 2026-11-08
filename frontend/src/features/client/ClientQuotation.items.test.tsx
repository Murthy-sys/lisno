import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import * as loginSession from "../../auth/loginReviewSession";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientQuotation } from "./ClientQuotation";
import { quotationKeys, type QuotationCandidate, type QuotationDetail, type QuotationOperation, type QuotationSetupCatalogue } from "./quotationApi";

const source = { revisionId: "revision-current", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
const choices = [{ modeTier: "signature" as const, available: true, unavailableReason: null, ratePaise: 50000, amountPaise: 50000, source }];
const furniture = { id: "furniture", name: "Furniture", subBaskets: [{ id: "storage", name: "Storage", mainLineCount: 1, temporaryItemCount: 0 }],
  directTemporaryItemCount: 0, canSelect: true, canRemove: true, removalBlockedReason: null };
const lighting = { ...furniture, id: "lighting", name: "Lighting", subBaskets: [
  { id: "ceiling", name: "Ceiling lights", mainLineCount: 2, temporaryItemCount: 0 },
  { id: "wall", name: "Wall lights", mainLineCount: 1, temporaryItemCount: 0 }
] };
const pendant: QuotationCandidate = { mainLineId: "pendant", name: "Pendant", source, pricingMode: "sub_vendor", modeTier: "signature",
  dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices, mainBasketId: "lighting", mainBasketName: "Lighting", subBasketId: "ceiling", subBasketName: "Ceiling lights" };
const catalogueItems: QuotationCandidate[] = [pendant, { ...pendant, mainLineId: "spot", name: "Spotlight" },
  { ...pendant, mainLineId: "sconce", name: "Sconce", subBasketId: "wall", subBasketName: "Wall lights" }];

function fixture(): QuotationDetail {
  return { projectId: "project-one", estimateId: "estimate-one", estimateVersion: 7, workflowVersion: 3, pricedRevision: 2,
    phase: "pre", status: "draft", reviewState: "draft", editingAllowed: true, editingBlockReason: null, totalPaise: 177000,
    isIncomplete: false, rooms: [{ id: "room-one", name: "Kitchen" }, { id: "room-two", name: "Bedroom" }],
    setup: { propertyType: "1BHK", bedroomCount: null, rooms: [
      { id: "room-one", typeId: "kitchen", label: "Kitchen", length: 12, width: 9, sqft: 108, canRemove: true, removalBlockedReason: null },
      { id: "room-two", typeId: "bedroom", label: "Bedroom", length: 10, width: 10, sqft: 100, canRemove: true, removalBlockedReason: null }
    ], selectedMainBasketIds: [furniture.id], sourceToken: "scope-7", canConfigure: true }, baskets: [furniture], groups: [], excludedLines: [],
    lines: [{ id: "saved-one", mainLineId: "cabinet", mainLineName: "Cabinet", roomId: "room-one", roomName: "Kitchen", included: true, source,
      quantity: 1, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 50000, amountPaise: 50000, choices,
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "storage", subBasketName: "Storage" },
    { id: "saved-two", mainLineId: "wardrobe", mainLineName: "Wardrobe", roomId: "room-two", roomName: "Bedroom", included: true, source,
      quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 50000, amountPaise: 100000, choices,
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "storage", subBasketName: "Storage" }] };
}

function setup() {
  const state = { detail: fixture() };
  const saves: Array<{ expectedVersion: number; operations: QuotationOperation[] }> = [];
  const reads: URLSearchParams[] = [];
  let queryClient!: QueryClient;
  function Capture() { queryClient = useQueryClient(); return null; }
  const hierarchy = (): QuotationSetupCatalogue => ({ projectId: state.detail.projectId, estimateId: state.detail.estimateId!,
    estimateVersion: state.detail.estimateVersion!, setup: state.detail.setup!, baskets: [furniture, lighting] });
  server.use(
    http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { estimateId: state.detail.estimateId,
      estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision, status: state.detail.status, phase: state.detail.phase } })),
    http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: hierarchy() })),
    http.get("/api/v1/projects/project-one/quotation/items", ({ request }) => {
      const filters = new URL(request.url).searchParams; reads.push(filters);
      const items = catalogueItems.filter(item => (!filters.get("mainBasketId") || item.mainBasketId === filters.get("mainBasketId")) &&
        (!filters.get("subBasketId") || item.subBasketId === filters.get("subBasketId")) &&
        (!filters.get("search") || item.name.toLocaleLowerCase().includes(filters.get("search")!.toLocaleLowerCase())));
      return HttpResponse.json({ data: { items, total: items.length, limit: 20, offset: Number(filters.get("offset") ?? 0) } });
    }),
    http.post("/api/v1/projects/project-one/quotation/recommendations/query", async ({ request }) => {
      const input = await request.json() as { roomId: string; offset: number };
      return HttpResponse.json({ data: { projectId: state.detail.projectId, estimateId: state.detail.estimateId,
        estimateVersion: state.detail.estimateVersion, roomId: input.roomId, items: [], total: 0, limit: 20, offset: input.offset } });
    }),
    http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const input = await request.json() as typeof saves[number]; saves.push(input);
      for (const operation of input.operations) {
        if (operation.kind !== "add") continue;
        const item = catalogueItems.find(item => item.mainLineId === operation.mainLineId)!;
        state.detail = { ...state.detail, lines: [...state.detail.lines, { ...item, id: `saved-${item.mainLineId}`, mainLineName: item.name,
          roomId: operation.roomId, roomName: state.detail.rooms.find(room => room.id === operation.roomId)!.name,
          included: true, quantity: operation.quantity, modeTier: operation.modeTier, ratePaise: 50000, amountPaise: 50000 }],
          baskets: [furniture, lighting], setup: { ...state.detail.setup!, selectedMainBasketIds: [furniture.id, lighting.id] } };
      }
      state.detail = { ...state.detail, estimateVersion: 8, pricedRevision: 3, totalPaise: 236000, reviewState: "awaiting_staff_review" };
      return HttpResponse.json({ data: state.detail });
    })
  );
  const view = renderWithQuery(<><Capture /><ClientQuotation projectId="project-one" /></>);
  return { ...view, state, saves, reads, hierarchy, client: () => queryClient };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add items" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Pendant" })).toBeEnabled());
}

afterEach(() => vi.restoreAllMocks());

describe("Client additions from all eligible baskets", () => {
  it("browses all eligible hierarchy and adds exactly one item into its parent group before save/reload", async () => {
    const { saves, state, reads, client, container } = setup(); const user = userEvent.setup();
    const original = structuredClone(state.detail.lines);
    await openPicker(user);
    const main = screen.getByRole("combobox", { name: "Main Basket" });
    expect(within(main).getByRole("option", { name: "Lighting" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lighting" })).not.toBeInTheDocument();
    await user.selectOptions(main, "lighting");
    const sub = screen.getByRole("combobox", { name: "Sub Basket" });
    expect(within(sub).getAllByRole("option").map(option => option.textContent)).toEqual(["All sub baskets", "Ceiling lights", "Wall lights"]);
    await user.selectOptions(sub, "ceiling");
    await user.type(screen.getByRole("searchbox", { name: "Search available items" }), "Pendant");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Pendant" })).toBeEnabled());
    expect(reads.at(-1)?.get("mainBasketId")).toBe("lighting");
    expect(reads.at(-1)?.get("subBasketId")).toBe("ceiling");
    expect(screen.queryByRole("button", { name: "Add Spotlight" })).not.toBeInTheDocument();
    await user.dblClick(screen.getByRole("button", { name: "Add Pendant" }));
    const group = screen.getByRole("region", { name: "Lighting" });
    expect(within(group).getByRole("region", { name: "Ceiling lights" })).toBeVisible();
    expect(within(group).getAllByRole("group", { name: "Pendant Kitchen" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Added Pendant" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove visible items from Ceiling lights in Kitchen" })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
    expect(state.detail.setup!.selectedMainBasketIds).toEqual(["furniture"]);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toEqual([{ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "pendant", roomId: "room-one", source, quantity: 1, modeTier: "signature" }] }]));
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    expect(state.detail.lines.slice(0, 2)).toEqual(original);
    expect(state.detail.lines.map(line => line.mainLineId)).toEqual(["cabinet", "wardrobe", "pendant"]);
    expect(state.detail.setup!.selectedMainBasketIds).toEqual(["furniture", "lighting"]);
    expect(screen.getByRole("group", { name: "Pendant Kitchen" })).toBeVisible();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /^Bedroom/ }));
    expect(screen.queryByRole("group", { name: /Pendant/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Wardrobe Bedroom" })).toBeVisible();
  });

  it("resets sub-basket filters and does not select a basket merely by browsing", async () => {
    const { saves, state } = setup(); const user = userEvent.setup(); await openPicker(user);
    const main = screen.getByRole("combobox", { name: "Main Basket" });
    const sub = screen.getByRole("combobox", { name: "Sub Basket" });
    await user.selectOptions(main, "lighting"); await user.selectOptions(sub, "wall");
    await user.selectOptions(main, "furniture");
    expect(sub).toHaveValue("all");
    expect(within(sub).queryByRole("option", { name: "Wall lights" })).not.toBeInTheDocument();
    expect(within(sub).getByRole("option", { name: "Storage" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(state.detail.setup!.selectedMainBasketIds).toEqual(["furniture"]); expect(saves).toEqual([]);
  });

  it("undoes a new-basket item without saving an empty basket", async () => {
    const { saves, state } = setup(); const user = userEvent.setup(); await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Add Pendant" }));
    await user.click(within(screen.getByRole("group", { name: "Pendant Kitchen" })).getByRole("button", { name: "More options for Pendant in Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Remove from estimate" }));
    expect(screen.queryByRole("region", { name: "Lighting" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument());
    expect(saves).toEqual([]); expect(state.detail.setup!.selectedMainBasketIds).toEqual(["furniture"]);
  });

  it.each(["project", "estimate", "version"])("rejects a catalogue for another %s without exposing its hierarchy", async mismatch => {
    const { hierarchy, saves } = setup(); const user = userEvent.setup();
    server.use(http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: { ...hierarchy(),
      ...(mismatch === "project" ? { projectId: "project-two" } : mismatch === "estimate" ? { estimateId: "estimate-two" } : { estimateVersion: 6 }) } })));
    await user.click(await screen.findByRole("button", { name: "Add items" }));
    expect(await screen.findByText("Available items changed. Refresh before adding.")).toBeVisible();
    expect(screen.queryByRole("option", { name: "Lighting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Pendant" })).not.toBeInTheDocument(); expect(saves).toEqual([]);
  });

  it("hides stale hierarchy on a failed refresh and retries without losing existing draft edits", async () => {
    const { client, hierarchy, saves } = setup(); const user = userEvent.setup(); await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Increase quantity for Cabinet in Kitchen" }));
    server.use(http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ error: { message: "Unavailable" } }, { status: 503 })));
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.setup("project-one") }); });
    expect(await screen.findByText("Available items could not be loaded.")).toBeVisible();
    expect(screen.queryByRole("option", { name: "Lighting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Pendant" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Quantity for Cabinet in Kitchen Unit" })).toHaveValue(2);
    server.use(http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: hierarchy() })));
    await user.click(screen.getByRole("button", { name: "Retry items" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Pendant" })).toBeEnabled()); expect(saves).toEqual([]);
  });

  it("does not reuse picker hierarchy from a previous login session", async () => {
    const session = vi.spyOn(loginSession, "captureLoginReviewSession").mockReturnValue({ id: "session-one", userId: "client-one" });
    const { client, saves } = setup(); const user = userEvent.setup(); await openPicker(user);
    session.mockReturnValue({ id: "session-two", userId: "client-two" });
    server.use(http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ error: { message: "Unavailable" } }, { status: 403 })));
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    expect(await screen.findByText("Available items could not be loaded.")).toBeVisible();
    expect(screen.queryByRole("option", { name: "Lighting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Pendant" })).not.toBeInTheDocument(); expect(saves).toEqual([]);
  });
});
