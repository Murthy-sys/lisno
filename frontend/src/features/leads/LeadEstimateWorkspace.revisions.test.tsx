import { act, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { estimateRevisionKeys, type EstimateRevisionDetail } from "./estimateRevisionsApi";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import type { EstimateRequirement, ResolveEstimateRequirementInput } from "../client/estimateRequirementsApi";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "sales-one" }, reviewSession: { id: "session-one" }, status: "authenticated" }) }));
vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));

const json = (data: unknown) => Response.json({ data });
const failure = (status: number) => Response.json({ error: { code: "REVISION_UNAVAILABLE", message: "Revision unavailable" } }, { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

function setup(withRequest = false) {
  const room = { id: "living", typeId: "living", label: "Living Room", sqft: 100, length: 10, width: 10 };
  const otherRoom = { ...room, id: "bedroom", typeId: "bedroom-master", label: "Bedroom" };
  const line: ConfiguredEstimateLine = {
    id: "saved-line", source: "configuration", catalogueId: "main", roomId: room.id, roomName: room.label,
    mainBasketId: "basket", mainBasketName: "Current interiors", subBasketId: "sub", subBasketName: "Current finishes",
    mainLineId: "main", mainLineName: "Current ceiling", revisionId: "current-config", uomId: "unit", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2,
    unit: "sq ft", quantity: 1, included: true, pricingMode: "sub_vendor", rateSource: "manual", rate: 100, ratePaise: 10000, amount: 100, amountPaise: 10000, specification: null
  };
  let estimate: EstimateDraft = {
    id: "estimate", projectId: "project", projectNumber: "Lisno000009", version: 4, propertyType: "2BHK", rooms: [room, otherRoom], scopes: [], selectedMainBasketIds: ["basket"],
    lineItems: [line], subtotal: 100, gst: 18, total: 118, status: "draft", approvalRequired: false,
    estimation: { workflowVersion: 2, phase: "pre", status: "draft", requirementsVersion: 1, editClosedAt: null, preApproval: null, finalApproval: null, designScopeRevision: 1, approvedDesignScopeRevision: null, pendingReviewRoundId: null, preparationSnapshotId: null }
  };
  const first: EstimateRevisionDetail = {
    id: "round-one", estimateId: "estimate", estimateVersion: 1, sendGeneration: 1, phase: "pre", workflowVersion: 2,
    submittedAt: "2026-10-01T09:00:00.000Z", status: "changes_requested", deliveryStatus: "sent", subtotalPaise: 27500,
    snapshot: { clientName: "Published client", projectName: "Published project", location: "Pune", propertyType: "2BHK", rooms: [room],
      lineItems: [{ ...line, mainLineName: "Published ceiling", mainBasketName: "Published interiors", subBasketName: "Published finishes", quantity: 5, rate: 55, ratePaise: 5500, amount: 275, amountPaise: 27500 }],
      subtotal: 275, gst: 49.5, total: 324.5, subtotalPaise: 27500, gstPaise: 4950, totalPaise: 32450 }
  };
  const second: EstimateRevisionDetail = { ...first, id: "round-two", sendGeneration: 2, phase: "post", estimateVersion: 3, subtotalPaise: 42000,
    snapshot: { ...first.snapshot, lineItems: [{ ...first.snapshot.lineItems[0]!, mainLineName: "Second published ceiling", quantity: 7, rate: 60, ratePaise: 6000, amount: 420, amountPaise: 42000 }], subtotal: 420, subtotalPaise: 42000, gst: 75.6, gstPaise: 7560, total: 495.6, totalPaise: 49560 } };
  const request: EstimateRequirement = { id: "request", projectId: "project", phase: "pre", mainBasketId: "basket", mainLineId: "main", roomId: "living", text: "Include the ceiling finish", authorId: "client", version: 3, status: "open", lineItemIds: [], reason: "", supersededById: null, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z", resolvedAt: null, canEdit: false };
  const state = { savedStatus: 200, listStatus: 200, listGate: null as Promise<Response> | null, detailStatus: 200, pdfStatus: 200, rounds: [second, first], requirements: withRequest ? [request] : [], requirementsVersion: 6, detailGates: new Map<string, Promise<Response>>(), pdfGate: null as Promise<Response> | null };
  const requirementsResponse = () => ({ projectId: "project", requirementsVersion: state.requirementsVersion, estimateVersion: estimate.version, phase: "pre", editingAllowed: true, editingBlockReason: null, canResolve: true, requirements: state.requirements, mainBaskets: [{ id: "basket", name: "Current interiors" }], mainLines: [{ id: "main", name: "Current ceiling", mainBasketId: "basket", subBasketId: "sub", subBasketName: "Current finishes" }], rooms: [room, otherRoom], indicativeTotalPaise: 11800, pricingComplete: true });
  const requests: Array<{ url: string; method: string }> = [];
  const saves: EstimateDraftInput[] = [];
  const resolutions: ResolveEstimateRequirementInput[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input); const method = init?.method ?? "GET"; requests.push({ url, method });
    if (url === "/api/v1/leads/lead") return json({ id: "lead", projectId: "project", clientName: "Client", projectName: "Current project", location: "Pune", propertyType: "2BHK", estimationWorkflowVersion: 2 });
    if (url === "/api/v1/leads/lead/estimate" && method === "GET") return state.savedStatus === 200 ? json(estimate) : failure(state.savedStatus);
    if (url === "/api/v1/leads/lead/estimate" && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as EstimateDraftInput; saves.push(body);
      estimate = { ...estimate, ...body, version: estimate.version! + 1, lineItems: body.lineItems.map(value => value.source === "configuration" ? { ...line, ...value } : value) };
      return json(estimate);
    }
    if (url.startsWith("/api/v1/estimation/catalogue/recommendations")) return json({ sources: [] });
    if (url.startsWith("/api/v1/estimation/catalogue?")) return json({ items: [{ id: "basket", name: "Current interiors", displayOrder: 1,
      subBaskets: [{ id: "sub", basketId: "basket", name: "Current finishes", displayOrder: 1,
        mainLines: [{ id: "main", mainLineId: "main", basketId: "basket", subBasketId: "sub", name: "Current ceiling", displayOrder: 1,
          revisionId: "current-config", itemVersion: 1, revisionVersion: 1, uom: { id: "unit", code: "SQFT", name: "sq ft", decimalScale: 2 }, modeBaseRatesPaise: { pmc: 10000, sub_vendor: 10000, in_house: null } }] }] }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
    if (url === "/api/v1/projects/project/estimate-requirements") return json(requirementsResponse());
    if (url === "/api/v1/projects/project/estimate-requirements/request/resolve" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as ResolveEstimateRequirementInput; resolutions.push(body);
      state.requirements = [{ ...request, ...body, version: request.version + 1 }]; state.requirementsVersion += 1;
      estimate = { ...estimate, version: estimate.version! + 1 };
      return json(requirementsResponse());
    }
    if (url.startsWith("/api/v1/estimates/estimate/revisions")) {
      const revisionId = url.split("/")[6];
      if (!revisionId) return state.listGate ?? (state.listStatus === 200 ? json({ items: state.rounds.map(({ snapshot: _snapshot, ...summary }) => summary), pagination: { limit: 20, nextCursor: null } }) : failure(state.listStatus));
      if (url.endsWith("/pdf")) return state.pdfGate ?? (state.pdfStatus === 200 ? new Response(`PDF:${revisionId}`, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${revisionId}.pdf"` } }) : failure(state.pdfStatus));
      return state.detailGates.get(revisionId) ?? (state.detailStatus === 200 ? json(state.rounds.find(round => round.id === revisionId)) : failure(state.detailStatus));
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  let queryClient!: QueryClient;
  function Capture() { queryClient = useQueryClient(); return null; }
  renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead/estimate"]}><Capture /><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes></MemoryRouter>);
  return { state, requests, saves, resolutions, first, second, getClient: () => queryClient };
}

async function selectRevision(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const navigation = await screen.findByRole("navigation", { name: "Estimate revisions" });
  if (!within(navigation).queryByRole("button", { name })) await user.click(navigation.querySelector("summary")!);
  await user.click(within(navigation).getByRole("button", { name }));
}

describe("Estimate workspace revisions", () => {
  it("shows pre-GST amounts, removes the masthead, and preserves current edits and room/filter state across history", async () => {
    const fixture = setup(); const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Current ceiling.*Living Room/ });
    expect(screen.getByLabelText("Estimate amount before GST: ₹100")).toBeVisible();
    expect(screen.queryByText("Total including GST")).not.toBeInTheDocument();
    expect(screen.queryByText("Project number: Lisno000009")).not.toBeInTheDocument();
    expect(screen.queryByText(/workflow and client requirements/)).not.toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*Current ceiling.*Living Room/ });
    await user.clear(quantity); await user.type(quantity, "3");
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Current");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter Main Baskets" }), "basket");
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ }));
    await user.click(screen.getByRole("button", { name: /Collapse Current interiors/ }));
    await selectRevision(user, /Pre-estimate · R1/);
    expect(await screen.findByRole("article", { name: "Published ceiling" })).toBeVisible();
    expect(screen.getAllByLabelText("Estimate amount before GST: ₹275")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const pendingDraftUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pendingDraftUnload);
    expect(pendingDraftUnload.defaultPrevented).toBe(true);
    for (const view of ["Summary", "Proposal"]) {
      await user.click(screen.getByRole("button", { name: view }));
      expect(screen.getByRole("region", { name: view === "Summary" ? "Saved revision summary" : "Saved revision proposal" })).toBeVisible();
      expect(screen.getByText("₹324.50")).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    await user.click(screen.getByRole("button", { name: "Return to current estimate" }));
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ })).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: /Expand Current interiors/ }));
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living Room/ }));
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Current ceiling.*Living Room/ })).toHaveValue(3);
    expect(screen.getByRole("searchbox", { name: "Search estimate items" })).toHaveValue("Current");
    expect(screen.getByRole("combobox", { name: "Filter Main Baskets" })).toHaveValue("basket");
    expect(fixture.requests.filter(request => request.method !== "GET")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(fixture.saves).toHaveLength(1));
    expect(fixture.saves[0]!.lineItems[0]).toMatchObject({ quantity: 3, ratePaise: 10000 });
  });

  it("keeps the selected revision isolated when older requests finish later", async () => {
    const fixture = setup(); const firstGate = deferred<Response>(); fixture.state.detailGates.set("round-one", firstGate.promise);
    const user = userEvent.setup(); await screen.findByRole("navigation", { name: "Estimate revisions" });
    await selectRevision(user, /Pre-estimate · R1/);
    expect(screen.getByText("Loading selected revision…")).toBeVisible();
    expect(screen.queryByRole("article", { name: "Current ceiling" })).not.toBeInTheDocument();
    await selectRevision(user, /Estimate · R2/);
    await screen.findByRole("article", { name: "Second published ceiling" });
    await act(async () => firstGate.resolve(json(fixture.first)));
    expect(screen.queryByRole("article", { name: "Published ceiling" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Estimate amount before GST: ₹420")).toHaveLength(2);
  });

  it("does not replace a failed historical read with current values and permits retry", async () => {
    const fixture = setup(); fixture.state.detailStatus = 503;
    const user = userEvent.setup(); await screen.findByRole("navigation", { name: "Estimate revisions" });
    await selectRevision(user, /Pre-estimate · R1/);
    await screen.findByText("The selected revision could not be loaded.");
    expect(screen.getAllByLabelText("Estimate amount before GST: Unavailable")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    fixture.state.detailStatus = 200;
    await user.click(screen.getByRole("button", { name: "Retry revision" }));
    expect(await screen.findByRole("article", { name: "Published ceiling" })).toBeVisible();
  });

  it("removes protected snapshots and revision labels after a scope denial", async () => {
    const fixture = setup(); const user = userEvent.setup();
    await selectRevision(user, /Estimate · R2/);
    await screen.findByRole("article", { name: "Second published ceiling" });
    await selectRevision(user, /Pre-estimate · R1/);
    await screen.findByRole("article", { name: "Published ceiling" });
    fixture.state.detailStatus = 403;
    await act(async () => { await fixture.getClient().invalidateQueries({ queryKey: estimateRevisionKeys.detail("estimate", "round-one", "sales-one") }); });
    await screen.findByText("This revision is no longer available for your current access.");
    expect(screen.queryByRole("article", { name: "Published ceiling" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Estimate · R2/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download revision" })).toBeDisabled();
    expect(fixture.getClient().getQueryData(estimateRevisionKeys.detail("estimate", "round-two", "sales-one"))).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Return to current estimate" }));
    expect(screen.queryByRole("navigation", { name: "Estimate revisions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Second published ceiling")).not.toBeInTheDocument();
    const freshList = deferred<Response>(); fixture.state.listGate = freshList.promise;
    fixture.state.detailStatus = 200;
    fixture.state.rounds[0] = { ...fixture.second, snapshot: { ...fixture.second.snapshot, lineItems: [{ ...fixture.second.snapshot.lineItems[0]!, mainLineName: "Freshly authorized ceiling" }] } };
    await user.click(screen.getByRole("button", { name: "Retry revisions" }));
    expect(screen.queryByRole("navigation", { name: "Estimate revisions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Second published ceiling")).not.toBeInTheDocument();
    await act(async () => freshList.resolve(json({ items: fixture.state.rounds.map(({ snapshot: _snapshot, ...summary }) => summary), pagination: { limit: 20, nextCursor: null } })));
    await selectRevision(user, /Estimate · R2/);
    expect(await screen.findByRole("article", { name: "Freshly authorized ceiling" })).toBeVisible();
    expect(screen.queryByText("Second published ceiling")).not.toBeInTheDocument();
  });

  it("downloads the originally selected round even if the user selects another revision while it loads", async () => {
    const fixture = setup(); const pdf = deferred<Response>(); fixture.state.pdfGate = pdf.promise;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:revision") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    const user = userEvent.setup(); await screen.findByRole("navigation", { name: "Estimate revisions" });
    await selectRevision(user, /Pre-estimate · R1/); await screen.findByRole("article", { name: "Published ceiling" });
    await user.click(screen.getByRole("button", { name: "Download revision" }));
    await selectRevision(user, /Estimate · R2/); await screen.findByRole("article", { name: "Second published ceiling" });
    await act(async () => pdf.resolve(new Response("first frozen PDF", { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="round-one.pdf"' } })));
    await waitFor(() => expect(downloads).toEqual(["round-one.pdf"]));
    expect(fixture.requests.filter(request => request.url.endsWith("/pdf"))).toEqual([{ method: "GET", url: "/api/v1/estimates/estimate/revisions/round-one/pdf" }]);
  });

  it.each([403, 503])("handles parent-estimate refresh failure %s without leaking a denied snapshot", async status => {
    const fixture = setup(); const user = userEvent.setup();
    await screen.findByRole("navigation", { name: "Estimate revisions" }); await selectRevision(user, /Pre-estimate · R1/);
    await screen.findByRole("article", { name: "Published ceiling" });
    fixture.state.savedStatus = status;
    await act(async () => { await fixture.getClient().invalidateQueries({ queryKey: leadKeys.estimate("lead") }); });
    if (status === 403) {
      expect(await screen.findByText("This revision is no longer available for your current access.")).toBeVisible();
      expect(screen.queryByRole("article", { name: "Published ceiling" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Estimate · R2/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download revision" })).toBeDisabled();
    } else {
      expect(screen.getByRole("article", { name: "Published ceiling" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Download revision" })).toBeEnabled();
    }
  });

  it("hides empty history and zero-request controls", async () => {
    const fixture = setup(); fixture.state.rounds = [];
    await screen.findByRole("button", { name: "Save draft" });
    await waitFor(() => expect(fixture.requests.some(request => request.url.endsWith("/revisions"))).toBe(true));
    expect(screen.queryByRole("navigation", { name: "Estimate revisions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Client requests/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/workflow and client requirements/)).not.toBeInTheDocument();
    const user = userEvent.setup();
    for (const tab of ["Summary", "Proposal"]) {
      await user.click(screen.getByRole("button", { name: tab }));
      expect(document.querySelector(".estimate-workspace__revision-rail")).toBeNull();
      expect(document.querySelector(".estimate-workspace__secondary-view")).toHaveClass("estimate-workspace__secondary-view--without-revisions");
    }
  });

  it("resolves a current request through the compact nested dialogs with saved IDs, reason validation, and CAS", async () => {
    const fixture = setup(true); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Client requests (1)" }));
    const panel = await screen.findByRole("dialog", { name: "Client requests" });
    await user.click(within(panel).getByRole("button", { name: "Resolve requirement 1" }));
    const resolve = await screen.findByRole("dialog", { name: "Resolve client requirement" });
    await user.click(within(resolve).getByRole("button", { name: "Save resolution" }));
    expect(within(resolve).getByText(/Select at least one current saved item/)).toBeVisible();
    expect(fixture.resolutions).toHaveLength(0);
    await user.selectOptions(within(resolve).getByRole("combobox", { name: "Resolution" }), "declined");
    await user.click(within(resolve).getByRole("button", { name: "Save resolution" }));
    expect(within(resolve).getByText("Explain how this request was resolved.")).toBeVisible();
    await user.selectOptions(within(resolve).getByRole("combobox", { name: "Resolution" }), "included");
    await user.click(within(resolve).getByRole("checkbox", { name: /Current ceiling.*Living Room/ }));
    await user.type(within(resolve).getByRole("textbox", { name: "Note (optional)" }), "Saved ceiling matches the request.");
    await user.click(within(resolve).getByRole("button", { name: "Save resolution" }));
    await waitFor(() => expect(fixture.resolutions).toEqual([{ expectedRequirementsVersion: 6, expectedVersion: 3, status: "included", lineItemIds: ["saved-line"], reason: "Saved ceiling matches the request." }]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Resolve client requirement" })).not.toBeInTheDocument());
    expect(within(screen.getByRole("dialog", { name: "Client requests" })).getByText("Included")).toBeVisible();
    await user.click(within(screen.getByRole("dialog", { name: "Client requests" })).getByRole("button", { name: "Close Client requests" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Request history (1)" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Client requests (0)" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit pre-estimate" })).toBeEnabled());
  });
});
