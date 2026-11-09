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

function setup(options: { status?: EstimateStatus; workflow3?: boolean; configured?: boolean;
  amendEstimate?: (estimate: EstimateDraft) => void; revisionGate?: Promise<void>; openRequest?: boolean } = {}) {
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
  options.amendEstimate?.(estimate);
  const state = { estimate, failure: null as "save" | "saveUnknown" | "submit" | "send" | null, refreshFailure: null as "estimate" | "revision" | null, gate: undefined as Promise<void> | undefined,
    getGate: undefined as Promise<void> | undefined, revisionGate: options.revisionGate };
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/v1/, "");
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push({ method, path, body: JSON.parse(String(init?.body ?? "{}")) });
    if (path === "/leads/lead-one/estimate" && method === "GET") {
      await state.getGate;
      if (state.refreshFailure === "estimate") return Response.json({ error: { code: "UNAVAILABLE", message: "Estimate unavailable." } }, { status: 503 });
      return response(state.estimate);
    }
    if (path === "/leads/lead-one") return response({ id: "lead-one", projectId: "project-one", projectName: "Sample home", clientName: "Sample client", location: "Sample city", propertyType: "2BHK", ...(options.workflow3 ? { estimationWorkflowVersion: 3 } : {}) });
    if (path === "/leads/lead-one/estimate" && method === "PUT") {
      await state.gate;
      if (state.failure === "save") return Response.json({ error: { code: "SAVE_REJECTED", message: "Save rejected." } }, { status: 409 });
      const body = JSON.parse(String(init?.body)) as EstimateDraftInput;
      state.estimate = { ...state.estimate, ...body, version: state.estimate.version! + 1,
        lineItems: body.lineItems.map(line => line.source === "configuration"
          ? { ...state.estimate.lineItems.find(saved => saved.source === "configuration" && saved.id === line.id), ...line } as ConfiguredEstimateLine : line) };
      if (state.failure === "saveUnknown") return Response.json({ error: { code: "SAVE_UNCONFIRMED", message: "Save outcome unknown." } }, { status: 503 });
      return response(state.estimate);
    }
    if (path === "/leads/lead-one/estimate/submit" || path === "/estimates/estimate-one/send-client") {
      await state.gate;
      if (state.failure === (path.endsWith("/submit") ? "submit" : "send")) return Response.json({ error: { code: "PUBLICATION_REJECTED", message: "Publication rejected." } }, { status: 409 });
      state.estimate = { ...state.estimate, status: "sent_to_client", ...(state.estimate.estimation ? { estimation: { ...state.estimate.estimation, status: "sent_to_client" } } : {}) };
      return response(state.estimate);
    }
    if (path === "/projects/project-one/quotation/revision") {
      await state.revisionGate;
      if (state.refreshFailure === "revision") return Response.json({ error: { code: "UNAVAILABLE", message: "Quotation updates unavailable." } }, { status: 503 });
      return response({ estimateId: state.estimate.id, estimateVersion: state.estimate.version, pricedRevision: 3, phase: state.estimate.estimation?.phase ?? "pre", status: state.estimate.status });
    }
    if (path === "/projects/project-one/estimate-requirements") return response({ projectId: "project-one", requirementsVersion: 1, estimateVersion: state.estimate.version, phase: "pre", editingAllowed: true, editingBlockReason: null,
      canResolve: true, requirements: options.openRequest ? [{ id: "request-one", status: "open", requestKind: "item", roomId: "living", mainBasketId: "basket", message: "Review ceiling" }] : [], mainBaskets: [], rooms: [], indicativeTotalPaise: 2242000, pricingComplete: true });
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

