import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import axe from "axe-core";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientQuotation } from "./ClientQuotation";
import { quotationKeys, type QuotationCandidate, type QuotationDetail } from "./quotationApi";

const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
const choices = [{ modeTier: "signature" as const, available: true, unavailableReason: null, ratePaise: 50000, amountPaise: 100000, source },
  { modeTier: "premium" as const, available: true, unavailableReason: null, ratePaise: 75000, amountPaise: 150000, source }];
const detail: QuotationDetail = {
  projectId: "project-one", estimateId: "estimate-one", estimateVersion: 7, workflowVersion: 3, pricedRevision: 2,
  phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null,
  totalPaise: 618000, isIncomplete: false, rooms: [{ id: "room-one", name: "Living Room" }],
  lines: [{ id: "line-one", mainLineId: "storage", mainLineName: "Storage", roomId: "room-one", roomName: "Living Room", included: true, source,
    quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 50000, amountPaise: 100000, choices }]
};
const candidate: QuotationCandidate = { mainLineId: "desk", name: "Desk", source, pricingMode: "sub_vendor", modeTier: "signature",
  dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices };

function groupedDetail(): QuotationDetail {
  const base = { ...detail.lines[0]!, mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "storage", subBasketName: "Storage units" };
  return { ...structuredClone(detail), rooms: [{ id: "room-one", name: "Kitchen" }, { id: "room-two", name: "Bedroom" }],
    baskets: [{ id: "furniture", name: "Furniture", subBaskets: [{ id: "storage", name: "Storage units" }] }], excludedLines: [],
    lines: [{ ...base, roomName: "Kitchen" },
      { ...base, id: "line-shelf", mainLineId: "shelf", mainLineName: "Shelf", roomName: "Kitchen", quantity: 3, amountPaise: 150000 },
      { ...base, id: "line-bedroom", roomId: "room-two", roomName: "Bedroom", quantity: 5, amountPaise: 250000 }],
    groups: [{ mainBasketId: "furniture", subBasketId: null, roomId: null, includedCount: 3, sourceToken: "basket-all" },
      { mainBasketId: "furniture", subBasketId: "storage", roomId: "room-one", includedCount: 2, sourceToken: "storage-kitchen" },
      { mainBasketId: "furniture", subBasketId: "storage", roomId: "room-two", includedCount: 1, sourceToken: "storage-bedroom" }] };
}

function setup(value: QuotationDetail = structuredClone(detail), readOnly = false, withRouter = false, workspace = false) {
  const state = { detail: value };
  const saves: Array<Record<string, unknown>> = [];
  let queryClient!: QueryClient;
  function Capture() { queryClient = useQueryClient(); return null; }
  server.use(
    http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: {
      projectId: state.detail.projectId, estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion,
      setup: state.detail.setup ?? { propertyType: "1BHK", bedroomCount: null, rooms: [], selectedMainBasketIds: [], sourceToken: "fixture-scope", canConfigure: false },
      baskets: (state.detail.baskets ?? []).map(basket => ({ ...basket, canSelect: true, canRemove: true, removalBlockedReason: null, directTemporaryItemCount: 0,
        subBaskets: basket.subBaskets.map(sub => ({ ...sub, mainLineCount: 1, temporaryItemCount: 0 })) }))
    } })),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { estimateId: "estimate-one", estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision, status: state.detail.status, phase: state.detail.phase } })),
    http.get("/api/v1/projects/project-one/quotation/items", () => {
      const items = [candidate, ...(state.detail.excludedLines ?? []).map(line => ({ ...candidate, mainLineId: line.mainLineId,
        name: line.mainLineName, mainBasketId: line.mainBasketId, subBasketId: line.subBasketId, source: line.source ?? source }))];
      return HttpResponse.json({ data: { items, total: items.length, limit: 20, offset: 0 } });
    }),
    http.post("/api/v1/projects/project-one/quotation/recommendations/query", async ({ request }) => {
      const input = await request.json() as { roomId: string; offset: number };
      return HttpResponse.json({ data: { projectId: state.detail.projectId, estimateId: state.detail.estimateId,
        estimateVersion: state.detail.estimateVersion, roomId: input.roomId, items: [], total: 0, limit: 20, offset: input.offset } });
    }),
    http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>);
      state.detail = { ...state.detail, estimateVersion: 8, pricedRevision: 3, status: "draft", reviewState: "awaiting_staff_review" };
      return HttpResponse.json({ data: state.detail });
    })
  );
  const quotation = <><Capture /><ClientQuotation projectId="project-one" readOnly={readOnly} workspace={workspace} /></>;
  const router = withRouter ? createMemoryRouter([
    { path: "/estimate", element: <><Link to="/project">Back to project</Link>{quotation}</> },
    { path: "/project", element: <h1>Project overview</h1> }
  ], { initialEntries: ["/estimate"] }) : null;
  const rendered = renderWithQuery(router ? <RouterProvider router={router} /> : quotation);
  return { state, saves, router, client: () => queryClient, ...rendered };
}

