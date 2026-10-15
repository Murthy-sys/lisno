import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { uniqueProjects } from "../projects/projectsModel";
import { useProcurementAssignedProjects } from "./useProcurementAssignedProjects";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

function session(userId = "procurement-a", permissions: AuthenticatedSession["authorization"]["permissions"] = ["procurement.workspace.read", "projects.list"]): AuthenticatedSession {
  return { user: { id: userId, name: "Procurement", email: "qa@example.test", role: "procurement" },
    authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } };
}
function page(ids: string[], total = ids.length, offset = 0, hasMore = false) {
  return { items: ids.map((id) => ({ id, name: id, status: "active" })), pagination: { total, offset, limit: 30, hasMore } };
}
function runtime(get: jest.Mock, environmentId = "qa") {
  jest.mocked(useConfiguredRuntime).mockReturnValue({
    environment: { environment: { id: environmentId }, status: "ready" }, runtime: { api: { authenticated: { get } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
}
type AssignedRead = ReturnType<typeof useProcurementAssignedProjects>;
async function mount(viewer = session(), enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let state!: AssignedRead;
  function Harness({ user, active }: { user: AuthenticatedSession; active: boolean }) {
    state = useProcurementAssignedProjects(user, active);
    return null;
  }
  const element = (user: AuthenticatedSession, active: boolean) => <QueryClientProvider client={client}><Harness user={user} active={active} /></QueryClientProvider>;
  const view = await render(element(viewer, enabled));
  return { client, state: () => state, rerender: (user: AuthenticatedSession, active = enabled) => view.rerender(element(user, active)),
    dispose: async () => { await view.unmount(); client.clear(); } };
}

describe("Procurement assigned project reads", () => {
  beforeEach(() => jest.clearAllMocks());

  it("enforces the independently granted project list operation", async () => {
    const get = jest.fn().mockResolvedValue(page([]));
    runtime(get);
    const mounted = await mount(session("procurement-a", ["procurement.workspace.read"]));
    expect(mounted.state().canRead).toBe(false);
    expect(get).not.toHaveBeenCalled();
    await mounted.rerender(session(), false);
    expect(get).not.toHaveBeenCalled();
    await mounted.rerender(session(), true);
    await waitFor(() => expect(mounted.state().query.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/projects?limit=30&offset=0", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await mounted.dispose();
  });

  it("retains scoped cache identity and isolates different authenticated owners", async () => {
    const get = jest.fn().mockResolvedValueOnce(page(["first-project"])).mockResolvedValueOnce(page(["second-project"]));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().query.data?.pages[0]?.items[0]?.id).toBe("first-project"));
    await mounted.rerender(session("procurement-b"));
    await waitFor(() => expect(mounted.state().query.data?.pages[0]?.items[0]?.id).toBe("second-project"));
    expect(mounted.client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      ["qa", "procurement-a", "projects", "reference-list", "procurement", "/projects"],
      ["qa", "procurement-b", "projects", "reference-list", "procurement", "/projects"]
    ]);
    await mounted.dispose();
  });

  it("paginates and deduplicates overlapping stable IDs without calling them a complete count", async () => {
    const get = jest.fn().mockResolvedValueOnce(page(["first", "second"], 3, 0, true))
      .mockResolvedValueOnce(page(["second", "third"], 3, 30));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().query.isSuccess).toBe(true));
    expect(mounted.state().query.hasNextPage).toBe(true);
    await act(async () => { await mounted.state().query.fetchNextPage(); });
    await waitFor(() => expect(uniqueProjects(mounted.state().query.data!.pages).map((project) => project.id)).toEqual(["first", "second", "third"]));
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/projects?limit=30&offset=0", "/projects?limit=30&offset=30"]);
    expect(mounted.state().query.hasNextPage).toBe(false);
    await mounted.dispose();
  });

  it("rejects a repeated response offset and preserves loaded pages for retry", async () => {
    const get = jest.fn().mockResolvedValue(page(["first"], 31, 0, true));
    runtime(get);
    const mounted = await mount();
    await waitFor(() => expect(mounted.state().query.isSuccess).toBe(true));
    expect(mounted.state().query.hasNextPage).toBe(true);
    await act(async () => { await mounted.state().query.fetchNextPage(); });
    await waitFor(() => expect(mounted.state().query.error).toBeInstanceOf(ApiProtocolError));
    expect(mounted.state().query.data?.pages).toHaveLength(1);
    expect(mounted.state().query.isFetchNextPageError).toBe(true);
    await mounted.dispose();
  });
});
