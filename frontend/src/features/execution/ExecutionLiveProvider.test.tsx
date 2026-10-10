import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { ExecutionLiveProvider, useExecutionConnection } from "./ExecutionLiveProvider";
import { runExecutionStream } from "./executionStream";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: {id: "site-one"}, authorization: authorizationFor("site_manager", ["execution.tracker.read"]) }) }));
vi.mock("./executionStream", () => ({ runExecutionStream: vi.fn() }));
afterEach(() => vi.useRealTimers());

function Connection() { return <p>{useExecutionConnection()}</p>; }

describe("execution workspace live refresh", () => {
  it("refreshes project reads and KPI after committed changes, then clears revoked project context", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    const keys = [["execution", "projects", {projectScope:"current"}], ["execution", "project", "one"], ["site-completion", "one"], ["project-workflow", "operational"], ["project-workflow", "project-status", "one"], ["designer", "kpi", "site-one"]];
    for (const key of keys) client.setQueryData(key, {version:1});
    const view = render(<QueryClientProvider client={client}><ExecutionLiveProvider><Connection /></ExecutionLiveProvider></QueryClientProvider>);
    const stream = vi.mocked(runExecutionStream).mock.calls.at(-1)![0];
    // Reset the initial reconnect invalidation before checking a committed event.
    for (const key of keys) client.setQueryData(key, {version:2});
    act(() => {stream.onStatus("live"); stream.onChange();});
    await act(async () => {await vi.advanceTimersByTimeAsync(100);});
    expect(screen.getByText("live")).toBeVisible();
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    act(() => {stream.onDenied(); stream.onStatus("denied");});
    for (const key of keys.slice(0,5)) expect(client.getQueryData(key)).toBeUndefined();
    expect(screen.getByText("denied")).toBeVisible();
    view.unmount();
    expect(stream.signal.aborted).toBe(true);
  });
});
