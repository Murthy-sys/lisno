import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transferableAbortController } from "node:util";
import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { projectReadKeys, useAssignedProject, useAssignedProjects } from "./projectReadQueries";

const auth = vi.hoisted(() => ({ user: { id: "procurement-one", role: "procurement" }, authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  auth.user = { id: "procurement-one", role: "procurement" };
  auth.authorization = authorizationFor("procurement", ["projects.list", "projects.read"]);
});
afterEach(() => { vi.unstubAllGlobals(); });

function Reads() {
  const details = useAssignedProject("project-one");
  const list = useAssignedProjects();
  return <><p>{details.project?.name ?? "No project details"}</p><p>{list.projects?.map((project) => project.name).join(", ") ?? "No assigned projects"}</p>{details.query.isError ? <p role="alert">{details.query.error.message}</p> : null}</>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const tree = () => <QueryClientProvider client={client}><Reads /></QueryClientProvider>;
  const view = render(tree());
  return { client, rerender: () => view.rerender(tree()) };
}
function reads(name: string, id = "project-one") {
  server.use(http.get("/api/v1/projects/project-one", () => HttpResponse.json({ data: { id, name } })), http.get("/api/v1/projects", () => HttpResponse.json({ data: { items: [{ id, name: `${name} list` }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false } } })));
}

describe("assigned project metadata reads", () => {
  it("never shares project/list results across distinct actors", async () => {
    reads("First actor project");
    const view = mount();
    expect(await screen.findByText("First actor project")).toBeVisible();
    expect(await screen.findByText("First actor project list")).toBeVisible();
    auth.user = { id: "procurement-two", role: "procurement" };
    reads("Second actor project");
    view.rerender();
    expect(screen.queryByText("First actor project")).not.toBeInTheDocument();
    expect(screen.queryByText("First actor project list")).not.toBeInTheDocument();
    expect(await screen.findByText("Second actor project")).toBeVisible();
    expect(await screen.findByText("Second actor project list")).toBeVisible();
  });

  it.each([403, 404])("drops retained details/list after access returns %s", async (status) => {
    reads("Assigned project");
    const { client } = mount();
    expect(await screen.findByText("Assigned project")).toBeVisible();
    server.use(http.get("/api/v1/projects/project-one", () => HttpResponse.json({ error: { code: "DENIED", message: "Access unavailable" } }, { status })), http.get("/api/v1/projects", () => HttpResponse.json({ error: { code: "DENIED", message: "Access unavailable" } }, { status })));
    await act(async () => { await client.invalidateQueries({ queryKey: projectReadKeys.all }); });
    expect(await screen.findByText("No project details")).toBeVisible();
    expect(screen.getByText("No assigned projects")).toBeVisible();
    expect(screen.queryByText("Assigned project")).not.toBeInTheDocument();
  });

  it("rejects a mismatched detail identity without showing another project's fields", async () => {
    reads("Unrelated project", "project-two");
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("The project response did not match this project");
    expect(screen.queryByText("Unrelated project", { exact: true })).not.toBeInTheDocument();
  });

  it("hides previously loaded metadata when read permissions are removed", async () => {
    reads("Assigned project");
    const view = mount();
    expect(await screen.findByText("Assigned project")).toBeVisible();
    auth.authorization = authorizationFor("procurement", []);
    view.rerender();
    expect(screen.queryByText("Assigned project")).not.toBeInTheDocument();
    expect(screen.getByText("No project details")).toBeVisible();
    expect(screen.getByText("No assigned projects")).toBeVisible();
  });
});
