import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientQuotation } from "./ClientQuotation";
import { quotationKeys, type QuotationCandidate, type QuotationConfigureOperation, type QuotationDetail, type QuotationOperation, type QuotationSetupBasket } from "./quotationApi";

const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
const choices = [
  { modeTier: "signature" as const, available: true, unavailableReason: null, ratePaise: 50000, amountPaise: 100000, source },
  { modeTier: "premium" as const, available: true, unavailableReason: null, ratePaise: 75000, amountPaise: 150000, source }
];
const furniture: QuotationSetupBasket = { id: "furniture", name: "Furniture", subBaskets: [{ id: "storage", name: "Storage units", mainLineCount: 3, temporaryItemCount: 0 }], directTemporaryItemCount: 0, canSelect: true, canRemove: true, removalBlockedReason: null };
const lighting: QuotationSetupBasket = { id: "lighting", name: "Lighting", subBaskets: [], directTemporaryItemCount: 1, canSelect: true, canRemove: true, removalBlockedReason: null };
const desk: QuotationCandidate = { mainLineId: "desk", name: "Desk", source, pricingMode: "sub_vendor", modeTier: "signature", dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices,
  mainBasketId: furniture.id, mainBasketName: furniture.name, subBasketId: "storage", subBasketName: "Storage units" };
const pendant: QuotationCandidate = { ...desk, mainLineId: "pendant", name: "Pendant", mainBasketId: lighting.id, mainBasketName: lighting.name, subBasketId: null, subBasketName: null };

function fixture(): QuotationDetail {
  return {
    projectId: "project-one", estimateId: "estimate-one", estimateVersion: 7, workflowVersion: 3, pricedRevision: 2,
    phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null,
    totalPaise: 618000, isIncomplete: false, rooms: [{ id: "room-kitchen", name: "Kitchen" }],
    setup: { propertyType: "1BHK", bedroomCount: null, rooms: [{ id: "room-kitchen", typeId: "kitchen", label: "Kitchen", length: 12, width: 9, sqft: 108, canRemove: true, removalBlockedReason: null }], selectedMainBasketIds: [furniture.id], sourceToken: "scope-7", canConfigure: true },
    baskets: [{ id: furniture.id, name: furniture.name, subBaskets: [{ id: "storage", name: "Storage units" }] }],
    lines: [{ id: "line-storage", mainLineId: "storage", mainLineName: "Storage", roomId: "room-kitchen", roomName: "Kitchen", included: true, source,
      quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "premium", ratePaise: 75000, amountPaise: 150000, choices,
      mainBasketId: furniture.id, mainBasketName: furniture.name, subBasketId: "storage", subBasketName: "Storage units" }],
    excludedLines: [], groups: []
  };
}

type SavedInput = { expectedVersion: number; operations: QuotationOperation[] };

function setup(initial = fixture()) {
  const state = { detail: initial };
  const saves: SavedInput[] = [];
  let queryClient!: QueryClient;
  function Capture() { queryClient = useQueryClient(); return null; }
  const commit = (input: SavedInput) => {
    const configure = input.operations.find((operation): operation is QuotationConfigureOperation => operation.kind === "configure");
    const version = state.detail.estimateVersion! + 1;
    if (configure) {
      state.detail = { ...state.detail,
        rooms: configure.rooms.map(room => ({ id: room.id, name: room.label })),
        setup: { ...configure, sourceToken: `scope-${version}`, canConfigure: true, rooms: configure.rooms.map(room => ({ ...room, sqft: (room.length ?? 0) * (room.width ?? 0), canRemove: true, removalBlockedReason: null })) },
        baskets: [furniture, lighting].filter(basket => configure.selectedMainBasketIds.includes(basket.id)).map(basket => ({ id: basket.id, name: basket.name, subBaskets: basket.subBaskets.map(sub => ({ id: sub.id, name: sub.name })) }))
      };
    }
    state.detail = { ...state.detail, estimateVersion: version, pricedRevision: state.detail.pricedRevision + 1, status: "draft", reviewState: "awaiting_staff_review" };
  };
  server.use(
    http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision, status: state.detail.status, phase: state.detail.phase } })),
    http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: { projectId: state.detail.projectId, estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion, setup: state.detail.setup, baskets: [furniture, lighting] } })),
    http.get("/api/v1/projects/project-one/quotation/items", () => {
      const items = state.detail.setup?.selectedMainBasketIds.includes(lighting.id) ? [desk, pendant] : [desk];
      return HttpResponse.json({ data: { items, total: items.length, limit: 20, offset: 0 } });
    }),
    http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const input = await request.json() as SavedInput; saves.push(input); commit(input);
      return HttpResponse.json({ data: state.detail });
    })
  );
  const rendered = renderWithQuery(<><Capture /><ClientQuotation projectId="project-one" /></>);
  return { state, saves, commit, client: () => queryClient, ...rendered };
}