async function chooseItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = screen.queryByRole("button", { name: "Add items" });
  if (trigger) await user.click(trigger);
  await user.click(await screen.findByRole("button", { name: `Add ${name}` }));
}

describe("Client quotation", () => {
  it("applies a sub-basket mode to every included row despite search and saves one room-scoped command", async () => {
    const fixture = groupedDetail(); const { saves } = setup(fixture); const user = userEvent.setup();
    await screen.findByRole("group", { name: "Storage Kitchen" });
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Shelf");
    expect(screen.queryByRole("group", { name: "Storage Kitchen" })).not.toBeInTheDocument();
    const modes = screen.getByRole("group", { name: "Modes for Storage units in Kitchen" });
    expect(within(modes).getByRole("radio", { name: "Mode for Storage units in Kitchen" })).toBeChecked();
    await user.click(within(modes).getByRole("radio", { name: "Premium tier for Storage units in Kitchen" }));
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.getByRole("status", { name: "Configured price for Storage in Kitchen" })).toHaveTextContent("₹750.00");
    expect(screen.queryByRole("radio", { name: "Premium tier for Shelf in Kitchen" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "set_group_tier", mainBasketId: "furniture", subBasketId: "storage",
      roomId: "room-one", sourceToken: "storage-kitchen", modeTier: "premium" }] }));
  });

  it("uses the Direct-items group token without including nested sub-basket edits", async () => {
    const fixture = groupedDetail();
    fixture.lines.push({ ...fixture.lines[0]!, id: "direct", mainLineId: "direct", mainLineName: "Direct work", subBasketId: null, subBasketName: null });
    fixture.groups!.push({ mainBasketId: "furniture", subBasketId: null, roomId: "room-one", includedCount: 3, sourceToken: "room-basket" });
    const { saves } = setup(fixture); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Increase quantity for Storage in Kitchen" }));
    await user.click(screen.getByRole("radio", { name: "Premium tier for Direct items in Furniture, Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [
      { kind: "set_group_tier", mainBasketId: "furniture", subBasketId: null, roomId: "room-one", sourceToken: "room-basket", modeTier: "premium" },
      { kind: "update", lineItemId: "line-one", source, quantity: 3, included: true, modeTier: "signature" }
    ] }));
  });

  it.each([false, true])("saves an explicit same-tier selection and verifies its configured price after a lost response (applied=%s)", async applied => {
    const fixture = groupedDetail();
    fixture.lines = [fixture.lines[0]!];
    fixture.lines[0] = { ...fixture.lines[0]!, ratePaise: 30000, amountPaise: 60000 };
    const { state, saves } = setup(fixture); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>);
      state.detail = { ...state.detail, estimateVersion: 8, lines: state.detail.lines.map(line => applied
        ? { ...line, ratePaise: 50000, amountPaise: 100000 } : line) };
      return HttpResponse.error();
    }));
    await user.click(await screen.findByRole("radio", { name: "Signature tier for Storage units in Kitchen" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ operations: [{ kind: "set_group_tier", modeTier: "signature" }] });
    if (applied) {
      expect(await screen.findByText(/Changes saved. Your team will review/)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
    } else expect(await screen.findByRole("button", { name: "Verify saved changes" })).toBeVisible();
  });

  it.each([false, true])("compares the complete visible sub-basket before search without saving (readOnly=%s)", async readOnly => {
    const fixture = groupedDetail(); const requests: Array<Record<string, unknown>> = [];
    const { saves } = setup(fixture, readOnly); const user = userEvent.setup();
    server.use(http.post("/api/v1/projects/project-one/estimate-tier-comparison", async ({ request }) => {
      requests.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ data: { mainBasketId: "furniture", subBasketId: "storage", roomId: "room-one", roomName: "Kitchen",
        mainBasketName: "Furniture", subBasketName: "Storage units", estimateVersion: 7,
        tiers: [{ modeTier: "current", label: "Current choices", available: true, subtotalPaise: 250000,
          lines: fixture.lines.slice(0, 2).map(line => ({ mainLineId: line.mainLineId, name: line.mainLineName, quantity: line.quantity,
            uomName: line.uomName, ratePaise: line.ratePaise, amountPaise: line.amountPaise, unavailableReason: null })) }] } });
    }));
    await screen.findByRole("group", { name: "Storage Kitchen" });
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Shelf");
    await user.click(screen.getByRole("button", { name: "Check tier comparison for Storage units in Kitchen" }));
    const dialog = await screen.findByRole("dialog", { name: "Price comparison: Storage units in Kitchen" });
    expect(await within(dialog).findByRole("rowheader", { name: "Storage 2 Unit" })).toBeVisible();
    expect(within(dialog).getByRole("rowheader", { name: "Shelf 3 Unit" })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ expectedVersion: 7, mainBasketId: "furniture", subBasketId: "storage", roomId: "room-one",
      lines: [{ mainLineId: "storage", lineItemId: "line-one", quantity: 2, modeTier: "signature", ...source },
        { mainLineId: "shelf", lineItemId: "line-shelf", quantity: 3, modeTier: "signature", ...source }] });
    expect(JSON.stringify(requests)).not.toContain("line-bedroom"); expect(saves).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
  });

  it("Mode restores prior mixed tiers while preserving an independent quantity edit", async () => {
    const fixture = groupedDetail(); fixture.lines[1]!.modeTier = "premium";
    const { saves } = setup(fixture); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Increase quantity for Storage in Kitchen" }));
    await user.click(screen.getByRole("radio", { name: "Premium tier for Storage units in Kitchen" }));
    await user.click(screen.getByRole("radio", { name: "Mode for Storage units in Kitchen" }));
    expect(screen.getByRole("status", { name: "Configured price for Storage in Kitchen" })).toHaveTextContent("₹500.00");
    expect(screen.getByRole("status", { name: "Configured price for Shelf in Kitchen" })).toHaveTextContent("₹750.00");
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source,
      included: true, quantity: 3, modeTier: "signature" }] }));
  });

  it("does not apply a group tier when an included line hidden by search lacks that tier", async () => {
    const fixture = groupedDetail(); fixture.lines[0]!.choices = [{ ...choices[0]! }];
    const { saves } = setup(fixture); const user = userEvent.setup();
    await screen.findByRole("group", { name: "Storage Kitchen" });
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Shelf");
    expect(screen.getByRole("radio", { name: "Premium tier for Storage units in Kitchen" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Mode for Storage units in Kitchen" })).toBeChecked();
    expect(saves).toEqual([]);
  });

  it.each([false, true])("shows the server's round off while preserving saved unit amounts (readOnly=%s)", async readOnly => {
    setup({ ...structuredClone(detail), totalPaise: 10200, roundOffPaise: -24 }, readOnly);
    expect(await screen.findByText("₹102.00")).toBeVisible();
    expect(screen.getByText("Round off")).toBeVisible();
    expect(screen.getByText("−₹0.24")).toBeVisible();
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
  });

  it("keeps an unrounded legacy saved quotation total until the server returns an update", async () => {
    setup({ ...structuredClone(detail), totalPaise: 10252 });
    expect(await screen.findByText("₹102.52")).toBeVisible();
    expect(screen.queryByText("Round off")).not.toBeInTheDocument();
  });
  it("groups secondary options and shows a single save area only after item edits", async () => {
    const { container, saves } = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add items" });
    const navigation = screen.getByRole("navigation", { name: "Estimate views" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(within(navigation).getByRole("button", { name: "Items" })).toHaveAttribute("aria-pressed", "true");
    expect(within(navigation).getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".client-quotation__options")).not.toHaveAttribute("open");
    expect(container.querySelector(".client-quotation__footer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase quantity for Storage in Living Room" }));
    const footer = screen.getByLabelText("Estimate actions");
    expect(within(footer).getAllByRole("button")).toHaveLength(2);
    expect(within(footer).getByRole("button", { name: "Discard changes" })).toBeEnabled();
    expect(within(footer).getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Save changes" })).toHaveLength(1);
    expect(screen.getByText("₹6,180.00")).toBeVisible();
    await user.click(within(footer).getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(2);
    expect(container.querySelector(".client-quotation__footer")).toBeNull();
    expect(saves).toEqual([]);
  });

  it.each([false, true])("shows loaded project identity only in standalone mode (%s)", async workspace => {
    setup({ ...structuredClone(detail), projectNumber: "Lisno000031" }, false, false, workspace);
    expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
    await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    if (workspace) expect(screen.getByText("Project ID: Lisno000031")).toBeVisible();
    else expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
  });

  it("clears standalone project identity after access is revoked", async () => {
    const { client } = setup({ ...structuredClone(detail), projectNumber: "Lisno000031" }, true, false, true);
    expect(await screen.findByText("Project ID: Lisno000031")).toBeVisible();
    server.use(http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ error: { message: "Unavailable" } }, { status: 403 })));
    await act(() => client().invalidateQueries({ queryKey: quotationKeys.detail("project-one") }));
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
  });

  it("uses the Sales row controls while preserving saved amounts and a scoped removal payload", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    const row = await screen.findByRole("group", { name: "Storage Living Room" });
    expect(screen.queryByRole("combobox", { name: "Configured option for Storage in Living Room" })).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Increase quantity for Storage in Living Room" }));
    expect(within(row).getByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(3);
    expect(within(row).getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
    expect(screen.getByText("₹6,180.00")).toBeVisible();
    const more = within(row).getByRole("button", { name: "More options for Storage in Living Room" });
    await user.click(more);
    await user.click(screen.getByRole("button", { name: "Remove from estimate" }));
    expect(screen.getByRole("button", { name: "Add items" })).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Storage Living Room" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] }));
  });

  it("uses only the returned tier choices and blocks choices without a current source", async () => {
    const fixture = structuredClone(detail);
    fixture.lines[0]!.choices[1] = { ...fixture.lines[0]!.choices[1]!, source: null };
    const { saves } = setup(fixture); const user = userEvent.setup();
    const premium = await screen.findByRole("radio", { name: "Premium tier for Items in Living Room" });
    expect(premium).toBeDisabled();
    await user.click(premium);
    expect(screen.getByRole("radio", { name: "Mode for Items in Living Room" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Functional/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Selling rate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it.each([[1.1, "Decrease", 0.1], [0.1, "Increase", 1.1]] as const)("steps fractional quantity %s without introducing decimal noise", async (initial, direction, expected) => {
    const fixture = structuredClone(detail); fixture.lines[0]!.quantity = initial;
    const { saves } = setup(fixture); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `${direction} quantity for Storage in Living Room` }));
    expect(screen.getByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(expected);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: true, quantity: expected, modeTier: "signature" }] }));
  });

  it("edits mandatory dimensions in the shared row and sends only the derived quantity and permitted fields", async () => {
    const fixture = structuredClone(detail);
    fixture.lines[0] = { ...fixture.lines[0]!, uomName: "sq ft", dimensionsMandatory: true,
      dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "unit", decimalScale: 2 },
      dimensions: { length: "2", width: "1", height: "8" } };
    const { saves } = setup(fixture); const user = userEvent.setup();
    const length = await screen.findByRole("textbox", { name: "Length (ft) for Storage in Living Room" });
    expect(screen.queryByRole("spinbutton", { name: /Quantity for Storage/ })).not.toBeInTheDocument();
    await user.clear(length); await user.type(length, "4");
    expect(screen.getByRole("status", { name: "Quantity for Storage in Living Room sq ft" })).toHaveTextContent("4");
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: true, quantity: 4, modeTier: "signature", dimensions: { length: "4", width: "1", height: "8" } }] }));
  });

  it("clears component selections on a tier change and saves only available selected components", async () => {
    const fixture = structuredClone(detail);
    fixture.lines[0] = { ...fixture.lines[0]!, pricingMode: "in_house", selectedInHouseComponentIds: ["old-component"], choices: fixture.lines[0]!.choices.map(choice => ({ ...choice, inHouseComponents: choice.modeTier === "signature"
      ? [{ id: "old-component", label: "Original shutter", available: true, ratePaise: 50000 }]
      : [{ id: "new-component", label: "Premium shutter", available: true, ratePaise: 75000 }, { id: "unavailable-component", label: "Retired hinge", available: false, ratePaise: null }] })) };
    const { saves } = setup(fixture); const user = userEvent.setup();
    expect(await screen.findByRole("checkbox", { name: "Original shutter" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Premium tier for Items in Living Room" }));
    expect(screen.queryByRole("checkbox", { name: "Original shutter" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Premium shutter" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Retired hinge (unavailable)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select available components for Storage.");
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("checkbox", { name: "Premium shutter" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: true, quantity: 2, modeTier: "premium", selectedInHouseComponentIds: ["new-component"] }] }));
  });

  it("saves allowed quantity and configured option changes atomically with the source version; rates and saved total remain read-only", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Living Room Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.click(screen.getByRole("radio", { name: "Premium tier for Items in Living Room" }));
    expect(screen.getByText("₹6,180.00")).toBeVisible();
    expect(screen.queryByRole("spinbutton", { name: /rate/i })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toEqual([{ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", included: true, source, quantity: 4, modeTier: "premium" }] }]));
    expect(await screen.findByText(/Changes saved. Your team will review/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("removes a visible item without replacing the quote or sending financial fields", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Include Storage in Living Room" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] }));
  });

  it("adds a configured candidate inline to one room only after explicit Save", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add items" });
    expect(screen.queryByRole("group", { name: "Desk Living Room" })).not.toBeInTheDocument();
    await chooseItem(user, "Desk");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Desk in Living Room" })).toBeChecked();
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "desk", roomId: "room-one", source, quantity: 1, modeTier: "signature" }] }));
  });

  it("preserves a dirty client draft and blocks stale Save after a background revision changes", async () => {
    const { state, saves, client } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    await user.clear(quantity); await user.type(quantity, "9");
    state.detail = { ...state.detail, estimateVersion: 8, lines: [{ ...state.detail.lines[0]!, quantity: 3, amountPaise: 150000 }] };
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument());
    expect(quantity).toHaveValue(9);
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,500.00");
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Load latest quotation and discard changes" }));
    await waitFor(() => expect(quantity).toHaveValue(3));
  });

  it("uses current source availability after refresh while preserving unsaved item values", async () => {
    const { state, saves, client } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Living Room Unit" });
    await user.clear(quantity); await user.type(quantity, "9");
    state.detail = { ...state.detail, lines: [{ ...state.detail.lines[0]!, source: null }] };
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    await waitFor(() => expect(quantity).toBeDisabled());
    expect(quantity).toHaveValue(9);
    expect(screen.getByRole("checkbox", { name: "Include Storage in Living Room" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Premium tier for Items in Living Room" })).toBeDisabled();
    expect(screen.getByText(/This saved item is unavailable in the current Configuration/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More options for Storage in Living Room" }));
    expect(screen.getByRole("button", { name: "Remove from estimate" })).toBeDisabled();
    expect(saves).toEqual([]);
  });

  it("shows the server-approved total with zero visible rows and does not invent editable items", async () => {
    setup({ ...detail, phase: "post", status: "client_approved", editingAllowed: false, editingBlockReason: "closed", reviewState: "approved", lines: [],
      quotationApprovalState: "initial_current", currentQuotationApproved: true, requiresClientReapproval: false,
      quotationApprovalSource: "initial_unchanged",
      currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: "pre-round", estimateVersion: 7, approvedAt: "2026-11-04T08:00:00Z" } });
    expect(await screen.findByText("₹6,180.00")).toBeVisible();
    expect(screen.getByText("Initial estimate approved. No quotation changes require Client review.")).toBeVisible();
    expect(screen.getByText("Initial approval current")).toBeVisible();
    expect(screen.queryByText("Designer-revised quotation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
  });

  it("fails closed when a post-assignment quotation omits current approval fields", async () => {
    setup({ ...detail, phase: "post", status: "draft", reviewState: "draft" });
    expect(await screen.findByText("The current quotation approval could not be verified. Refresh before continuing.")).toBeVisible();
    expect(screen.getByText("Approval status unavailable")).toBeVisible();
    expect(screen.queryByText("Designer-revised quotation")).not.toBeInTheDocument();
  });

  it("has accessible inline picker controls and restores focus when it closes", async () => {
    const { container } = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add items" });
    await user.click(screen.getByRole("button", { name: "Add items" }));
    expect(screen.getByRole("searchbox", { name: "Search available items" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "Add Desk" });
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add items" })).toHaveFocus();
    expect(screen.queryByRole("searchbox", { name: "Search available items" })).not.toBeInTheDocument();
  });

  it("uses the shared basket and room screen and keeps the current room through saved navigation", async () => {
    const { saves, container } = setup(groupedDetail()); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Bedroom Saved visible subtotal/ }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Bedroom Unit" })).toHaveValue(5);
    expect(screen.queryByRole("spinbutton", { name: /Kitchen/ })).not.toBeInTheDocument();
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    expect(screen.getByRole("heading", { name: "Main Baskets" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Bedroom Unit" })).toHaveValue(5);
    expect(saves).toEqual([]);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("saves once before returning to Main Baskets and keeps navigation in place until confirmation", async () => {
    const { state, saves } = setup(groupedDetail()); const user = userEvent.setup();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>); await pending;
      state.detail = { ...state.detail, estimateVersion: 8, lines: state.detail.lines.map(line => line.id === "line-one" ? { ...line, quantity: 4, amountPaise: 200000, choices: line.choices.map(choice => ({ ...choice, amountPaise: choice.ratePaise! * 4 })) } : line) };
      return HttpResponse.json({ data: state.detail });
    }));
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.dblClick(screen.getByRole("button", { name: "Save and edit baskets" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Main Baskets" })).not.toBeInTheDocument();
    expect(quantity).toBeDisabled();
    await act(async () => { release(); });
    expect(await screen.findByRole("heading", { name: "Main Baskets" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(4);
  });

  it("keeps failed save-and-return input and blocks blind retry of an unknown write", async () => {
    const { saves } = setup(groupedDetail()); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>); return HttpResponse.error();
    }));
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByRole("button", { name: "Verify saved changes" })).toBeVisible();
    expect(quantity).toHaveValue(4);
    expect(screen.queryByRole("heading", { name: "Main Baskets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verify saved changes" }));
    expect(saves).toHaveLength(1);
  });

  it("verifies a committed save after a lost response before returning to baskets", async () => {
    const { state, saves } = setup(groupedDetail()); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>);
      state.detail = { ...state.detail, estimateVersion: 8, lines: state.detail.lines.map(line => line.id === "line-one" ? { ...line, quantity: 4 } : line) };
      return HttpResponse.error();
    }));
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByRole("heading", { name: "Main Baskets" })).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
  });

  it("queues full Sub Basket scope despite search and submits one group command without overlapping row edits", async () => {
    const { saves } = setup(groupedDetail()); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Shelf");
    expect(screen.queryByRole("checkbox", { name: "Include Storage in Kitchen" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove visible items from Storage units in Kitchen" }));
    const dialog = screen.getByRole("dialog", { name: "Remove visible items from Storage units in Kitchen?" });
    expect(within(dialog).getByText(/2 saved visible items/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove visible items" }));
    expect(saves).toEqual([]);
    expect(screen.getByText("₹6,180.00")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "exclude_group", mainBasketId: "furniture", subBasketId: "storage", roomId: "room-one", sourceToken: "storage-kitchen" }] }));
  });

  it("removes a large Main Basket through one canonical command and supports Undo before save", async () => {
    const fixture = groupedDetail(); fixture.groups![0]!.includedCount = 101;
    const { saves } = setup(fixture); const user = userEvent.setup();
    await user.click(await screen.findByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    await user.click(screen.getByRole("button", { name: "Remove visible items from Furniture" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove visible items" }));
    await user.click(screen.getByRole("button", { name: "Undo removal of Furniture across all rooms" }));
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove visible items from Furniture" }));
    expect(within(screen.getByRole("dialog")).getByText(/101 saved visible items/)).toBeVisible();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove visible items" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "exclude_group", mainBasketId: "furniture", subBasketId: null, roomId: null, sourceToken: "basket-all" }] }));
  });

  it("restores only the chosen excluded line with its saved tier and quantity", async () => {
    const fixture = groupedDetail();
    fixture.excludedLines = fixture.lines.slice(0, 2).map(line => ({ ...line, included: false, amountPaise: 0, quantity: line.id === "line-one" ? 9 : 3, modeTier: "premium" }));
    fixture.lines = fixture.lines.slice(2);
    const { saves } = setup(fixture); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add items" });
    expect(screen.queryByRole("checkbox", { name: "Include Storage in Kitchen" })).not.toBeInTheDocument();
    await chooseItem(user, "Storage");
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(9);
    expect(screen.getByRole("radio", { name: "Mode for Storage units in Kitchen" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /tier for Storage in Kitchen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Include Shelf in Kitchen" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", included: true, source, quantity: 9, modeTier: "premium", recommendationSourceMainLineIds: [] }] }));
  });

  it("re-adds through the candidate picker using this room's saved choices instead of candidate defaults", async () => {
    const fixture = groupedDetail();
    fixture.excludedLines = [{ ...fixture.lines[0]!, included: false, amountPaise: 0, quantity: 9, modeTier: "premium" }];
    fixture.lines = fixture.lines.slice(1);
    const { saves } = setup(fixture); const user = userEvent.setup();
    server.use(http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ data: { items: [{ ...candidate, mainLineId: "storage", name: "Storage", modeTier: "signature" }], total: 1, limit: 20, offset: 0 } })));
    await screen.findByRole("button", { name: "Add items" });
    await chooseItem(user, "Storage");
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(9);
    expect(screen.getByRole("radio", { name: "Mode for Storage units in Kitchen" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /tier for Storage in Kitchen/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", included: true, source, quantity: 9, modeTier: "premium", recommendationSourceMainLineIds: [] }] }));
  });

  it("forces secondary-Designer presentation read-only even if a cached response offers editing", async () => {
    const { saves } = setup(groupedDetail(), true); const user = userEvent.setup();
    expect(await screen.findByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove visible items/ })).not.toBeInTheDocument();
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "View baskets" }));
    expect(screen.getByRole("button", { name: "Choose items in Furniture" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Remove visible items from Furniture" })).not.toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it("keeps incompatible saved rows read-only with their saved amounts and rejects synthetic field changes", async () => {
    const fixture = groupedDetail();
    fixture.lines[0] = { ...fixture.lines[0]!, source: null, choices: fixture.lines[0]!.choices.map(choice => ({ ...choice, available: false, source: null, unavailableReason: "Configuration changed" })) };
    const { saves } = setup(fixture); const user = userEvent.setup();
    const row = await screen.findByRole("group", { name: "Storage Kitchen" });
    const inclusion = within(row).getByRole("checkbox", { name: "Include Storage in Kitchen" });
    const quantity = within(row).getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    expect(inclusion).toBeDisabled(); expect(quantity).toBeDisabled();
    expect(within(row).queryByRole("radio", { name: /tier/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Premium tier for Storage units in Kitchen" })).toBeDisabled();
    expect(within(row).getByText(/This saved item is unavailable in the current Configuration/)).toBeVisible();
    expect(within(row).getByText("₹1,000.00")).toBeVisible();
    await user.click(inclusion);
    fireEvent.change(quantity, { target: { value: "9" } });
    expect(quantity).toHaveValue(2);
    expect(inclusion).toBeChecked();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Quantity for Shelf in Kitchen Unit" })).toBeEnabled();
    expect(saves).toEqual([]);
  });

  it("preserves the dirty editor and exit guard after a failed cached quotation refresh", async () => {
    const { client, router, saves, state } = setup(groupedDetail(), false, true); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "9");
    server.use(http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    expect(await screen.findByText(/The saved quotation could not be refreshed/)).toBeVisible();
    expect(quantity).toHaveValue(9); expect(quantity).toBeVisible(); expect(quantity).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    expect(await screen.findByRole("alertdialog", { name: "Leave estimate with unsaved changes?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save and leave" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(router!.state.location.pathname).toBe("/estimate");
    expect(quantity).toHaveValue(9);
    server.use(http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ data: state.detail })));
    await user.click(screen.getByRole("button", { name: "Refresh quotation" }));
    await waitFor(() => expect(quantity).toBeEnabled());
    expect(quantity).toHaveValue(9); expect(saves).toEqual([]);
  });

  it.each([401, 403, 404])("hides protected cached rows after %s while retaining the dirty exit guard", async status => {
    const { client, router, saves } = setup(groupedDetail(), false, true); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "9");
    server.use(http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ error: { code: "QUOTATION_NOT_FOUND", message: "Unavailable" } }, { status })));
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByText("₹6,180.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Furniture" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    expect(await screen.findByRole("alertdialog", { name: "Leave estimate with unsaved changes?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save and leave" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(router!.state.location.pathname).toBe("/estimate");
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeVisible();
    expect(saves).toEqual([]);
  });

  it("confirms a lost-response group save using only eligible members and keeps an incompatible sibling", async () => {
    const fixture = groupedDetail();
    fixture.lines[0] = { ...fixture.lines[0]!, source: null, choices: [] };
    fixture.groups![1]!.includedCount = 1;
    const { state, saves } = setup(fixture); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>);
      state.detail = { ...state.detail, estimateVersion: 8,
        excludedLines: [{ ...state.detail.lines[1]!, included: false, amountPaise: 0 }],
        lines: state.detail.lines.filter(line => line.id !== "line-shelf") };
      return HttpResponse.error();
    }));
    await user.click(await screen.findByRole("button", { name: "Remove visible items from Storage units in Kitchen" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove visible items" }));
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByRole("heading", { name: "Main Baskets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Include Shelf in Kitchen" })).not.toBeInTheDocument();
    expect(saves).toHaveLength(1);
  });
});
