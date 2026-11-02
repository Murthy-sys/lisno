import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
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

function setup(value: QuotationDetail = structuredClone(detail)) {
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
  const rendered = renderWithQuery(<><Capture /><ClientQuotation projectId="project-one" /></>);
  return { state, saves, client: () => queryClient, ...rendered };
}

describe("Client quotation", () => {
  it("saves allowed quantity and configured option changes atomically with the source version; rates and saved total remain read-only", async () => {
    const { saves } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Living Room Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.selectOptions(screen.getByRole("combobox", { name: "Configured option for Storage in Living Room" }), "premium");
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
    state.detail = { ...state.detail, estimateVersion: 8, lines: [{ ...state.detail.lines[0]!, quantity: 3 }] };
    await act(async () => { await client().refetchQueries({ queryKey: quotationKeys.detail("project-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
    expect(quantity).toHaveValue(9);
    expect(saves).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Load latest quotation and discard changes" }));
    await waitFor(() => expect(quantity).toHaveValue(3));
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
});
