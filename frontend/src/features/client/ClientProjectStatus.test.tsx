import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import * as api from "../project-status/projectStatusApi";
import * as estimatesApi from "../estimates/estimateWorkflowApi";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import { ClientProjectStatus } from "./ClientProjectStatus";

const auth = vi.hoisted(() => ({ id: "client-a", role: "client" as "client" | "designer", session: "session-a", authenticated: true, permitted: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: auth.id, role: auth.role }, status: auth.authenticated ? "authenticated" : "unauthenticated",
  authorization: auth.permitted ? authorizationFor(auth.role) : null, reviewSession: { id: auth.session }
}) }));

const observers = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  Object.assign(auth, { id: "client-a", role: "client", session: "session-a", authenticated: true, permitted: true });
  observers.clear();
  focusManager.setFocused(true);
  vi.stubGlobal("IntersectionObserver", class {
    readonly root = null; readonly rootMargin = "0px"; readonly thresholds = [0];
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { observers.set(target, this.callback); }
    unobserve(target: Element) { observers.delete(target); }
    disconnect() { for (const [target, callback] of observers) if (callback === this.callback) observers.delete(target); }
    takeRecords() { return []; }
  });
  vi.spyOn(estimatesApi, "getClientEstimates").mockResolvedValue([estimate("project-a"), estimate("project-b")]);
  vi.spyOn(api, "getProjectStatus").mockImplementation(async projectId => fixture(projectId));
});
afterEach(() => vi.unstubAllGlobals());

function fixture(projectId = "project-a", label = "Estimate"): ProjectStatusSummary {
  return {
    projectId, projectName: "Shared home", projectStatus: "planning", state: "active", serverNow: "2026-11-24T00:00:00Z", issue: null,
    currentStage: { key: "estimate_approval", label },
    pendingActions: [{ id: "review", stageKey: "estimate_approval", stageLabel: label, action: "Review estimate", responsibleRole: "client", people: [], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }]
  };
}

function estimate(projectId: string, approved = false): estimatesApi.EstimateQueueItem {
  return withPublishedReview({ id: `estimate-${projectId}`, projectId, version: approved ? 4 : 3, status: approved ? "client_approved" as const : "sent_to_client" as const,
    propertyType: "Villa", rooms: [], scopes: [], lineItems: [], subtotal: 0, gst: 0, total: 0, approvalRequired: true,
    lead: { _id: "lead", projectId, clientName: "Client", projectName: "Shared home", location: "Test" } });
}

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const content = (projectId: string, duplicate = false) => <QueryClientProvider client={client}><main><h1>Project status</h1><ClientProjectStatus projectId={projectId} projectName="Shared home" projectNumber="Lisno000011" />{duplicate ? <ClientProjectStatus projectId={projectId} projectName="Shared home" /> : null}</main></QueryClientProvider>;
  const view = render(content("project-a"));
  return { ...view, client, change: (projectId = "project-a", duplicate = false) => view.rerender(content(projectId, duplicate)) };
}

