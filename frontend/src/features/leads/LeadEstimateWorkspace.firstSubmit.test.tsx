import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationSnapshot, PermissionCode, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import type { QuotationRevision } from "../client/quotationApi";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";

const session = vi.hoisted(() => ({ current: {
  status: "authenticated", user: { id: "sales-owner", role: "estimator_sales" as Role },
  reviewSession: { id: "review-one" }, authorization: null as AuthorizationSnapshot | null
} }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => session.current }));
vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));

const permissions: readonly PermissionCode[] = ["estimation.estimate.read", "estimation.estimate.save", "estimation.estimate.submit"];
const estimatePath = "/leads/lead-one/estimate";
const revisionPath = "/projects/project-one/quotation/revision";
const title = "Before submitting your estimate";
const response = (data: unknown) => Response.json({ data });
const catalogueLines = [
  { id: "ceiling", name: "Ceiling finish", ratePaise: 9500 },
  { id: "wall", name: "Wall finish", ratePaise: 4500 }
];

function pricedSave(input: EstimateDraftInput): EstimateDraft {
  const lineItems: ConfiguredEstimateLine[] = input.lineItems.map(line => {
    if (line.source !== "configuration") throw new Error("Expected a configured first draft");
    const source = catalogueLines.find(item => item.id === line.mainLineId)!;
    const amountPaise = source.ratePaise * line.quantity;
    return { ...line, id: `saved-${source.id}`, mainBasketName: "Finishes", subBasketName: "Surfaces",
      mainLineName: source.name, sourceItemStatus: "active", sourceRevisionStatus: "active",
      sourceItemVersion: 2, sourceRevisionVersion: 3, uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2,
      unit: "sq ft", rate: source.ratePaise / 100, ratePaise: source.ratePaise,
      amount: amountPaise / 100, amountPaise, specification: null };
  });
  const subtotal = lineItems.reduce((total, line) => total + line.amount!, 0);
  return { ...input, id: "estimate-created", projectId: "project-one", version: 1, lineItems,
    subtotal, gst: subtotal * 0.18, total: subtotal * 1.18, status: "draft", approvalRequired: false,
    capabilities: { canUnlockQuotation: false, canPublishQuotation: true, canChangePricingMode: true },
    estimation: { workflowVersion: 3, phase: "pre", status: "draft", requirementsVersion: 1,
      pricedRevision: 1, editClosedAt: null, preApproval: null, finalApproval: null,
      pendingReviewRoundId: null, designScopeRevision: 0, approvedDesignScopeRevision: null, preparationSnapshotId: null } };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function setup(options: { ownerId?: string; projectId?: string | null; mutateSave?: (draft: EstimateDraft) => void;
  mutateRevision?: (revision: QuotationRevision) => void; revisionGate?: Promise<void>; saveUnknown?: boolean } = {}) {
  const state = { estimate: null as EstimateDraft | null };
  const requests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/v1/, "");
    const method = init?.method ?? "GET";
    const body = method === "GET" ? undefined : JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ method, path, body });
    if (path === "/leads/lead-one") return response({ id: "lead-one", projectId: options.projectId === undefined ? "project-one" : options.projectId,
      ownerId: options.ownerId ?? "sales-owner", projectName: "Synthetic home", clientName: "Synthetic client", location: "Sample city", propertyType: "2BHK", estimationWorkflowVersion: 3 });
    if (path === estimatePath && method === "GET") return response(state.estimate);
    if (path === estimatePath && method === "PUT") {
      state.estimate = pricedSave(body as unknown as EstimateDraftInput);
      options.mutateSave?.(state.estimate);
      if (options.saveUnknown) return Response.json({ error: { code: "SAVE_UNCONFIRMED", message: "Save outcome unknown." } }, { status: 503 });
      return response(state.estimate);
    }
    if (path === revisionPath) {
      await options.revisionGate;
      if (!state.estimate) throw new Error("Revision requested before the first save");
      const revision: QuotationRevision = { estimateId: state.estimate.id, estimateVersion: state.estimate.version!,
        pricedRevision: 1, phase: "pre", status: state.estimate.status };
      options.mutateRevision?.(revision);
      return response(revision);
    }
    if (path === `${estimatePath}/submit` && method === "POST") {
      state.estimate = { ...state.estimate!, status: "sent_to_client", estimation: { ...state.estimate!.estimation!, status: "sent_to_client" } };
      return response(state.estimate);
    }
    if (path === "/projects/project-one/estimate-requirements") return response({ projectId: "project-one", requirementsVersion: 1,
      estimateVersion: state.estimate?.version ?? null, phase: "pre", editingAllowed: true, editingBlockReason: null,
      canResolve: true, requirements: [], mainBaskets: [], rooms: [], indicativeTotalPaise: null, pricingComplete: false });
    if (path === "/estimation/catalogue") return response({ items: [{ id: "basket", name: "Finishes", displayOrder: 1,
      subBaskets: [{ id: "surfaces", basketId: "basket", name: "Surfaces", displayOrder: 1, mainLines: catalogueLines.map((line, index) => ({
        id: line.id, mainLineId: line.id, basketId: "basket", subBasketId: "surfaces", name: line.name, displayOrder: index,
        revisionId: `revision-${line.id}`, itemVersion: 2, revisionVersion: 3, itemStatus: "active", revisionStatus: "active",
        uom: { id: "sqft", name: "sq ft", code: "SQFT", decimalScale: 2 },
        modeBaseRatesPaise: { pmc: line.ratePaise, sub_vendor: line.ratePaise, in_house: null }
      })) }] }], ineligibleLineCount: 0, pagination: { total: 1, hasMore: false, offset: 0, limit: 100 } });
    if (path === "/estimation/catalogue/recommendations") return response({ sources: [] });
    if (path.includes("estimate-plan-change-requests")) return response([]);
    if (path.endsWith("/design-uploads")) return response({ uploads: [], drawings: [] });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const tree = () => <QueryClientProvider client={queryClient}><FeedbackProvider><MemoryRouter initialEntries={["/estimator-sales/leads/lead-one/estimate"]}>
    <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
  </MemoryRouter></FeedbackProvider></QueryClientProvider>;
  const view = render(tree());
  return { state, requests, queryClient, writes: () => requests.filter(request => request.method !== "GET"),
    refreshAuth: () => view.rerender(tree()), unmount: view.unmount };
}

