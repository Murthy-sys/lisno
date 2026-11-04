import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientQuotation } from "./ClientQuotation";
import { quotationCandidateRows } from "./clientQuotationCandidates";
import type { QuotationCandidate, QuotationDetail, QuotationLine, QuotationOperation, QuotationRecommendationQuery } from "./quotationApi";

const source = { revisionId: "visible-revision", itemVersion: 2, revisionVersion: 4, uomId: "unit" };
const choices = [{ modeTier: "signature" as const, available: true, unavailableReason: null, ratePaise: 50000, amountPaise: 50000, source }];
const candidate: QuotationCandidate = { mainLineId: "desk", name: "Desk", source, pricingMode: "sub_vendor", modeTier: "signature",
  dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices, mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "units", subBasketName: "Units" };
const room = { id: "kitchen", name: "Kitchen" };
const initialLine: QuotationLine = { ...quotationCandidateRows([{ ...candidate, mainLineId: "storage", name: "Storage" }], room, [])[0]!,
  id: "stored-source", included: true, ratePaise: 50000, amountPaise: 100000, quantity: 2 };
const fixture = (): QuotationDetail => ({ projectId: "project-one", estimateId: "estimate-one", estimateVersion: 7, workflowVersion: 3,
  pricedRevision: 3, phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null,
  totalPaise: 118000, isIncomplete: false, rooms: [room, { id: "bedroom", name: "Bedroom" }],
  lines: [structuredClone(initialLine)], excludedLines: [], groups: [],
  baskets: [{ id: "furniture", name: "Furniture", subBaskets: [{ id: "units", name: "Units" }] }],
  setup: { propertyType: "1BHK", bedroomCount: null, rooms: [{ id: "kitchen", typeId: "kitchen", label: "Kitchen", length: null, width: null, sqft: 0, canRemove: true, removalBlockedReason: null },
    { id: "bedroom", typeId: "bedroom1", label: "Bedroom", length: null, width: null, sqft: 0, canRemove: true, removalBlockedReason: null }],
    selectedMainBasketIds: ["furniture"], sourceToken: "scope-seven", canConfigure: true } });

function setup(initial = fixture(), readOnly = false) {
  const state = { detail: initial, target: structuredClone(candidate), requiresSetup: false };
  const requests: QuotationRecommendationQuery[] = [];
  const saves: Array<{ expectedVersion: number; operations: QuotationOperation[] }> = [];
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return null; }
  server.use(
    http.get("/api/v1/projects/project-one/quotation", () => HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: {
      estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision,
      status: state.detail.status, phase: state.detail.phase } })),
    http.get("/api/v1/projects/project-one/quotation/items", () => HttpResponse.json({ data: { items: [state.target], total: 1, limit: 20, offset: 0 } })),
    http.get("/api/v1/projects/project-one/quotation/setup", () => HttpResponse.json({ data: {
      projectId: state.detail.projectId, estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion,
      setup: state.detail.setup, baskets: [{ id: "furniture", name: "Furniture", subBaskets: [{ id: "units", name: "Units", mainLineCount: 2, temporaryItemCount: 0 }], directTemporaryItemCount: 0, canSelect: true, canRemove: true, removalBlockedReason: null }] } })),
    http.post("/api/v1/projects/project-one/quotation/recommendations/query", async ({ request }) => {
      const input = await request.json() as QuotationRecommendationQuery; requests.push(input);
      const items = input.sources.some(item => item.mainLineId === "storage")
        ? [{ candidate: state.target, sourceMainLines: [{ mainLineId: "storage", name: "Storage" }], requiresSetup: state.requiresSetup }] : [];
      return HttpResponse.json({ data: { projectId: state.detail.projectId, estimateId: state.detail.estimateId,
        estimateVersion: state.detail.estimateVersion, roomId: input.roomId, items, total: items.length, limit: 20, offset: input.offset } });
    }),
    http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const command = await request.json() as typeof saves[number]; saves.push(command);
      const lines = [...state.detail.lines, ...(state.detail.excludedLines ?? [])];
      for (const operation of command.operations) {
        if (operation.kind === "add") {
          const targetRoom = state.detail.rooms.find(item => item.id === operation.roomId)!;
          lines.push({ ...quotationCandidateRows([state.target], targetRoom, [])[0]!, id: `saved-${operation.mainLineId}`, included: true,
            quantity: operation.quantity, modeTier: operation.modeTier, ratePaise: 50000, amountPaise: 50000 * operation.quantity,
            recommendationSourceMainLineIds: operation.recommendationSourceMainLineIds ?? [] });
        } else if (operation.kind === "update") {
          const line = lines.find(item => item.id === operation.lineItemId)!;
          if (operation.included !== undefined) line.included = operation.included;
          if (operation.quantity !== undefined) line.quantity = operation.quantity;
          if (operation.modeTier !== undefined) line.modeTier = operation.modeTier;
          if (operation.recommendationSourceMainLineIds !== undefined) line.recommendationSourceMainLineIds = operation.recommendationSourceMainLineIds;
          if (!line.included) { line.amountPaise = 0; line.recommendationSourceMainLineIds = []; }
        }
      }
      state.detail = { ...state.detail, estimateVersion: state.detail.estimateVersion! + 1, pricedRevision: state.detail.pricedRevision + 1,
        status: "draft", reviewState: "awaiting_staff_review", lines: lines.filter(item => item.included), excludedLines: lines.filter(item => !item.included) };
      return HttpResponse.json({ data: state.detail });
    })
  );
  const rendered = renderWithQuery(<><Capture /><ClientQuotation projectId="project-one" readOnly={readOnly} /></>);
  return { ...rendered, state, requests, saves, client: () => client };
}