async function visible(isIntersecting = true) {
  await act(async () => {
    for (const [target, callback] of observers) callback([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

async function focus() {
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
}

const key = api.projectStatusKeys.detail("project-a", "client-a:client:session-a");

describe("Client project workflow status", () => {
  it.each([403, 404, 503])("hides the phase after an estimate read fails with %s and verifies retry", async status => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    vi.mocked(estimatesApi.getClientEstimates).mockRejectedValue(new ApiError(status, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: estimatesApi.estimateWorkflowKeys.client }); });
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    if (status !== 503) expect(view.client.getQueryData(estimatesApi.estimateWorkflowKeys.clientSession("client-a:client:session-a"))).toBeUndefined();
    vi.mocked(estimatesApi.getClientEstimates).mockResolvedValue([estimate("project-a", true)]);
    await userEvent.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Post approval")).toBeVisible();
  });

  it("requires a fresh read of retained estimates before using approval evidence", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(estimatesApi.estimateWorkflowKeys.clientSession("client-a:client:session-a"), [estimate("project-a", true)]);
    let finish!: (rows: estimatesApi.EstimateQueueItem[]) => void;
    vi.mocked(estimatesApi.getClientEstimates).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount(client); await visible();
    expect(screen.queryByText("Post approval")).not.toBeInTheDocument();
    expect(screen.getByText("Loading status…")).toBeVisible();
    await act(async () => finish([estimate("project-a")]));
    expect(await screen.findByText("Estimate")).toBeVisible();
  });

  it("loads only visible rows, refreshes on return/focus, and never polls", async () => {
    const view = mount();
    expect(api.getProjectStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Loading status…")).toBeVisible();
    await focus();
    expect(api.getProjectStatus).not.toHaveBeenCalled();
    await visible();
    expect(await screen.findByText("Estimate")).toBeVisible();
    expect(api.getProjectStatus).toHaveBeenCalledTimes(1);

    await visible(false);
    await focus();
    expect(api.getProjectStatus).toHaveBeenCalledTimes(1);
    await visible();
    await waitFor(() => expect(api.getProjectStatus).toHaveBeenCalledTimes(2));
    await focus();
    await waitFor(() => expect(api.getProjectStatus).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(view.client.getQueryState(key)?.fetchStatus).toBe("idle"));
    vi.useFakeTimers();
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ["completed", "pending", "Completed"],
    ["paused", "pending", "On hold"],
    ["scheduled", "scheduled", "Scheduled"],
    ["active", "blocked", "Blocked"],
    ["no_pending", "pending", "Estimate"],
    ["unavailable", "pending", "Status needs review"]
  ] as const)("preserves the shared %s / %s presentation", async (state, actionState, label) => {
    const summary = fixture(); summary.state = state; summary.pendingActions[0]!.state = actionState;
    if (state === "completed") vi.mocked(estimatesApi.getClientEstimates).mockResolvedValue([{ ...estimate("project-a", true), designPlanStatus: "approved", designPlanVersion: 1 }]);
    vi.mocked(api.getProjectStatus).mockResolvedValue(summary);
    mount(); await visible();
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
  });

  it("requires a fresh same-session read before displaying cached status, then supports keyboard retry", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, fixture());
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    const view = mount(client);
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    await visible();
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry status for Shared home (Lisno000011)" });
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    vi.mocked(api.getProjectStatus).mockResolvedValue(fixture());
    retry.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Estimate")).toBeVisible();
  });

  it("marks only verified same-project data stale after transient errors and recovers", async () => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: key }); });
    expect(await screen.findByText("Out of date")).toBeVisible();
    expect(screen.getByText("Estimate")).toBeVisible();
    vi.mocked(api.getProjectStatus).mockResolvedValue(fixture("project-a", "Post approval"));
    vi.mocked(estimatesApi.getClientEstimates).mockResolvedValue([estimate("project-a", true)]);
    await userEvent.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Post approval")).toBeVisible();
    expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
  });

  it.each([401, 403, 404])("clears verified status and cache after a %s denial, including a subsequent transient failure", async status => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(status, "FORBIDDEN", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: key }); });
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(view.client.getQueryData(key)).toBeUndefined();
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await userEvent.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
    vi.mocked(api.getProjectStatus).mockResolvedValue(fixture());
    await userEvent.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Estimate")).toBeVisible();
  });

  it.each(["foreign", "malformed", "missing-action-id", "empty-action-id"])("does not display a %s response or revive previous data on a later transient failure", async kind => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    const malformed = fixture();
    if (kind === "missing-action-id") Reflect.deleteProperty(malformed.pendingActions[0]!, "id");
    if (kind === "empty-action-id") malformed.pendingActions[0]!.id = " ";
    vi.mocked(api.getProjectStatus).mockResolvedValue(kind === "foreign" ? fixture("project-b", "Foreign status")
      : kind === "malformed" ? { ...fixture(), pendingActions: [{ stageKey: "estimate_approval" }] } as ProjectStatusSummary : malformed);
    await act(async () => { await view.client.refetchQueries({ queryKey: key }); });
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Foreign status")).not.toBeInTheDocument();
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await userEvent.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
  });

  it.each(["account", "role", "session"])("hides the previous status and gates retained cache when the %s changes", async change => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    if (change === "account") auth.id = "client-b";
    if (change === "role") auth.role = "designer";
    if (change === "session") auth.session = "session-b";
    const nextKey = api.projectStatusKeys.detail("project-a", `${auth.id}:${auth.role}:${auth.session}`);
    view.client.setQueryData(nextKey, fixture("project-a", "Retained next status"));
    let resolve!: (value: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    view.change();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Retained next status")).not.toBeInTheDocument();
    await visible();
    expect(screen.queryByText("Retained next status")).not.toBeInTheDocument();
    await act(async () => resolve(fixture("project-a", "Estimate")));
    expect(await screen.findByText("Estimate")).toBeVisible();
  });

  it("ignores delayed reads from a previous project and aborts unused requests on unmount", async () => {
    const pending = new Map<string, { resolve: (value: ProjectStatusSummary) => void; signal?: AbortSignal }>();
    vi.mocked(api.getProjectStatus).mockImplementation((id, signal) => new Promise(resolve => { pending.set(id, { resolve, signal }); }));
    const view = mount(); await visible();
    view.change("project-b");
    expect(pending.get("project-a")!.signal!.aborted).toBe(true);
    await visible();
    await act(async () => pending.get("project-a")!.resolve(fixture("project-a", "Old project stage")));
    expect(screen.queryByText("Old project stage")).not.toBeInTheDocument();
    expect(screen.getByText("Loading status…")).toBeVisible();
    view.unmount();
    expect(pending.get("project-b")!.signal!.aborted).toBe(true);
    expect(observers.size).toBe(0);
  });

  it("deduplicates concurrent consumers sharing the status key", async () => {
    let resolve!: (value: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = mount(); view.change("project-a", true); await visible();
    expect(api.getProjectStatus).toHaveBeenCalledTimes(1);
    await act(async () => resolve(fixture()));
    expect(await screen.findAllByText("Estimate")).toHaveLength(2);
  });

  it.each(["permission", "authentication"])("does not fetch or disclose status after %s is lost", async kind => {
    const view = mount(); await visible();
    await screen.findByText("Estimate");
    if (kind === "permission") auth.permitted = false;
    else auth.authenticated = false;
    view.change();
    expect(screen.getByText("Status unavailable")).toBeVisible();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry status/ })).not.toBeInTheDocument();
    await focus();
    expect(api.getProjectStatus).toHaveBeenCalledTimes(1);
  });
});
