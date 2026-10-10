import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionCountsFixture } from "../execution/executionTestFixtures";
import { SiteManagerWorkspace } from "./SiteManagerWorkspace";
import { SiteManagerProjectPage } from "./SiteManagerProjectPage";
import { siteManagerReturnPath } from "./siteManagerPresentation";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "site-one", role: "site_manager" }, authorization: { role: "site_manager", permissions: ["procurement.site_completion.manage"] } }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
beforeEach(() => server.use(http.get("/api/v1/kpis/users/site-one", () => HttpResponse.json({ data: { score: 82, components: [] } }))));

describe("Site Manager home", () => {
  it("shows only one KPI and compact current assigned projects, with search and server pagination", async () => {
    const reads: URL[] = [];
    server.use(http.get("/api/v1/execution/projects", ({ request }) => {
      const url = new URL(request.url); reads.push(url);
      return HttpResponse.json({ data: { items: [{ id: url.searchParams.get("offset") === "25" ? "project-two" : "project-one", name: "Oak residence", status: "on_hold", counts: executionCountsFixture }], total: 31, limit: 25, offset: Number(url.searchParams.get("offset") || 0) } });
    }));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/home"]}><SiteManagerWorkspace /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "KPI overview" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Open project Oak residence" })).toHaveAttribute("href", "/projects/project-one/execution");
    expect(screen.getAllByRole("heading", { name: "KPI overview" })).toHaveLength(1);
    expect(screen.getByText("On Hold")).toBeVisible();
    expect(screen.queryByText("Ready for staged access")).not.toBeInTheDocument();
    expect(screen.queryByText("Site execution overview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete and send to Client" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Execution counts")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(reads.at(-1)?.searchParams.get("offset")).toBe("25"));
    await user.type(screen.getByRole("searchbox", { name: "Search assigned projects" }), "Oak");
    await waitFor(() => expect(reads.at(-1)?.searchParams.get("q")).toBe("Oak"));
    expect(reads.at(-1)?.searchParams.get("offset")).toBe("0");
    expect(reads.every(url => url.searchParams.get("projectScope") === "current")).toBe(true);
  });

  it("preserves the list search and page after opening a zero-work project and returning", async () => {
    server.use(http.get("/api/v1/execution/projects", () => HttpResponse.json({ data: { items: [{ id: "project-one", name: "Oak residence", status: "planning", counts: executionCountsFixture }], total: 30, limit: 25, offset: 25 } })),
      http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { project: { id: "project-one", name: "Oak residence", status: "planning", completionAuthority: "vendor_client" }, projectCounts: { ...executionCountsFixture, total: 0, open: 0 }, items: [], total: 0, limit: 25, offset: 0, counts: { ...executionCountsFixture, total: 0, open: 0 }, policy: null, canManagePolicy: false } })));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/home?q=Oak&offset=25"]}><Routes><Route path="/home" element={<SiteManagerWorkspace />} /><Route path="/projects/:projectId/execution" element={<SiteManagerProjectPage />} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("link", { name: "Open project Oak residence" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
    expect(screen.getByText("No issued vendor work for this project yet.")).toBeVisible();
    const back = screen.getByRole("link", { name: "Back to assigned projects" });
    expect(back).toHaveAttribute("href", "/home?q=Oak&offset=25");
    await user.click(back);
    expect(await screen.findByRole("searchbox", { name: "Search assigned projects" })).toHaveValue("Oak");
    expect(screen.getByText("26–26 of 30")).toBeVisible();
  });

  it("keeps empty and failed assigned-project reads distinct without hiding KPI", async () => {
    server.use(http.get("/api/v1/execution/projects", () => HttpResponse.json({ data: { items: [], total: 0, offset: 0, limit: 25 } })));
    const user = userEvent.setup(); renderWithQuery(<MemoryRouter><SiteManagerWorkspace /></MemoryRouter>);
    expect(await screen.findByText("You have no current assigned projects.")).toBeVisible();
    server.use(http.get("/api/v1/execution/projects", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Unavailable" } }, { status: 403 })));
    await user.click(screen.getByRole("button", { name: "Refresh projects" }));
    expect(await screen.findByText(/Your assigned projects are no longer available/)).toBeVisible();
    expect(screen.queryByText("You have no current assigned projects.")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Personal KPI score")).getByText("82")).toBeVisible();
  });
});

it.each(["https://example.com/home", "//example.com/home", "/home/../admin", "/home\\admin", "/projects/one/execution", "/home%2fadmin"])("rejects an unsafe list return path %s", path => expect(siteManagerReturnPath(path)).toBe("/home"));
