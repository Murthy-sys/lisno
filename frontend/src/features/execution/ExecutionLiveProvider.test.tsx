import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transferableAbortController } from "node:util";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { AuthorizationSnapshot, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { ExecutionLiveProvider, useExecutionConnection } from "./ExecutionLiveProvider";
import { runExecutionStream } from "./executionStream";
import { ProjectExecutionPage } from "./ExecutionWorkspace";
import { executionPageFixture } from "./executionTestFixtures";
import { projectReadKeys } from "../projects/projectReadQueries";
import { procurementKeys } from "../procurement/procurementApi";

const auth = vi.hoisted(() => ({ status: "authenticated", user: { id: "site-one", role: "site_manager" as Role }, authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("./executionStream", () => ({ runExecutionStream: vi.fn() }));
beforeEach(() => {
  auth.user = { id: "site-one", role: "site_manager" };
  auth.authorization = authorizationFor("site_manager", ["execution.tracker.read"]);
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function Connection() { return <p>{useExecutionConnection()}</p>; }

describe("execution workspace live refresh", () => {
  it("refreshes project reads and KPI after committed changes, then clears revoked project context", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    const keys = [["execution", "projects", {projectScope:"current"}], ["execution", "project", "one"], ["site-completion", "one"], ["project-workflow", "operational"], ["project-workflow", "project-status", "one"], ["designer", "kpi", "site-one"]];
    const metadataKeys = [projectReadKeys.list("site-one", "site_manager"), projectReadKeys.detail("one", "site-one", "site_manager")];
    const unrelatedKey = projectReadKeys.detail("two", "manager-two", "program_manager");
    client.setQueryData(unrelatedKey, { name: "Unrelated assigned project" });
    client.setQueryData(procurementKeys.projects, { name: "Independent preparation" });
    for (const key of keys) client.setQueryData(key, {version:1});
    const view = render(<QueryClientProvider client={client}><ExecutionLiveProvider><Connection /></ExecutionLiveProvider></QueryClientProvider>);
    const stream = vi.mocked(runExecutionStream).mock.calls.at(-1)![0];
    // Reset the initial reconnect invalidation before checking a committed event.
    for (const key of [...keys, ...metadataKeys]) client.setQueryData(key, {version:2});
    act(() => {stream.onStatus("live"); stream.onChange();});
    await act(async () => {await vi.advanceTimersByTimeAsync(100);});
    expect(screen.getByText("live")).toBeVisible();
    for (const key of [...keys, ...metadataKeys]) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    await act(async () => {stream.onDenied(); stream.onStatus("denied");});
    for (const key of keys.slice(0,5)) expect(client.getQueryData(key)).toBeUndefined();
    for (const key of metadataKeys) expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(unrelatedKey)).toEqual({ name: "Unrelated assigned project" });
    expect(client.getQueryData(procurementKeys.projects)).toEqual({ name: "Independent preparation" });
    expect(screen.getByText("denied")).toBeVisible();
    view.unmount();
    expect(stream.signal.aborted).toBe(true);
  });

  it("removes mounted Program Manager details and pending progress when the stream reports assignment denial", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    auth.user = { id: "manager-one", role: "program_manager" };
    auth.authorization = authorizationFor("program_manager", ["execution.tracker.read", "projects.read", "projects.design_workflow.read"]);
    let revoked = false;
    let projectReads = 0;
    const denied = () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "Project assignment removed." } }, { status: 404 });
    server.use(
      http.get("/api/v1/projects/project-one", () => {
        projectReads += 1;
        return revoked ? denied() : HttpResponse.json({ data: { id: "project-one", name: "Oak residence", clientName: "Oak client", location: "Pune", status: "planning", plannedStartAt: "", plannedEndAt: "", floors: [] } });
      }),
      http.get("/api/v1/projects/project-one/design-workflow", () => revoked ? denied() : HttpResponse.json({ data: { projectId: "project-one", projectName: "Oak residence", serverNow: "2026-10-13T09:00:00Z", estimateApprovalStatus: "awaiting_approval", floors: [], projectStages: [] } })),
      http.get("/api/v1/projects/project-one/execution", () => revoked ? denied() : HttpResponse.json({ data: executionPageFixture([]) }))
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
    client.setQueryData(procurementKeys.projects, { name: "Independent preparation" });
    render(<QueryClientProvider client={client}><MemoryRouter><ExecutionLiveProvider><ProjectExecutionPage projectId="project-one" /></ExecutionLiveProvider></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Oak client");
    expect(await screen.findByText("Estimate approval is pending. Project progress is available for review.")).toBeVisible();
    const readsBeforeRevocation = projectReads;
    const stream = vi.mocked(runExecutionStream).mock.calls.at(-1)![0];
    revoked = true;
    await act(async () => { stream.onStatus("denied"); stream.onDenied(); });
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Oak residence" })).not.toBeInTheDocument());
    expect((await screen.findAllByText("Project assignment removed.")).every((element) => element.isConnected)).toBe(true);
    expect(projectReads).toBeGreaterThan(readsBeforeRevocation);
    expect(screen.queryByRole("region", { name: "Project details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Oak client")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimate approval is pending. Project progress is available for review.")).not.toBeInTheDocument();
    expect(client.getQueryData(procurementKeys.projects)).toEqual({ name: "Independent preparation" });
  });
});
