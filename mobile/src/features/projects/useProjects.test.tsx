import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";

import type { Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useProjects } from "./useProjects";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const runtimeMock = jest.mocked(useConfiguredRuntime);
type ProjectsQuery = ReturnType<typeof useProjects>;

function session(role: Role = "super_admin", userId = "user-a"): AuthenticatedSession {
  return {
    user: { id: userId, name: "Example", email: "example@example.test", role },
    authorization: { role, policyVersion: "test", permissions: ["projects.list", "projects.client_summary.read"] }
  };
}

function page(ids: readonly string[], total = ids.length, offset = 0, hasMore = false) {
  return {
    items: ids.map((id) => ({ id, name: id, status: "active" })),
    pagination: { total, offset, limit: 30, hasMore }
  };
}

function runtime(get: jest.Mock, environmentId = "local-development", status = "ready") {
  runtimeMock.mockReturnValue({
    environment: { environment: { id: environmentId }, status },
    runtime: { api: { authenticated: { get } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
}

function Harness({ viewer, onValue }: { readonly viewer: AuthenticatedSession; readonly onValue: (value: ProjectsQuery) => void }) {
  onValue(useProjects(viewer));
  return null;
}

async function mount(viewer = session()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let state!: ProjectsQuery;
  const element = (nextViewer: AuthenticatedSession) => (
    <QueryClientProvider client={client}>
      <Harness viewer={nextViewer} onValue={(value) => { state = value; }} />
    </QueryClientProvider>
  );
  const view = await render(element(viewer));
  return { client, view, state: () => state, rerender: (nextViewer: AuthenticatedSession) => view.rerender(element(nextViewer)),
    dispose: async () => { await view.unmount(); client.clear(); } };
}

describe("useProjects", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads two offset pages and keeps the server total without unsupported status parameters", async () => {
    const firstIds = Array.from({ length: 30 }, (_, index) => `project-${index}`);
    const get = jest.fn().mockResolvedValueOnce(page(firstIds, 32, 0, true)).mockResolvedValueOnce(page(["project-30", "project-31"], 32, 30));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().isSuccess).toBe(true));
    expect(mounted.state().hasNextPage).toBe(true);
    expect(mounted.state().data?.pages[0]?.pagination.total).toBe(32);
    await act(async () => { await mounted.state().fetchNextPage(); });
    await waitFor(() => expect(mounted.state().data?.pages).toHaveLength(2));
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/admin/projects?limit=30&offset=0", "/admin/projects?limit=30&offset=30"]);
    expect(get.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(mounted.state().data?.pageParams).toEqual([0, 30]);
    expect(mounted.state().hasNextPage).toBe(false);
    await mounted.dispose();
  });

  it.each([
    ["admin", "/admin/projects"], ["client", "/client/project-summaries"], ["designer", "/projects"]
  ] as const)("uses the authorized %s role endpoint", async (role, endpoint) => {
    const get = jest.fn().mockResolvedValue(page([`record-${role}`]));
    runtime(get);
    const mounted = await mount(session(role));
    await waitFor(() => expect(mounted.state().isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(`${endpoint}?limit=30&offset=0`, expect.objectContaining({ signal: expect.anything() }));
    expect(mounted.client.getQueryCache().getAll()[0]?.queryKey).toEqual(["local-development", "user-a", "projects", "reference-list", role, endpoint]);
    await mounted.dispose();
  });

  it("isolates users, roles and environments so a changed scope never receives another scope's rows", async () => {
    const get = jest.fn().mockResolvedValue(page(["first-owner"]));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().data?.pages[0]?.items[0]?.id).toBe("first-owner"));

    let release!: (value: unknown) => void;
    get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await mounted.rerender(session("super_admin", "user-b"));
    expect(mounted.state().data).toBeUndefined();
    await act(async () => release(page(["second-owner"])));
    await waitFor(() => expect(mounted.state().data?.pages[0]?.items[0]?.id).toBe("second-owner"));

    get.mockResolvedValueOnce(page(["client-scope"]));
    await mounted.rerender(session("client", "user-b"));
    await waitFor(() => expect(mounted.state().data?.pages[0]?.items[0]?.id).toBe("client-scope"));
    get.mockResolvedValueOnce(page(["remote-scope"]));
    runtime(get, "remote-development");
    await mounted.rerender(session("client", "user-b"));
    await waitFor(() => expect(mounted.state().data?.pages[0]?.items[0]?.id).toBe("remote-scope"));
    expect(mounted.client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      ["local-development", "user-a", "projects", "reference-list", "super_admin", "/admin/projects"],
      ["local-development", "user-b", "projects", "reference-list", "super_admin", "/admin/projects"],
      ["local-development", "user-b", "projects", "reference-list", "client", "/client/project-summaries"],
      ["remote-development", "user-b", "projects", "reference-list", "client", "/client/project-summaries"]
    ]);
    await mounted.dispose();
  });

  it("waits for the configured environment before requesting projects", async () => {
    const get = jest.fn().mockResolvedValue(page([]));
    runtime(get, "local-development", "switching");
    const mounted = await mount();
    expect(get).not.toHaveBeenCalled();
    runtime(get);
    await mounted.rerender(session());
    await waitFor(() => expect(mounted.state().isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(mounted.state().hasNextPage).toBe(false);
    await mounted.dispose();
  });

  it("retains the loaded page after a paging failure and retries the same offset", async () => {
    const error = new ApiError(503, "UNAVAILABLE", "Service unavailable");
    const get = jest.fn().mockResolvedValueOnce(page(["first"], 31, 0, true)).mockRejectedValueOnce(error).mockResolvedValueOnce(page(["last"], 31, 30));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().isSuccess).toBe(true));
    await act(async () => { await mounted.state().fetchNextPage(); });
    await waitFor(() => expect(mounted.state().isFetchNextPageError).toBe(true));
    expect(mounted.state().data?.pages).toHaveLength(1);
    expect(mounted.state().error).toBe(error);
    await act(async () => { await mounted.state().fetchNextPage(); });
    await waitFor(() => expect(mounted.state().data?.pages).toHaveLength(2));
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/admin/projects?limit=30&offset=0", "/admin/projects?limit=30&offset=30", "/admin/projects?limit=30&offset=30"]);
    await mounted.dispose();
  });

  it("exposes denied and malformed responses instead of inventing empty success", async () => {
    const denied = new ApiError(403, "FORBIDDEN", "Forbidden");
    const get = jest.fn().mockRejectedValueOnce(denied).mockResolvedValueOnce(page([], 5, 0, true));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().error).toBe(denied));
    expect(mounted.state().data).toBeUndefined();
    await act(async () => { await mounted.state().refetch(); });
    await waitFor(() => expect(mounted.state().error).toBeInstanceOf(ApiProtocolError));
    expect(mounted.state().data).toBeUndefined();
    await mounted.dispose();
  });

  it("rejects a repeated server offset instead of creating an endless load-more loop", async () => {
    const get = jest.fn().mockResolvedValue(page(["first"], 31, 0, true));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().isSuccess).toBe(true));
    await act(async () => { await mounted.state().fetchNextPage(); });
    await waitFor(() => expect(mounted.state().error).toBeInstanceOf(ApiProtocolError));
    expect(mounted.state().data?.pages).toHaveLength(1);
    expect(mounted.state().isFetchNextPageError).toBe(true);
    await mounted.dispose();
  });

  it("forwards query cancellation to the authenticated request", async () => {
    let signal: AbortSignal | undefined;
    const get = jest.fn((_path: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);
    await mounted.dispose();
    expect(signal?.aborted).toBe(true);
  });
});
