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
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { estimateId: "estimate-one", estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision, status: state.detail.status, phase: state.detail.phase } })),
    http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ data: { items: [candidate], total: 1, limit: 20, offset: 0 } })),
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

describe("Client quotation", () => {
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
    expect(more).toHaveFocus();
    expect(within(row).getByRole("checkbox", { name: "Include Storage in Living Room" })).not.toBeChecked();
    expect(within(row).getByRole("spinbutton", { name: /Quantity for Storage/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] }));
  });

  it("uses only the returned tier choices and blocks choices without a current source", async () => {
    const fixture = structuredClone(detail);
    fixture.lines[0]!.choices[1] = { ...fixture.lines[0]!.choices[1]!, source: null };
    const { saves } = setup(fixture); const user = userEvent.setup();
    const premium = await screen.findByRole("radio", { name: "Premium tier for Storage in Living Room" });
    expect(premium).toBeDisabled();
    await user.click(premium);
    expect(screen.getByRole("radio", { name: "Signature tier for Storage in Living Room" })).toBeChecked();
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
    await user.click(screen.getByRole("radio", { name: "Premium tier for Storage in Living Room" }));
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
    await user.click(screen.getByRole("radio", { name: "Premium tier for Storage in Living Room" }));
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

  it("adds a configured candidate to a project room only after explicit Save", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = screen.getByRole("dialog", { name: "Add quotation item" });
    expect(within(dialog).getByRole("searchbox", { name: "Search items" })).toHaveFocus();
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Item" }), "desk");
    await user.click(within(dialog).getByRole("button", { name: "Add to changes" }));
    expect(saves).toEqual([]);
    expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "add", mainLineId: "desk", roomId: "room-one", source, quantity: 1, modeTier: "signature" }] }));
  });

  it("preserves a dirty client draft and blocks stale Save after a background revision changes", async () => {
    const { state, saves, client } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    await user.clear(quantity); await user.type(quantity, "9");
    state.detail = { ...state.detail, estimateVersion: 8, lines: [{ ...state.detail.lines[0]!, quantity: 3, amountPaise: 150000 }] };
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
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
    expect(screen.getByRole("radio", { name: "Premium tier for Storage in Living Room" })).toBeDisabled();
    expect(screen.getByText(/This saved item is unavailable in the current Configuration/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More options for Storage in Living Room" }));
    expect(screen.getByRole("button", { name: "Remove from estimate" })).toBeDisabled();
    expect(saves).toEqual([]);
  });

  it("shows the server-approved total with zero visible rows and does not invent editable items", async () => {
    setup({ ...detail, editingAllowed: false, editingBlockReason: "closed", reviewState: "approved", lines: [] });
    expect(await screen.findByText("₹6,180.00")).toBeVisible();
    expect(screen.getByText("Estimation complete. The quotation is locked.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
  });

  it("has accessible controls and a keyboard-focused add dialog", async () => {
    const { container } = setup(); const user = userEvent.setup();
    await screen.findByRole("checkbox", { name: "Include Storage in Living Room" });
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus();
  });

  it("uses the shared basket and room screen and keeps the current room through saved navigation", async () => {
    const { saves, container } = setup(groupedDetail()); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Bedroom Saved visible subtotal/ }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Bedroom Unit" })).toHaveValue(5);
    expect(screen.queryByRole("spinbutton", { name: /Kitchen/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    expect(screen.getByRole("heading", { name: "Main Baskets" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
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
      state.detail = { ...state.detail, estimateVersion: 8, lines: state.detail.lines.map(line => line.id === "line-one" ? { ...line, quantity: 4 } : line) };
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
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(4);
  });

  it("keeps failed save-and-return input and blocks blind retry of an unknown write", async () => {
    const { saves } = setup(groupedDetail()); const user = userEvent.setup();
    server.use(http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>); return HttpResponse.error();
    }));
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByRole("button", { name: "Verify saved changes" })).toBeVisible();
    expect(quantity).toHaveValue(4);
    expect(screen.queryByRole("heading", { name: "Main Baskets" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
    await user.click(await screen.findByRole("button", { name: "Edit baskets" }));
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
    await user.click(await screen.findByRole("checkbox", { name: "Include Storage in Kitchen" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(9);
    expect(screen.getByRole("radio", { name: "Premium tier for Storage in Kitchen" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Shelf in Kitchen" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", included: true, source, quantity: 9, modeTier: "premium" }] }));
  });

  it("re-adds through the candidate picker using this room's saved choices instead of candidate defaults", async () => {
    const fixture = groupedDetail();
    fixture.excludedLines = [{ ...fixture.lines[0]!, included: false, amountPaise: 0, quantity: 9, modeTier: "premium" }];
    fixture.lines = fixture.lines.slice(1);
    const { saves } = setup(fixture); const user = userEvent.setup();
    server.use(http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ data: { items: [{ ...candidate, mainLineId: "storage", name: "Storage", modeTier: "signature" }], total: 1, limit: 20, offset: 0 } })));
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = screen.getByRole("dialog", { name: "Add quotation item" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Item" }), "storage");
    expect(within(dialog).getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(9);
    expect(within(dialog).getByRole("combobox", { name: "Configured option for Storage in Kitchen" })).toHaveValue("premium");
    await user.click(within(dialog).getByRole("button", { name: "Add to changes" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "line-one", included: true, source, quantity: 9, modeTier: "premium" }] }));
  });

  it("forces secondary-Designer presentation read-only even if a cached response offers editing", async () => {
    const { saves } = setup(groupedDetail(), true); const user = userEvent.setup();
    expect(await screen.findByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove visible items/ })).not.toBeInTheDocument();
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
    expect(within(row).getByRole("radio", { name: "Signature tier for Storage in Kitchen" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByRole("heading", { name: "Main Baskets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify saved changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Shelf in Kitchen" })).not.toBeChecked();
    expect(saves).toHaveLength(1);
  });
});