async function configure(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Configure estimate" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Property type: 1BHK" })).toBeEnabled());
}

async function property(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByRole("button", { name: /^Property type:/ }));
  await user.click(screen.getByRole("option", { name: value }));
}

describe("Client Sales-style estimate setup integration", () => {
  it("opens saved property, room dimensions and the complete safe basket selection without saving", async () => {
    const { saves, container } = setup(); const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Configure estimate" })).toHaveAccessibleDescription("Property type, rooms and Main Baskets");
    await configure(user);
    expect(screen.getByRole("button", { name: "Added Furniture" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Add Lighting" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("list", { name: "Selected rooms" })).toHaveTextContent("Kitchen");
    expect(screen.getByText("108 sqft")).toBeVisible();
    expect(saves).toEqual([]);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("saves pending item changes before opening property, room and Main Basket setup", async () => {
    const { state, saves, commit } = setup(); const user = userEvent.setup();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const input = await request.json() as SavedInput; saves.push(input); await pending;
      state.detail = { ...state.detail, lines: state.detail.lines.map(line => ({ ...line, quantity: 4 })) };
      commit(input);
      return HttpResponse.json({ data: state.detail });
    }));
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    const configureButton = screen.getByRole("button", { name: "Save and configure estimate" });
    expect(configureButton).toHaveAccessibleDescription("Property type, rooms and Main Baskets");
    await user.dblClick(configureButton);
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-storage", source, quantity: 4, modeTier: "premium", included: true }] });
    expect(screen.queryByRole("button", { name: /^Property type:/ })).not.toBeInTheDocument();
    expect(quantity).toHaveValue(4); expect(quantity).toBeDisabled();
    await act(async () => { release(); });
    expect(await screen.findByRole("button", { name: "Property type: 1BHK" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(4);
    expect(saves).toHaveLength(1);
  });

  it("exposes missing setup metadata and refreshes it without losing pending item changes", async () => {
    const initial = fixture(); delete initial.setup;
    const { state, saves, container } = setup(initial); const user = userEvent.setup();
    expect(await screen.findByText(/Property type, rooms and Main Baskets are unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Configure estimate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit baskets" })).toBeEnabled();
    const quantity = screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    expect(quantity).toBeEnabled();
    await user.clear(quantity); await user.type(quantity, "9");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    state.detail = { ...state.detail, setup: fixture().setup };
    await user.click(screen.getByRole("button", { name: "Refresh estimate setup" }));
    expect(await screen.findByRole("button", { name: "Save and configure estimate" })).toBeVisible();
    expect(screen.queryByText(/Property type, rooms and Main Baskets are unavailable/)).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(9);
    expect(screen.queryByRole("button", { name: /^Property type:/ })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it("does not offer setup recovery for a locked quotation", async () => {
    const initial = fixture(); delete initial.setup; initial.editingAllowed = false;
    setup(initial);
    expect(await screen.findByRole("button", { name: "View baskets" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Refresh estimate setup" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Property type, rooms and Main Baskets are unavailable/)).not.toBeInTheDocument();
  });

  it("saves a new room and basket in one standalone command before inline Main Line selection", async () => {
    const { saves, state } = setup(); const user = userEvent.setup();
    await configure(user);
    await property(user, "2BHK");
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Bedroom 2" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add Lighting" }));
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.expectedVersion).toBe(7);
    expect(saves[0]!.operations).toHaveLength(1);
    const command = saves[0]!.operations[0] as QuotationConfigureOperation;
    expect(command).toMatchObject({ kind: "configure", sourceToken: "scope-7", propertyType: "2BHK", selectedMainBasketIds: ["furniture", "lighting"] });
    expect(command.rooms).toEqual(expect.arrayContaining([{ id: "room-kitchen", typeId: "kitchen", label: "Kitchen", length: 12, width: 9 }, expect.objectContaining({ id: expect.any(String), typeId: "bedroom2", label: "Bedroom 2" })]));
    expect(command.rooms[1]!.id).not.toBe("room-kitchen");
    expect(await screen.findByRole("checkbox", { name: "Include Pendant in Kitchen" })).not.toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.detail.reviewState).toBe("awaiting_staff_review");
    expect(screen.getByText(/Your team will review the revised quotation before approval/)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Include Pendant in Kitchen" }));
    expect(saves).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual({ expectedVersion: 8, operations: [{ kind: "add", mainLineId: "pendant", roomId: "room-kitchen", source, quantity: 1, modeTier: "signature" }] });
  });

  it("selects a permitted Main Line in the builder without using the Add item dialog", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    const checkbox = await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    const quantity = screen.getByRole("spinbutton", { name: "Quantity for Desk in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "3");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toEqual([{ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "desk", roomId: "room-kitchen", source, quantity: 3, modeTier: "signature" }] }]));
  });

  it("adds an unselected builder candidate through the supporting dialog as a new line", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    expect(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = screen.getByRole("dialog", { name: "Add quotation item" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Item" }), "desk");
    await user.click(within(dialog).getByRole("button", { name: "Add to changes" }));
    expect(screen.getAllByRole("checkbox", { name: "Include Desk in Kitchen" })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toEqual([{ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "desk", roomId: "room-kitchen", source, quantity: 1, modeTier: "signature" }] }]));
  });

  it("prevents dialog duplication and restores a deselected pending add with its current quantity and tier", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" }));
    const quantity = screen.getByRole("spinbutton", { name: "Quantity for Desk in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "5");
    await user.click(screen.getByRole("radio", { name: "Premium tier for Desk in Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    let dialog = screen.getByRole("dialog", { name: "Add quotation item" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Item" }), "desk");
    expect(within(dialog).getByRole("button", { name: "Add to changes" })).toBeDisabled();
    expect(within(dialog).getByText(/This item is already in the quotation for this room/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    dialog = screen.getByRole("dialog", { name: "Add quotation item" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Item" }), "desk");
    expect(within(dialog).getByRole("spinbutton", { name: "Quantity for Desk in Kitchen Unit" })).toHaveValue(5);
    expect(within(dialog).getByRole("combobox", { name: "Configured option for Desk in Kitchen" })).toHaveValue("premium");
    await user.click(within(dialog).getByRole("button", { name: "Add to changes" }));
    expect(screen.getAllByRole("checkbox", { name: "Include Desk in Kitchen" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toEqual([{ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "desk", roomId: "room-kitchen", source, quantity: 5, modeTier: "premium" }] }]));
  });

  it("keeps saved and excluded choices when candidates repeat their Main Lines", async () => {
    const initial = fixture();
    initial.excludedLines = [{ ...initial.lines[0]!, id: "line-chair", mainLineId: "chair", mainLineName: "Chair", included: false, quantity: 9, amountPaise: 0 }];
    const { saves } = setup(initial); const user = userEvent.setup();
    server.use(http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ data: { items: [desk, { ...desk, mainLineId: "storage", name: "Storage" }, { ...desk, mainLineId: "chair", name: "Chair" }], total: 3, offset: 0, limit: 20 } })));
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(2);
    expect(screen.getByRole("radio", { name: "Premium tier for Storage in Kitchen" })).toBeChecked();
    expect(screen.getAllByRole("checkbox", { name: "Include Storage in Kitchen" })).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "Include Chair in Kitchen" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Chair in Kitchen Unit" })).toHaveValue(9);
    expect(screen.getByRole("radio", { name: "Premium tier for Chair in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-chair", source, quantity: 9, modeTier: "premium", included: true }] }));
  });

  it("loads further Main Lines without losing the earlier pending selection or sending duplicate rows", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    server.use(http.get("/api/v1/projects/project-one/quotation/items", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      return HttpResponse.json({ data: { items: offset === 0 ? [desk] : [{ ...desk, mainLineId: "shelf", name: "Shelf" }], total: 2, limit: 1, offset } });
    }));
    await user.click(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Load more Main Lines" }));
    await user.click(await screen.findByRole("checkbox", { name: "Include Shelf in Kitchen" }));
    expect(screen.getAllByRole("checkbox", { name: "Include Desk in Kitchen" })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]!.operations).toHaveLength(2));
    expect(saves[0]!.operations.map(operation => operation.kind === "add" ? operation.mainLineId : null)).toEqual(["desk", "shelf"]);
  });

  it("preserves an edited property and freezes setup saving when the estimate changes elsewhere", async () => {
    const { state, saves, client } = setup(); const user = userEvent.setup();
    await configure(user); await property(user, "2BHK");
    state.detail = { ...state.detail, estimateVersion: 8 };
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    expect(screen.getByText(/The quotation changed elsewhere/)).toBeVisible();
    expect(saves).toEqual([]);
  });

  it("retires actionable setup options after a denied refresh while preserving the property draft", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await configure(user); await property(user, "2BHK");
    server.use(http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Unavailable" } }, { status: 403 })));
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    expect(await screen.findByText(/Available setup could not be loaded/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeDisabled();
    const add = screen.queryByRole("button", { name: "Add Lighting" });
    if (add) expect(add).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    expect(saves).toEqual([]);
  });

  it("verifies the exact committed setup after a lost response before entering item selection", async () => {
    const { saves, commit } = setup(); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const input = await request.json() as SavedInput; saves.push(input); commit(input); return HttpResponse.error();
    }));
    await configure(user); await property(user, "2BHK");
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
    expect(saves).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Configure estimate" }));
    expect(await screen.findByRole("button", { name: "Property type: 2BHK" })).toBeVisible();
  });

  it("keeps unconfirmed setup changes and blocks blind retries when the save outcome is unknown", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as SavedInput); return HttpResponse.error();
    }));
    await configure(user); await property(user, "2BHK");
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(await screen.findByRole("button", { name: "Verify saved changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Verify saved changes" }));
    expect(saves).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: "Include Desk in Kitchen" })).not.toBeInTheDocument();
  });

  it("preserves a staged Main Line but blocks saving it after available items can no longer be read", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" }));
    server.use(http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Unavailable" } }, { status: 403 })));
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    expect(await screen.findByText(/Available Main Lines could not be refreshed/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText(/Refresh available items before saving/)).toBeVisible();
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByRole("region", { name: "Estimate summary" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText(/Refresh available items before saving/)).toBeVisible();
    expect(saves).toEqual([]);
  });

  it("confirms an unchanged setup after a lost no-op response without resetting its approved source version", async () => {
    const { saves, state } = setup(); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as SavedInput); return HttpResponse.error();
    }));
    await configure(user); await property(user, "2BHK"); await property(user, "1BHK");
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(await screen.findByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
    expect(state.detail.estimateVersion).toBe(7);
    expect(state.detail.reviewState).toBe("ready_for_approval");
    expect(saves).toHaveLength(1);
  });

  it("retains invalid variable-bedroom input when the user tries to leave setup through another view", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await configure(user); await property(user, "Villa");
    const bedrooms = screen.getByRole("spinbutton", { name: "Number of bedrooms" });
    await user.type(bedrooms, "51");
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByRole("spinbutton", { name: "Number of bedrooms" })).toHaveValue(51);
    expect(screen.getByRole("button", { name: "Property type: Villa" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Estimate summary" })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
  });
});