describe("Client inline non-negotiable recommendations", () => {
  it("saves a restored excluded target as excluded when its source is removed before saving", async () => {
    const initial = fixture();
    initial.excludedLines = [{ ...quotationCandidateRows([candidate], room, [])[0]!, id: "saved-desk", included: false,
      quantity: 3, amountPaise: 0, recommendationSourceMainLineIds: [] }];
    const { saves, state } = setup(initial); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add Desk" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Desk in Kitchen Unit" })).toHaveValue(3);
    await user.click(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" }));
    expect(screen.queryByRole("checkbox", { name: "Include Desk in Kitchen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Include Storage in Kitchen" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({ expectedVersion: 7, operations: [
      { kind: "update", lineItemId: "saved-desk", source, included: false },
      { kind: "update", lineItemId: "stored-source", source, included: false }
    ] });
    await waitFor(() => expect(state.detail.estimateVersion).toBe(8));
    expect(state.detail.lines).toEqual([]);
    expect(state.detail.excludedLines?.find(item => item.id === "saved-desk")).toMatchObject({ included: false, quantity: 3 });
    expect(await screen.findByText(/Your team will review/)).toBeVisible();
  });

  it("adds, saves and removes a recommendation while retaining its source, then preserves exclusion on refresh", async () => {
    const { requests, saves, client } = setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add Desk" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Include Desk in Bedroom" })).not.toBeInTheDocument();
    expect(requests[0]).toMatchObject({ expectedVersion: 7, roomId: "kitchen", sources: [{ mainLineId: "storage", source }] });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.operations).toEqual([{ kind: "add", mainLineId: "desk", roomId: "kitchen", source, quantity: 1, modeTier: "signature", recommendationSourceMainLineIds: ["storage"] }]);
    await user.click(await screen.findByRole("button", { name: "Remove Desk" }));
    expect(screen.queryByRole("checkbox", { name: "Include Desk in Kitchen" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual({ expectedVersion: 8, operations: [{ kind: "update", lineItemId: "saved-desk", source, included: false }] });
    await act(() => client().invalidateQueries({ queryKey: ["quotation", "project-one"] }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Desk" })).toBeEnabled());
    expect(screen.queryByRole("checkbox", { name: "Include Desk in Kitchen" })).not.toBeInTheDocument();
    expect(screen.getByText(/Your team will review/)).toBeVisible();
  });

  it("collapses suggestions and handles a denied refresh without deselecting the source or showing cached targets", async () => {
    const { client, saves } = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add Desk" });
    await user.click(screen.getByRole("button", { name: "Non-negotiable recommendations (1)" }));
    expect(screen.queryByRole("button", { name: "Add Desk" })).not.toBeInTheDocument();
    server.use(http.post("/api/v1/projects/project-one/quotation/recommendations/query", () => HttpResponse.json({ error: { message: "Unavailable" } }, { status: 403 })));
    await act(() => client().invalidateQueries({ queryKey: ["quotation", "project-one", "recommendations"] }));
    expect(await screen.findByText("Recommendations are unavailable for this account.")).toBeVisible();
    expect(screen.queryByText("Desk")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    expect(saves).toEqual([]);
  });

  it("rejects a response for another room instead of rendering its suggested items", async () => {
    setup();
    server.use(http.post("/api/v1/projects/project-one/quotation/recommendations/query", () => HttpResponse.json({ data: {
      projectId: "project-one", estimateId: "estimate-one", estimateVersion: 7, roomId: "bedroom", items: [{ candidate, sourceMainLines: [{ mainLineId: "storage", name: "Storage" }], requiresSetup: false }], total: 1, limit: 20, offset: 0 } })));
    expect(await screen.findByText("Configuration changed. Refresh recommendations.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Desk" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
  });

  it("keeps an empty room navigable and scopes suggestions when changing rooms", async () => {
    const { requests } = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Add Desk" });
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ }));
    expect(screen.getByText("No items selected in this room.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Desk" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items" })).toBeEnabled();
    expect(requests.every(input => input.roomId === "kitchen")).toBe(true);
  });

  it("requires setup through the existing separate save flow before adding a cross-basket target", async () => {
    const { state, saves } = setup(); state.requiresSetup = true;
    state.target = { ...state.target, mainBasketId: "lighting", mainBasketName: "Lighting" };
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Configure basket Desk" });
    const quantity = screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "4");
    await user.click(screen.getByRole("button", { name: "Configure basket Desk" }));
    await screen.findByRole("button", { name: "Property type: 1BHK" });
    expect(saves).toHaveLength(1);
    expect(saves[0]!.operations).toEqual([{ kind: "update", lineItemId: "stored-source", source, included: true, quantity: 4, modeTier: "signature" }]);
    expect(state.detail.lines.some(item => item.mainLineId === "desk")).toBe(false);
  });

  it("disables unavailable new targets while preserving allowed removal of a saved target", async () => {
    const initial = fixture();
    initial.lines.push({ ...quotationCandidateRows([candidate], room, [])[0]!, id: "saved-desk", included: true, amountPaise: 50000 });
    const { state, saves } = setup(initial); state.target.choices = [{ ...choices[0]!, available: false, source: null, unavailableReason: "configuration" }];
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Remove Desk" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Desk" })).toBeDisabled());
    expect(screen.getByText(/No configured option is currently available/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.operations).toEqual([{ kind: "update", lineItemId: "saved-desk", source, included: false }]);
  });

  it("does not infer persisted dependency removal when server-owned origins are omitted", async () => {
    const initial = fixture();
    initial.lines.push({ ...quotationCandidateRows([candidate], room, [])[0]!, id: "saved-desk", included: true, amountPaise: 50000 });
    const { saves } = setup(initial); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Include Storage in Kitchen" }));
    expect(screen.getByRole("checkbox", { name: "Include Desk in Kitchen" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves[0]!.operations).toEqual([{ kind: "update", lineItemId: "stored-source", source, included: false }]));
  });

  it("keeps the secondary Designer view read-only without loading suggestions", async () => {
    const { requests } = setup(fixture(), true);
    expect(await screen.findByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });
});
