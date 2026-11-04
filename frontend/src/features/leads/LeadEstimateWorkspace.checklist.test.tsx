import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationSnapshot, PermissionCode, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { quotationKeys } from "../client/quotationApi";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput, type EstimateStatus } from "./leadsApi";

const session = vi.hoisted(() => ({ current: {
  status: "authenticated",
  user: { id: "estimator-one", role: "estimator_sales" as Role },
  reviewSession: { id: "review-one" },
  authorization: null as AuthorizationSnapshot | null
} }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => session.current }));
vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));

const permissions: readonly PermissionCode[] = ["estimation.estimate.read", "estimation.estimate.save", "estimation.estimate.submit", "estimation.estimate.send_client"];
const title = "Before submitting your estimate";
const response = (data: unknown) => Response.json({ data });
const fixture = (status: EstimateStatus = "draft"): EstimateDraft => ({
  id: "estimate-one", projectId: "project-one", version: 7,
  propertyType: "2BHK", rooms: [{ id: "living", label: "Living Room", typeId: "living", icon: "", sqft: 200, length: null, width: null }], scopes: ["FC"],
  lineItems: [{ source: "legacy", catalogueId: "FC01", roomName: "Living Room", specification: "Gypsum plain", unit: "sqft", rate: 95, quantity: 200, included: true }],
  subtotal: 19000, gst: 3420, total: 22420, status, approvalRequired: false
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function setup(options: { status?: EstimateStatus; workflow3?: boolean; configured?: boolean } = {}) {
  const estimate = fixture(options.status);
  if (options.workflow3) {
    estimate.estimation = { workflowVersion: 3, phase: "pre", status: estimate.status, requirementsVersion: 1,
      pricedRevision: 3, editClosedAt: null, preApproval: null, finalApproval: null, pendingReviewRoundId: null,
      designScopeRevision: 0, approvedDesignScopeRevision: null, preparationSnapshotId: null };
    estimate.capabilities = { canUnlockQuotation: false, canPublishQuotation: true };
  }
  if (options.configured) {
    const line: ConfiguredEstimateLine = { id: "saved-ceiling", source: "configuration", catalogueId: "ceiling",
      roomId: "living", roomName: "Living Room", mainBasketId: "basket", mainBasketName: "Finishes", subBasketId: "sub", subBasketName: "Ceilings",
      mainLineId: "ceiling", mainLineName: "Ceiling finish", revisionId: "revision-ceiling", uomId: "sqft", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2,
      unit: "sq ft", quantity: 200, included: true, pricingMode: "sub_vendor", rateSource: "manual", rate: 95, ratePaise: 9500,
      amount: 19000, amountPaise: 1900000, specification: null };
    estimate.selectedMainBasketIds = ["basket"]; estimate.scopes = []; estimate.lineItems = [line];
  }
  const state = { estimate, failure: null as "save" | "submit" | "send" | null, gate: undefined as Promise<void> | undefined,
    getGate: undefined as Promise<void> | undefined };
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/v1/, "");
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push({ method, path, body: JSON.parse(String(init?.body ?? "{}")) });
    if (path === "/leads/lead-one/estimate" && method === "GET") { await state.getGate; return response(state.estimate); }
    if (path === "/leads/lead-one") return response({ id: "lead-one", projectId: "project-one", projectName: "Sample home", clientName: "Sample client", location: "Sample city", propertyType: "2BHK", ...(options.workflow3 ? { estimationWorkflowVersion: 3 } : {}) });
    if (path === "/leads/lead-one/estimate" && method === "PUT") {
      await state.gate;
      if (state.failure === "save") return Response.json({ error: { code: "SAVE_REJECTED", message: "Save rejected." } }, { status: 409 });
      const body = JSON.parse(String(init?.body)) as EstimateDraftInput;
      state.estimate = { ...state.estimate, ...body, version: state.estimate.version! + 1,
        lineItems: body.lineItems.map(line => line.source === "configuration"
          ? { ...state.estimate.lineItems.find(saved => saved.source === "configuration" && saved.id === line.id), ...line } as ConfiguredEstimateLine : line) };
      return response(state.estimate);
    }
    if (path === "/leads/lead-one/estimate/submit" || path === "/estimates/estimate-one/send-client") {
      await state.gate;
      if (state.failure === (path.endsWith("/submit") ? "submit" : "send")) return Response.json({ error: { code: "PUBLICATION_REJECTED", message: "Publication rejected." } }, { status: 409 });
      state.estimate = { ...state.estimate, status: "sent_to_client", ...(state.estimate.estimation ? { estimation: { ...state.estimate.estimation, status: "sent_to_client" } } : {}) };
      return response(state.estimate);
    }
    if (path === "/projects/project-one/quotation/revision") return response({ estimateId: state.estimate.id, estimateVersion: state.estimate.version, pricedRevision: 3, phase: "pre", status: state.estimate.status });
    if (path === "/projects/project-one/estimate-requirements") return response({ projectId: "project-one", requirementsVersion: 1, estimateVersion: state.estimate.version, phase: "pre", editingAllowed: true, editingBlockReason: null,
      canResolve: true, requirements: [], mainBaskets: [], rooms: [], indicativeTotalPaise: 2242000, pricingComplete: true });
    if (path === "/estimation/catalogue") return response({ items: [{ id: "basket", name: "Finishes", displayOrder: 1, subBaskets: [{ id: "sub", basketId: "basket", name: "Ceilings", displayOrder: 1,
      mainLines: [{ id: "ceiling", mainLineId: "ceiling", basketId: "basket", subBasketId: "sub", name: "Ceiling finish", displayOrder: 1,
        revisionId: "revision-ceiling", itemVersion: 1, revisionVersion: 1, uom: { id: "sqft", name: "sq ft", code: "SQFT", decimalScale: 2 },
        modeBaseRatesPaise: { pmc: 9500, sub_vendor: 9500, in_house: null } }] }] }], ineligibleLineCount: 0, pagination: { total: 1, hasMore: false, offset: 0, limit: 100 } });
    if (path === "/estimation/catalogue/recommendations") return response({ sources: [] });
    if (path.includes("estimate-plan-change-requests")) return response([]);
    if (path.endsWith("/design-uploads")) return response({ uploads: [], drawings: [] });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const tree = () => <QueryClientProvider client={queryClient}><FeedbackProvider><MemoryRouter initialEntries={["/estimator-sales/leads/lead-one/estimate"]}>
    <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
  </MemoryRouter></FeedbackProvider></QueryClientProvider>;
  const view = render(tree());
  return { state, writes, queryClient, refreshAuth: () => view.rerender(tree()) };
}

async function openChecklist(user: ReturnType<typeof userEvent.setup>, name = "Submit estimate") {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  return screen.findByRole("dialog", { name: title });
}

async function completeChecklist(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole("dialog", { name: title });
  for (const checkbox of within(dialog).getAllByRole("checkbox")) await user.click(checkbox);
  return within(dialog).getByRole("button", { name: /Confirm and (submit|send)/ });
}

beforeEach(() => {
  session.current = { status: "authenticated", user: { id: "estimator-one", role: "estimator_sales" }, reviewSession: { id: "review-one" },
    authorization: authorizationFor("estimator_sales", permissions) };
});

describe("Estimator submission checklist integration", () => {
  it("does not save on opening, partial confirmation or cancellation, and requires fresh checks", async () => {
    const { writes } = setup(); const user = userEvent.setup();
    const dialog = await openChecklist(user);
    const checks = within(dialog).getAllByRole("checkbox");
    expect(checks).toHaveLength(3);
    checks.forEach(check => expect(check).not.toBeChecked());
    await user.click(checks[0]!); await user.click(checks[1]!);
    const confirm = within(dialog).getByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit estimate" })).toHaveFocus();
    const reopened = await openChecklist(user);
    within(reopened).getAllByRole("checkbox").forEach(check => expect(check).not.toBeChecked());
    await user.keyboard("{Escape}");
    expect(writes).toEqual([]);
  });

  it("saves then submits the confirmed Sales version once despite duplicate pending clicks", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    await openChecklist(user, "Approve and send to client");
    const confirm = await completeChecklist(user);
    const gate = deferred(); data.state.gate = gate.promise;
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(data.writes).toHaveLength(1));
    expect(data.writes[0]).toMatchObject({ method: "PUT", path: "/leads/lead-one/estimate", body: { expectedVersion: 7 } });
    expect(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(data.writes).toHaveLength(2));
    expect(data.writes[1]).toEqual({ method: "POST", path: "/leads/lead-one/estimate/submit", body: { expectedVersion: 8, approveSales: true } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
  });

  it("gates ready-for-client send without saving or resubmitting the estimate", async () => {
    const data = setup({ status: "ready_for_client" }); const user = userEvent.setup();
    await openChecklist(user, "Send to client");
    expect(data.writes).toEqual([]);
    const confirm = await completeChecklist(user);
    const gate = deferred(); data.state.gate = gate.promise;
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(data.writes).toEqual([{ method: "POST", path: "/estimates/estimate-one/send-client", body: {} }]));
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(data.writes).toHaveLength(1);
  });

  it("requires fresh checks after a failed confirmed attempt", async () => {
    const data = setup(); data.state.failure = "save"; const user = userEvent.setup();
    await openChecklist(user);
    await user.click(await completeChecklist(user));
    await screen.findByText("Save rejected.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    const dialog = await openChecklist(user);
    within(dialog).getAllByRole("checkbox").forEach(check => expect(check).not.toBeChecked());
    expect(data.writes).toHaveLength(1);
    expect(data.state.estimate.version).toBe(7);
  });

  it("invalidates pending acceptance when a newer saved version arrives", async () => {
    const data = setup(); const user = userEvent.setup();
    await openChecklist(user); const confirm = await completeChecklist(user);
    await act(async () => { data.queryClient.setQueryData(leadKeys.estimate("lead-one"), { ...data.state.estimate, version: 8 }); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    fireEvent.click(confirm);
    expect(data.writes).toEqual([]);
  });

  it("invalidates a raw configured price edit even when its numeric saved value is unchanged", async () => {
    const data = setup({ configured: true }); const user = userEvent.setup();
    await openChecklist(user); await completeChecklist(user);
    const rate = screen.getByRole("textbox", { name: /Selling rate.*Ceiling finish/, hidden: true });
    fireEvent.change(rate, { target: { value: "095.00" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(rate).toHaveValue("095.00");
    expect(data.writes).toEqual([]);
  });

  it.each(["actor", "role", "permission"] as const)("invalidates the checklist after an %s change", async change => {
    const data = setup(); const user = userEvent.setup();
    await openChecklist(user); const oldConfirm = await completeChecklist(user);
    if (change === "actor") session.current = { ...session.current, user: { ...session.current.user, id: "estimator-two" } };
    if (change === "role") session.current = { ...session.current, user: { ...session.current.user, role: "designer" }, authorization: authorizationFor("designer", permissions) };
    if (change === "permission") session.current = { ...session.current, authorization: authorizationFor("estimator_sales", permissions.filter(permission => permission !== "estimation.estimate.submit")) };
    data.refreshAuth();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    fireEvent.click(oldConfirm);
    expect(data.writes).toEqual([]);
    if (change === "permission") expect(screen.getByRole("button", { name: "Submit estimate" })).toBeDisabled();
  });

  it("rejects a newer quotation token before the saved estimate refresh completes", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    await openChecklist(user, "Approve and send to client"); const confirm = await completeChecklist(user);
    const gate = deferred(); data.state.getGate = gate.promise;
    await act(async () => { data.queryClient.setQueryData(quotationKeys.revision("project-one"), {
      estimateId: "estimate-one", estimateVersion: 8, pricedRevision: 4, phase: "pre", status: "draft"
    }); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.version).toBe(7);
    fireEvent.click(confirm); expect(data.writes).toEqual([]);
    await act(async () => { gate.resolve(); });
  });

  it("keeps Save draft and authorized Designer submission outside the estimator checklist", async () => {
    session.current = { ...session.current, user: { id: "designer-one", role: "designer" }, authorization: authorizationFor("designer", permissions) };
    const data = setup(); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Submit estimate" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.version).toBe(8));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit estimate" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(data.writes.map(write => write.path)).toEqual([
      "/leads/lead-one/estimate", "/leads/lead-one/estimate", "/leads/lead-one/estimate/submit"
    ]));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
  });
});