async function openChecklist(user: ReturnType<typeof userEvent.setup>, name = "Submit") {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).not.toHaveAttribute("aria-describedby"));
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
  it("shows Save draft and Submit after setup and hides them when editing Main Baskets", async () => {
    const data = setup({ workflow3: true, configured: true }); const user = userEvent.setup();
    await screen.findByRole("button", { name: "Submit" });
    const expectActions = () => {
      expect(screen.getAllByRole("button", { name: "Save draft" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Submit" })).toHaveLength(1);
      const footer = screen.getByRole("button", { name: "Submit" }).closest("footer");
      expect(footer).toContainElement(screen.getByRole("button", { name: "Save draft" }));
    };
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());
    expectActions();
    for (const name of ["Summary", "Proposal"]) {
      await user.click(screen.getByRole("button", { name }));
      expectActions();
    }
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeEnabled();
    expect(document.querySelector(".estimate-workspace__footer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expectActions();
    expect(data.writes).toEqual([]);
  });

  it("continues from Setup before submitting the exact current items and returned version", async () => {
    const data = setup({ workflow3: true, configured: true }); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit baskets" }));
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    const dialog = await openChecklist(user);
    expect(dialog).toHaveAccessibleDescription(/saves your current draft, approves it as Sales, and sends the quotation to the client for approval/);
    await user.click(await completeChecklist(user));
    await waitFor(() => expect(data.writes).toHaveLength(2));
    expect(data.writes[0]).toMatchObject({ method: "PUT", body: { expectedVersion: 7, selectedMainBasketIds: ["basket"],
      lineItems: [{ id: "saved-ceiling", roomId: "living", mainLineId: "ceiling", quantity: 200, included: true, ratePaise: 9500 }] } });
    expect(data.writes[1]).toEqual({ method: "POST", path: "/leads/lead-one/estimate/submit", body: { expectedVersion: 8, approveSales: true } });
  });

  it("keeps empty Setup focused on continuing without save or publication actions", async () => {
    const data = setup({ workflow3: true, configured: true, amendEstimate: estimate => { estimate.lineItems = []; estimate.rooms = []; estimate.scopes = []; } });
    expect(await screen.findByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    expect(document.querySelector(".estimate-workspace__footer")).not.toBeInTheDocument();
    expect(data.writes).toEqual([]);
  });

  it.each(["missing", "denied", "post"] as const)("keeps Submit visible without %s publication capability", async kind => {
    const data = setup({ workflow3: true, amendEstimate: estimate => {
      if (kind === "missing") delete estimate.capabilities;
      else estimate.capabilities = { canUnlockQuotation: false, canPublishQuotation: false };
      if (kind === "post") estimate.estimation!.phase = "post";
    } });
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).toHaveAccessibleDescription(kind === "post"
      ? "The assigned Designer submits revised quotations. You can still save this draft."
      : kind === "missing" ? "Submission access could not be verified. Refresh the estimate to check your access. Your local edits are preserved."
      : "This estimate cannot be submitted with your current access and workflow state. Refresh the estimate to check for updates."));
    expect(submit).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    fireEvent.click(submit);
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)).toHaveFocus();
    expect(data.writes).toEqual([]);
  });

  it("waits for a verified quotation revision before allowing Submit", async () => {
    const gate = deferred(); const data = setup({ workflow3: true, revisionGate: gate.promise });
    const submit = await screen.findByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    expect(submit).toHaveAttribute("aria-describedby");
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)).toHaveTextContent(/latest estimate|before submitting/);
    fireEvent.click(submit); expect(data.writes).toEqual([]);
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
  });

  it.each(["estimate", "revision"] as const)("omits the Sales refresh footer after %s failure and submits preserved edits after recovery", async failure => {
    const data = setup({ workflow3: true, configured: true }); const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Ceiling finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    const submit = screen.getByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    await user.clear(quantity()); await user.type(quantity(), "245");
    data.state.refreshFailure = failure;
    const queryKey = failure === "estimate" ? leadKeys.estimate("lead-one") : quotationKeys.revision("project-one");
    await act(async () => { await data.queryClient.refetchQueries({ queryKey, exact: true }); });
    const errorNotice = await screen.findByText(failure === "estimate"
      ? "The saved estimate could not be refreshed. Your local edits are preserved; refresh before continuing."
      : /Quotation updates could not be checked\. Your edits are preserved\./);
    expect(errorNotice).toBeVisible();
    const expectNoRefreshFooter = () => {
      expect(screen.queryByText("Refresh the estimate updates before submitting. Your local edits are preserved.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Refresh estimate access" })).not.toBeInTheDocument();
      expect(submit).not.toHaveAttribute("aria-describedby");
      expect(quantity()).toHaveValue(245);
      expect(data.writes).toEqual([]);
    };
    expectNoRefreshFooter();
    submit.focus(); await user.keyboard("{Enter}");
    expectNoRefreshFooter();
    expect(submit).toHaveFocus();
    expect(errorNotice).toBeVisible();
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();

    data.state.refreshFailure = null;
    if (failure === "revision") await user.click(screen.getByRole("button", { name: "Retry updates" }));
    else await act(async () => { await data.queryClient.refetchQueries({ queryKey, exact: true }); });
    await waitFor(() => expect(quantity()).toBeEnabled());
    expect(quantity()).toHaveValue(245);
    await openChecklist(user);
    await user.click(await completeChecklist(user));
    await waitFor(() => expect(data.writes).toHaveLength(2));
    expect(data.writes[0]).toMatchObject({ method: "PUT", body: { expectedVersion: 7,
      lineItems: [{ id: "saved-ceiling", quantity: 245, included: true }] } });
    expect(data.writes[1]).toEqual({ method: "POST", path: "/leads/lead-one/estimate/submit", body: { expectedVersion: 8, approveSales: true } });
  });

  it("preserves explicit feedback when a refresh failure closes the Sales checklist", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    await openChecklist(user); const confirm = await completeChecklist(user);
    data.state.refreshFailure = "revision";
    await act(async () => { await data.queryClient.refetchQueries({ queryKey: quotationKeys.revision("project-one"), exact: true }); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    const submit = screen.getByRole("button", { name: "Submit" });
    const feedback = screen.getByText("The estimate or your access changed. Review the latest details and submit again.").closest('[role="alert"]');
    expect(feedback).toBeVisible();
    expect(submit).toHaveAccessibleDescription(/The estimate or your access changed\. Review the latest details and submit again\./);
    await waitFor(() => expect([submit, feedback]).toContain(document.activeElement));
    fireEvent.click(confirm);
    expect(data.writes).toEqual([]);
  });

  it("retains the Designer refresh warning and access action", async () => {
    session.current = { ...session.current, user: { id: "designer-one", role: "designer" }, authorization: authorizationFor("designer", permissions) };
    const data = setup(); const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    data.state.refreshFailure = "estimate";
    await act(async () => { await data.queryClient.refetchQueries({ queryKey: leadKeys.estimate("lead-one"), exact: true }); });
    await waitFor(() => expect(submit).toHaveAccessibleDescription("Refresh the estimate updates before submitting. Your local edits are preserved."));
    await user.click(submit);
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)).toHaveFocus();
    data.state.refreshFailure = null;
    await user.click(screen.getByRole("button", { name: "Refresh estimate access" }));
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    expect(data.writes).toEqual([]);
  });

  it("keeps checked confirmation stable while the verified revision token is polled", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    const dialog = await openChecklist(user); const confirm = await completeChecklist(user);
    const gate = deferred(); data.state.revisionGate = gate.promise;
    let refreshed!: Promise<void>;
    await act(async () => { refreshed = data.queryClient.refetchQueries({ queryKey: quotationKeys.revision("project-one"), exact: true }); });
    expect(dialog).toBeVisible();
    within(dialog).getAllByRole("checkbox").forEach(check => expect(check).toBeChecked());
    expect(confirm).toBeEnabled();
    expect(data.writes).toEqual([]);
    await act(async () => { gate.resolve(); await refreshed; });
    expect(dialog).toBeVisible();
    within(dialog).getAllByRole("checkbox").forEach(check => expect(check).toBeChecked());
  });

  it("explains outstanding client requests when Submit is activated", async () => {
    setup({ workflow3: true, openRequest: true });
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).toHaveAccessibleDescription("Resolve the open client requests before submitting."));
    expect(submit).toBeEnabled();
  });

  it("explains internal routing for a legacy estimate above the approval threshold", async () => {
    setup({ amendEstimate: estimate => { estimate.lineItems[0]!.quantity = 20_000; } });
    const dialog = await openChecklist(userEvent.setup());
    expect(dialog).toHaveAccessibleDescription(/submits it for internal approval.*design manager must assign a designer/);
  });

  it("preserves publication feedback while Setup hides actions and restores it on returning to items", async () => {
    const data = setup({ workflow3: true, configured: true }); data.state.failure = "submit"; const user = userEvent.setup();
    await openChecklist(user);
    await user.click(await completeChecklist(user));
    await screen.findByText("Publication rejected.");
    expect(data.writes).toHaveLength(2);
    expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.version).toBe(8);
    expect(data.state.estimate.lineItems[0]).toMatchObject({ id: "saved-ceiling", quantity: 200, included: true });
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    expect(screen.getByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(document.querySelector(".estimate-workspace__footer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to saved items" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeVisible();
    expect(screen.getByText("Publication rejected.")).toBeVisible();
  });

  it("requires verification after an unknown item-selection save and never submits the unconfirmed version", async () => {
    const data = setup({ workflow3: true }); data.state.failure = "saveUnknown"; const user = userEvent.setup();
    await openChecklist(user);
    await user.click(await completeChecklist(user));
    const verify = await screen.findByRole("button", { name: "Verify saved estimate" });
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    expect(submit).toHaveAccessibleDescription("Verify the saved estimate before submitting.");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(data.writes).toHaveLength(1);
    expect(data.writes[0]?.method).toBe("PUT");
    await user.click(verify);
    await screen.findByText("Estimate save confirmed. You can continue editing.");
    expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.version).toBe(8);
    expect(data.writes).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
  });

  it("does not save on opening, partial confirmation or cancellation, and requires fresh checks", async () => {
    const { writes } = setup(); const user = userEvent.setup();
    const dialog = await openChecklist(user);
    const checks = within(dialog).getAllByRole("checkbox");
    expect(checks).toHaveLength(3);
    checks.forEach(check => expect(check).not.toBeChecked());
    await user.click(checks[0]!); await user.click(checks[1]!);
    const confirm = within(dialog).getByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeEnabled();
    confirm.focus(); await user.keyboard("{Enter}");
    expect(checks[2]).toHaveFocus();
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus();
    const reopened = await openChecklist(user);
    within(reopened).getAllByRole("checkbox").forEach(check => expect(check).not.toBeChecked());
    await user.keyboard("{Escape}");
    expect(writes).toEqual([]);
  });

  it("saves then submits the confirmed Sales version once despite duplicate pending clicks", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    await openChecklist(user, "Submit");
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

  it("keeps Designer ready-for-client Submit operable and sends only once while busy", async () => {
    session.current = { ...session.current, user: { id: "designer-one", role: "designer" }, authorization: authorizationFor("designer", permissions) };
    const data = setup({ status: "ready_for_client" }); const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    const gate = deferred(); data.state.gate = gate.promise;
    await user.dblClick(submit);
    const pending = screen.getByRole("button", { name: "Submitting…" });
    expect(pending).toBeEnabled(); expect(pending).toHaveAttribute("aria-busy", "true");
    await user.click(pending);
    expect(data.writes).toEqual([{ method: "POST", path: "/estimates/estimate-one/send-client", body: {} }]);
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Submitting…" })).not.toBeInTheDocument());
    expect(data.writes).toHaveLength(1);
  });

  it("keeps publication available to another role already offered the legacy Submit action", async () => {
    session.current = { ...session.current, user: { id: "admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", permissions) };
    const data = setup(); const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "Submit estimate" });
    expect(submit).toBeEnabled(); await user.click(submit);
    await waitFor(() => expect(data.writes).toHaveLength(2));
    expect(data.writes.map(write => write.method)).toEqual(["PUT", "POST"]);
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
    const submit = screen.getByRole("button", { name: "Submit" });
    const feedback = document.getElementById(submit.getAttribute("aria-describedby")!);
    expect(feedback).toHaveTextContent("The estimate or your access changed.");
    await waitFor(() => expect([submit, feedback]).toContain(document.activeElement));
  });

  it("explains a read-only transition while the checklist is open in item selection", async () => {
    const data = setup({ workflow3: true, configured: true }); const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    await openChecklist(user); const confirm = await completeChecklist(user);
    data.state.estimate = { ...data.state.estimate, version: 8, status: "sent_to_client",
      estimation: { ...data.state.estimate.estimation!, status: "sent_to_client" } };
    await act(async () => { data.queryClient.setQueryData(leadKeys.estimate("lead-one"), data.state.estimate); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    fireEvent.click(confirm);
    const feedback = screen.getByText("The estimate or your access changed. Review the latest details and submit again.").closest('[role="alert"]');
    expect(feedback).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(data.writes).toEqual([]);
    await waitFor(() => expect(feedback).toHaveFocus());
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
    if (change === "permission") {
      const submit = screen.getByRole("button", { name: "Submit" });
      expect(submit).toBeEnabled(); await user.click(submit);
      expect(submit).toHaveAccessibleDescription("Your current access does not allow estimate submission.");
      expect(data.writes).toEqual([]);
    }
  });

  it("rejects a newer quotation token before the saved estimate refresh completes", async () => {
    const data = setup({ workflow3: true }); const user = userEvent.setup();
    await openChecklist(user, "Submit"); const confirm = await completeChecklist(user);
    const gate = deferred(); data.state.getGate = gate.promise;
    await act(async () => { data.queryClient.setQueryData(quotationKeys.revision("project-one"), {
      estimateId: "estimate-one", estimateVersion: 8, pricedRevision: 4, phase: "pre", status: "draft"
    }); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.version).toBe(7);
    fireEvent.click(confirm); expect(data.writes).toEqual([]);
    await act(async () => { gate.resolve(); });
  });

  it("submits directly for an authorized Designer without a draft button or Sales checklist", async () => {
    session.current = { ...session.current, user: { id: "designer-one", role: "designer" }, authorization: authorizationFor("designer", permissions) };
    const data = setup(); const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await user.click(submit);
    await waitFor(() => expect(data.writes.map(write => write.path)).toEqual([
      "/leads/lead-one/estimate", "/leads/lead-one/estimate/submit"
    ]));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
  });
});