async function selectItems(user: ReturnType<typeof userEvent.setup>, count = 1) {
  await user.click(await screen.findByRole("button", { name: "Select rooms" }));
  await user.click(screen.getByRole("option", { name: "Bedroom 1" }));
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(await screen.findByRole("button", { name: "Add Finishes" }));
  await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
  await user.click(await screen.findByRole("checkbox", { name: /Ceiling finish/ }));
  if (count === 2) await user.click(screen.getByRole("checkbox", { name: /Wall finish/ }));
}

async function openAndComplete(user: ReturnType<typeof userEvent.setup>) {
  const submit = screen.getByRole("button", { name: "Submit" });
  await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
  await user.click(submit);
  const dialog = await screen.findByRole("dialog", { name: title });
  for (const checkbox of within(dialog).getAllByRole("checkbox")) await user.click(checkbox);
  return within(dialog).getByRole("button", { name: "Confirm and submit" });
}

beforeEach(() => {
  session.current = { status: "authenticated", user: { id: "sales-owner", role: "estimator_sales" },
    reviewSession: { id: "review-one" }, authorization: authorizationFor("estimator_sales", permissions) };
});

describe("First submission from a genuinely new V3 estimate", () => {
  it.each([1, 2])("saves %i selected items once, verifies the saved source, then submits its version", async count => {
    const data = setup(), user = userEvent.setup();
    await selectItems(user, count);
    expect(data.queryClient.getQueryData(leadKeys.estimate("lead-one"))).toBeNull();
    expect(screen.queryByText(/Checking the latest estimate, items and publication access/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh updates|Retry updates|Refresh estimate access/ })).not.toBeInTheDocument();
    const confirm = await openAndComplete(user);
    expect(data.writes()).toHaveLength(0);
    expect(data.requests.filter(request => request.path === revisionPath)).toHaveLength(0);
    await user.click(confirm);
    await screen.findByText(/Submitted to the client portal for approval/);
    const writes = data.writes();
    expect(writes.map(request => request.method)).toEqual(["PUT", "POST"]);
    expect(writes[0]!.body?.lineItems).toHaveLength(count);
    expect(writes[1]!.body).toEqual({ expectedVersion: 1, approveSales: true });
    const saveIndex = data.requests.findIndex(request => request.method === "PUT");
    const revisionIndex = data.requests.findIndex(request => request.path === revisionPath);
    const submitIndex = data.requests.findIndex(request => request.method === "POST");
    expect(revisionIndex).toBeGreaterThan(saveIndex);
    expect(submitIndex).toBeGreaterThan(revisionIndex);
    expect(data.state.estimate?.lineItems[0]).toMatchObject({ id: "saved-ceiling", amountPaise: 9500, sourceItemVersion: 2, sourceRevisionVersion: 3 });
  });

  it("opens and cancels by keyboard without saving or requesting a nonexistent revision", async () => {
    const data = setup(), user = userEvent.setup();
    await selectItems(user);
    const submit = screen.getByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).not.toHaveAttribute("aria-describedby"));
    submit.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(within(dialog).getAllByRole("checkbox")[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
    expect(data.writes()).toHaveLength(0);
    expect(data.requests.filter(request => request.path === revisionPath)).toHaveLength(0);
  });

  it("guards duplicate confirmation while the saved quotation verification is pending", async () => {
    const gate = deferred(), data = setup({ revisionGate: gate.promise }), user = userEvent.setup();
    await selectItems(user);
    const confirm = await openAndComplete(user);
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(data.requests.some(request => request.path === revisionPath)).toBe(true));
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "Submitting…" }));
    await act(async () => gate.resolve());
    await screen.findByText(/Submitted to the client portal for approval/);
    expect(data.writes().map(request => request.method)).toEqual(["PUT", "POST"]);
  });

  it.each(["missing", "denied"])("does not publish when the saved capability is %s", async capability => {
    const data = setup({ mutateSave: draft => { draft.capabilities = capability === "missing" ? undefined : { canUnlockQuotation: false, canPublishQuotation: false }; } });
    const user = userEvent.setup();
    await selectItems(user);
    await user.click(await openAndComplete(user));
    await screen.findByText(/Your changes are saved, but submission could not be confirmed/);
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    expect(screen.getByRole("checkbox", { name: /Ceiling finish/ })).toBeChecked();
    expect(data.queryClient.getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.id).toBe("estimate-created");
  });

  it.each(["project", "version"])("rejects an invalid saved %s before revision verification or publication", async invalid => {
    const data = setup({ mutateSave: draft => {
      if (invalid === "project") draft.projectId = "different-project";
      else draft.version = 0;
    } }), user = userEvent.setup();
    await selectItems(user);
    await user.click(await openAndComplete(user));
    await screen.findByText(/The saved draft could not be verified/);
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    expect(data.requests.filter(request => request.path === revisionPath)).toHaveLength(0);
    expect(screen.getByRole("checkbox", { name: /Ceiling finish/ })).toBeChecked();
    expect(data.queryClient.getQueryData(leadKeys.estimate("lead-one"))).toBeNull();
  });

  it.each(["permission revoked", "workspace unmounted"])("does not publish if %s during revision verification", async change => {
    const gate = deferred(), data = setup({ revisionGate: gate.promise }), user = userEvent.setup();
    await selectItems(user);
    await user.click(await openAndComplete(user));
    await waitFor(() => expect(data.requests.some(request => request.path === revisionPath)).toBe(true));
    if (change === "permission revoked") {
      session.current.authorization = authorizationFor("estimator_sales", permissions.filter(permission => permission !== "estimation.estimate.submit"));
      data.refreshAuth();
    } else data.unmount();
    await act(async () => gate.resolve());
    await waitFor(() => expect(data.queryClient.isMutating()).toBe(0));
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    if (change === "permission revoked") expect(screen.getByText(/Your estimate or access changed/)).toBeVisible();
  });

  it.each(["identity", "version", "phase", "status"])("does not publish after a mismatched verification %s", async mismatch => {
    const data = setup({ mutateRevision: revision => {
      if (mismatch === "identity") revision.estimateId = "different-estimate";
      if (mismatch === "version") revision.estimateVersion = 2;
      if (mismatch === "phase") revision.phase = "post";
      if (mismatch === "status") revision.status = "sent_to_client";
    } }), user = userEvent.setup();
    await selectItems(user);
    await user.click(await openAndComplete(user));
    await screen.findByText(/Your changes are saved, but submission could not be confirmed/);
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    expect(screen.getByRole("checkbox", { name: /Ceiling finish/ })).toBeChecked();
  });

  it("preserves local quantities and blocks duplicate writes when the save outcome is unknown", async () => {
    const data = setup({ saveUnknown: true }), user = userEvent.setup();
    await selectItems(user);
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*Ceiling finish/ });
    fireEvent.change(quantity, { target: { value: "7" } });
    await user.click(await openAndComplete(user));
    await screen.findByText(/Save outcome unknown/);
    expect(quantity).toHaveValue(7);
    expect(screen.getByRole("checkbox", { name: /Ceiling finish/ })).toBeChecked();
    expect(data.requests.filter(request => request.path === revisionPath)).toHaveLength(0);
    expect(data.writes().map(request => request.method)).toEqual(["PUT"]);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(data.writes()).toHaveLength(1);
  });

  it.each(["other owner", "missing save permission", "missing submit permission", "missing project"])("blocks first-draft publication for %s", async restriction => {
    if (restriction.startsWith("missing") && restriction.endsWith("permission")) {
      const omitted = restriction === "missing save permission" ? "estimation.estimate.save" : "estimation.estimate.submit";
      session.current.authorization = authorizationFor("estimator_sales", permissions.filter(permission => permission !== omitted));
    }
    const data = setup({ ownerId: restriction === "other owner" ? "different-sales-owner" : undefined,
      projectId: restriction === "missing project" ? null : undefined }), user = userEvent.setup();
    await selectItems(user);
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toHaveAttribute("aria-describedby");
    await user.click(submit);
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(data.writes()).toHaveLength(0);
    expect(data.requests.filter(request => request.path === revisionPath)).toHaveLength(0);
  });
});
