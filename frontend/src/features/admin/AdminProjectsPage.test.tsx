import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { AdminProjectSummary } from "../../api/types";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { adminProjectKeys, adminProjectsPath, estimatorOptionsPath } from "./adminProjectsApi";

const admin = {
  id: "admin-1",
  name: "Meera Admin",
  email: "meera@lisno.example",
  role: "admin" as const
};

const superAdmin = {
  id: "super-admin-1",
  name: "Sanjay Super Admin",
  email: "sanjay@lisno.example",
  role: "super_admin" as const
};

const project: AdminProjectSummary = {
  id: "project/one",
  name: "Asha home",
  status: "planning" as const,
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: { id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example" },
  lead: {
    id: "lead-1",
    stage: "new_lead" as const,
    nextAction: "Schedule site visit",
    nextActionAt: "2026-08-25T05:00:00.000Z"
  },
  estimate: null,
  createdAt: "2026-08-23T10:00:00.000Z"
};

function installSession() {
  tokenStorage.set("admin-token");
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: admin })),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          role: "admin",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: [
            "identity.self.read",
            "identity.authorization.read",
            "projects.list",
            "projects.read",
            "projects.initiate",
            "organization.estimators.read",
            "design.plan_assignment.manage",
            "access_request.review.read"
          ]
        }
      })
    )
  );
}

function installSuperAdminSession() {
  tokenStorage.set("super-admin-token");
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: superAdmin })),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          role: "super_admin",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: [
            "identity.self.read",
            "identity.authorization.read",
            "projects.list",
            "projects.read",
            "projects.initiate",
            "design.plan_assignment.manage"
          ]
        }
      })
    )
  );
}

function page(
  items: Array<typeof project>,
  offset = 0,
  total = items.length,
  hasMore = false
) {
  return {
    data: {
      items,
      pagination: { limit: 20, offset, total, hasMore }
    }
  };
}

function requiredLabel(name: string) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`);
}

describe("Admin project API paths", () => {
  it("builds the exact paginated project and normalized estimator URLs", () => {
    expect(adminProjectsPath({ limit: 20, offset: 40 })).toBe(
      "/admin/projects?limit=20&offset=40"
    );
    expect(estimatorOptionsPath("asha rao", { limit: 20, offset: 0 })).toBe(
      "/admin/estimators?search=asha+rao&limit=20&offset=0"
    );
  });
  it("encodes literal project search and includes each server-side control in the query identity", () => {
    const input = { limit: 20, offset: 40, status: "active" as const, search: "  Client [A]. Pune  ", sort: "name_desc" as const };
    expect(adminProjectsPath(input)).toBe("/admin/projects?limit=20&offset=40&status=active&search=Client+%5BA%5D.+Pune&sort=name_desc");
    expect(adminProjectsPath({ limit: 20, offset: 0, search: "  " })).toBe("/admin/projects?limit=20&offset=0");
    for (const change of [{ status: "planning" as const }, { search: "Mumbai" }, { sort: "name_asc" as const }, { offset: 0 }]) {
      expect(adminProjectKeys.page({ ...input, ...change })).not.toEqual(adminProjectKeys.page(input));
    }
  });
});

const VIEW_STORAGE_KEY = "lisno.adminProjects.view";

describe("AdminProjectsPage", () => {
  beforeEach(() => {
    window.localStorage.removeItem(VIEW_STORAGE_KEY);
  });

  it("keeps quick view tied to the selected ID, preserves the list route, and never fetches detail", async () => {
    installSession();
    let detailGets = 0;
    const second = { ...project, id: "project-second", name: project.name, client: { ...project.client, name: "Different client" } };
    server.use(
      http.get("/api/v1/admin/projects", () => HttpResponse.json(page([project, second]))),
      http.get("/api/v1/admin/projects/:id", () => { detailGets += 1; return HttpResponse.json({ error: { message: "Not permitted" } }, { status: 403 }); })
    );
    const user = userEvent.setup();
    const { router } = renderApp(["/admin/projects"]);
    await user.click(await screen.findByRole("button", { name: "List view" }));
    const triggers = await screen.findAllByRole("button", { name: "Quick view Asha home" });
    await user.click(triggers[1]);
    const panel = screen.getByRole("dialog", { name: "Asha home" });
    expect(within(panel).getByText("Different client")).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Open project workspace" })).toHaveAttribute("href", "/admin/projects/project-second");
    expect(router.state.location.pathname).toBe("/admin/projects");
    expect(detailGets).toBe(0);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(triggers[1]).toHaveFocus());
    await user.click(triggers[0]);
    expect(within(screen.getByRole("dialog", { name: "Asha home" })).getByText("Asha Shah")).toBeVisible();
    expect(within(screen.getByRole("dialog", { name: "Asha home" })).queryByText("Different client")).not.toBeInTheDocument();
    expect(detailGets).toBe(0);
  });

  it("offers only the authorized list summary when full project read is unavailable", async () => {
    installSession();
    server.use(
      http.get("/api/v1/auth/authorization", () => HttpResponse.json({ data: { role: "admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["identity.self.read", "identity.authorization.read", "projects.list"] } })),
      http.get("/api/v1/admin/projects", () => HttpResponse.json(page([project])))
    );
    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    await user.click(await screen.findByRole("button", { name: "List view" }));
    await user.click(await screen.findByRole("button", { name: "Quick view Asha home" }));
    expect(within(screen.getByRole("dialog", { name: "Asha home" })).queryByRole("link", { name: "Open project workspace" })).not.toBeInTheDocument();
  });

  it("renders the global Super Admin collection and offers project initiation", async () => {
    installSuperAdminSession();
    server.use(
      http.get("/api/v1/admin/projects", () => HttpResponse.json(page([project])))
    );

    renderApp(["/admin/projects"]);

    expect(await screen.findByRole("heading", { name: "All Projects" })).toBeVisible();
    expect(screen.getByText("All projects across the organization.")).toBeVisible();
    const list = await screen.findByRole("list", { name: "All Projects" });
    expect(list).toBeVisible();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("article", { name: "Asha home" })).toBeVisible();
    expect(within(list).getByRole("link", { name: "View details for Asha home" })).toHaveAttribute(
      "href",
      "/admin/projects/project%2Fone"
    );
    expect(screen.getByRole("navigation", { name: "All Projects pages" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Initiate project" })).toBeVisible();
  });

  it.each([
    ["Admin", installSession, "My Projects"],
    ["Super Admin", installSuperAdminSession, "All Projects"]
  ] as const)(
    "shows Estimation Approval and Designer assignment for %s on a legacy approved estimate",
    async (_role, install, collectionName) => {
      install();
      const legacyApprovedProject: AdminProjectSummary = {
        ...project,
        lead: {
          ...project.lead!,
          stage: "won",
          nextAction: "project kickoff"
        },
        estimate: {
          id: "estimate-approved",
          leadId: "lead-1",
          projectId: "project/one",
          resolvedProjectId: "project/one",
          projectLinkSource: "estimate_and_lead",
          version: 4,
          status: "client_approved",
          subtotal: 236190,
          gst: 42514,
          total: 278704,
          clientDecisionAt: "2026-08-24T09:00:00.000Z",
          clientDecisionSource: "client_portal",
          approvedBaseline: {
            estimateVersion: 4,
            reviewRoundId: "round-approved",
            subtotal: 236190,
            gst: 42514,
            total: 278704,
            decisionAt: "2026-08-24T09:00:00.000Z",
            decisionSource: "client_portal"
          }
        }
      };
      server.use(
        http.get("/api/v1/admin/projects", () =>
          HttpResponse.json(page([legacyApprovedProject]))
        )
      );

      renderApp(["/admin/projects"]);

      const list = await screen.findByRole("list", { name: collectionName });
      expect(within(list).getByText("Estimation Approval")).toBeVisible();
      expect(within(list).queryByText("Assign Designer to upload design")).not.toBeInTheDocument();
      expect(within(list).getByText("Client-approved value (incl. GST)")).toBeVisible();
      expect(within(list).getByText(/₹2,78,704/)).toBeVisible();
      expect(within(list).queryByText("project kickoff")).not.toBeInTheDocument();
      expect(within(list).queryByText("Planning")).not.toBeInTheDocument();
      const projectLink = within(list).getByRole("link", { name: "View details for Asha home" });
      const assignmentLink = within(list).getByRole("link", { name: "Assign Designer" });
      expect(assignmentLink).toHaveAttribute(
        "href",
        "/admin/projects/project%2Fone#design-assignment-title"
      );
      expect(projectLink.contains(assignmentLink)).toBe(false);
    }
  );

  it("renders loading, retryable error, and empty states", async () => {
    installSession();
    let requests = 0;
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    server.use(
      http.get("/api/v1/admin/projects", async () => {
        requests += 1;
        if (requests === 1) {
          await first;
          return HttpResponse.json(
            { error: { code: "FAILED", message: "Projects unavailable." } },
            { status: 503 }
          );
        }
        return HttpResponse.json(page([]));
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    await screen.findByRole("heading", { name: "My Projects" });
    expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
      "Loading projects"
    );
    expect(screen.getByRole("group", { name: "Project status" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Sort projects" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Filter" })).toBeVisible();

    resolveFirst();
    expect(await screen.findByText("Projects unavailable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "All" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No projects initiated yet.")).toBeVisible();
    expect(screen.getByRole("group", { name: "Project layout" })).toBeVisible();
    expect(document.querySelectorAll(".admin-projects__status-count")).toHaveLength(0);
  });

  it("submits status, sorting and literal search server-side, resets pagination and recovers from filtered emptiness", async () => {
    installSession();
    const requests: URLSearchParams[] = [];
    server.use(http.get("/api/v1/admin/projects", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const offset = Number(params.get("offset"));
      const searching = !!params.get("search");
      return HttpResponse.json({ data: { ...page(searching ? [] : [{ ...project, name: `Project ${offset}` }], offset, searching ? 0 : 30, !searching && offset === 0).data,
        statusCounts: searching ? { all: 0, planning: 0, active: 0, on_hold: 0, completed: 0 } : { all: 30, planning: 19, active: 7, on_hold: 3, completed: 1 }
      } });
    }));
    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    expect(await screen.findByRole("button", { name: "All 30" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Project 20");
    await user.click(screen.getByRole("button", { name: "Active 7" }));
    await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("active"));
    expect(requests.at(-1)?.get("offset")).toBe("0");
    expect(await screen.findByRole("button", { name: "Active 7" })).toHaveAttribute("aria-pressed", "true");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort projects" }), "name_asc");
    await waitFor(() => expect(requests.at(-1)?.get("sort")).toBe("name_asc"));
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const search = screen.getByRole("searchbox", { name: "Search project, client or city" });
    expect(search).toHaveAttribute("maxlength", "120");
    const beforeTyping = requests.length;
    fireEvent.change(search, { target: { value: "  North [A].  " } });
    expect(requests).toHaveLength(beforeTyping);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("No projects match these filters.");
    expect(requests.at(-1)?.get("search")).toBe("North [A].");
    expect(requests.at(-1)?.get("status")).toBe("active");
    expect(requests.at(-1)?.get("offset")).toBe("0");
    expect(screen.getByRole("button", { name: "Active 0" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Filter (1)" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await screen.findByText("Project 0");
    expect(requests.at(-1)?.has("status")).toBe(false);
    expect(requests.at(-1)?.has("search")).toBe(false);
    expect(search).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Sort projects" })).toHaveValue("name_asc");
  });

  it("marks previous filtered results busy, hides stale counts and disables quick view until the response arrives", async () => {
    installSession();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/admin/projects", async ({ request }) => {
      const active = new URL(request.url).searchParams.get("status") === "active";
      if (active) await waiting;
      return HttpResponse.json({ data: { ...page([{ ...project, name: active ? "Active result" : project.name }], 0, 22, true).data,
        statusCounts: { all: 22, planning: 20, active: 2, on_hold: 0, completed: 0 }
      } });
    }));
    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    await screen.findByRole("article", { name: project.name });
    await user.click(screen.getByRole("button", { name: "List view" }));
    await user.click(screen.getByRole("button", { name: "Active 2" }));
    expect(await screen.findByText("Updating projects… Previous results remain visible.")).toBeVisible();
    expect(screen.getByRole("list", { name: "My Projects" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Quick view Asha home" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(document.querySelectorAll(".admin-projects__status-count")).toHaveLength(0);
    release();
    expect(await screen.findByRole("button", { name: "Quick view Active result" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Active 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Updating projects… Previous results remain visible.")).not.toBeInTheDocument();
  });

  it("renders populated nullable handoff data and exact encoded detail links", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects", () =>
        HttpResponse.json(
          page([
            project,
            {
              ...project,
              id: "project-two",
              name: "Legacy project",
              estimator: null,
              lead: null,
              estimate: {
                id: "estimate-2",
                leadId: "lead-2",
                projectId: "project-two",
                resolvedProjectId: "project-two",
                projectLinkSource: "estimate",
                version: 1,
                status: "draft",
                subtotal: 975000,
                gst: 0,
                total: 975000,
                clientDecisionAt: null,
                clientDecisionSource: null,
                approvedBaseline: null
              }
            }
          ])
        )
      )
    );

    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    expect(await screen.findByRole("heading", { name: "My Projects" })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "List view" }));
    const list = await screen.findByRole("list", { name: "My Projects" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(within(list).getByRole("link", { name: "View details for Asha home" })).toHaveAttribute(
      "href",
      "/admin/projects/project%2Fone"
    );
    expect(within(list).getAllByText("3BHK · Pune")).toHaveLength(2);
    expect(within(list).getAllByText("View project")).toHaveLength(2);
    expect(within(list).getByText("No estimate yet")).toBeVisible();
    expect(within(list).getAllByText("Unassigned handoff")).toHaveLength(2);
    expect(within(list).getByText(/₹9,75,000/)).toBeVisible();
    expect(within(list).getByText("Schedule site visit")).toBeVisible();
  });

  it("paginates while retaining the current page as busy", async () => {
    installSession();
    let releaseSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    server.use(
      http.get("/api/v1/admin/projects", async ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        if (offset === 20) await second;
        return HttpResponse.json(
          page(
            [{ ...project, id: `project-${offset}`, name: `Project ${offset}` }],
            offset,
            21,
            offset === 0
          )
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/projects"]);
    const list = await screen.findByRole("list", { name: "My Projects" });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "true"));
    releaseSecond();
    expect(await screen.findByText("Project 20")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("Project 0")).toBeVisible();
  });

  it("opens initiation and navigates to the created detail on success", async () => {
    installSession();
    let body: unknown;
    server.use(
      http.get("/api/v1/admin/projects", () => HttpResponse.json(page([]))),
      http.get("/api/v1/admin/estimators", () => HttpResponse.json({ data: {
        items: [{ id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example", title: null }],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
      } })),
      http.post("/api/v1/admin/projects", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...project, id: "project-created" } }, { status: 201 });
      }),
      http.get("/api/v1/admin/projects/project-created", () =>
        HttpResponse.json({ data: { ...project, id: "project-created" } })
      )
    );

    const user = userEvent.setup();
    const { router } = renderApp(["/admin/projects"]);
    await user.click(await screen.findByRole("button", { name: "Initiate project" }));
    const dialog = screen.getByRole("dialog", { name: "Initiate project" });
    for (const [label, value] of [
      ["Client name", "Asha Shah"],
      ["Client email", "asha@example.com"],
      ["Mobile", "+91 90000 00000"],
      ["Project / property name", "Asha home"],
      ["Location", "Pune"],
      ["Property type", "3BHK"],
      ["Minimum budget", "800000"],
      ["Maximum budget", "1200000"],
      ["Next action", "Schedule site visit"],
      ["Next action date", "2026-08-25T10:30"]
    ] as const) {
      fireEvent.change(within(dialog).getByLabelText(requiredLabel(label)), { target: { value } });
    }
    const estimatorInput = within(dialog).getByRole("combobox", { name: "Sales" });
    await user.click(estimatorInput);
    await within(dialog).findByRole("option", { name: /Ravi Estimator/ });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Initiate project" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Initiate project" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/projects/project-created"));
    expect(body).not.toHaveProperty("source");
  });
  describe("grid view", () => {
    const approvedEstimate = (
      id: string,
      overrides: Partial<NonNullable<AdminProjectSummary["estimate"]>> = {}
    ): NonNullable<AdminProjectSummary["estimate"]> => ({
      id: `estimate-${id}`,
      leadId: "lead-1",
      projectId: id,
      resolvedProjectId: id,
      projectLinkSource: "estimate_and_lead",
      version: 3,
      status: "client_approved",
      subtotal: 254237,
      gst: 45763,
      total: 300000,
      clientDecisionAt: "2026-08-24T09:00:00.000Z",
      clientDecisionSource: "client_portal",
      approvedBaseline: {
        estimateVersion: 3,
        reviewRoundId: "round-1",
        subtotal: 236190,
        gst: 42514,
        total: 278704,
        decisionAt: "2026-08-24T09:00:00.000Z",
        decisionSource: "client_portal"
      },
      designPlanStatus: "assigned",
      designPlanDesigner: { id: "designer-1", name: "Divya Kapoor", email: "divya@lisno.example" },
      ...overrides
    });

    const approvedProject: AdminProjectSummary = {
      ...project,
      id: "project-approved",
      name: "Approved villa",
      status: "active",
      location: "Mumbai",
      client: { ...project.client, name: "Kiran Mehta" },
      propertyType: "Villa",
      estimate: approvedEstimate("project-approved")
    };
    const draftProject: AdminProjectSummary = {
      ...project,
      id: "project-draft",
      name: "Draft flat",
      status: "on_hold",
      location: "Nashik",
      propertyType: null,
      estimator: null,
      lead: null,
      estimate: {
        ...approvedEstimate("project-draft"),
        status: "draft",
        subtotal: 975000,
        gst: 0,
        total: 975000,
        clientDecisionAt: null,
        clientDecisionSource: null,
        approvedBaseline: null,
        designPlanStatus: null,
        designPlanDesigner: null
      }
    };
    const missingBaselineProject: AdminProjectSummary = {
      ...project,
      id: "project-missing-baseline",
      name: "Missing baseline",
      estimate: approvedEstimate("project-missing-baseline", { approvedBaseline: null })
    };
    const zeroBaselineProject: AdminProjectSummary = {
      ...approvedProject, id: "project-zero", name: "Zero baseline",
      estimate: approvedEstimate("project-zero", { approvedBaseline: { ...approvedProject.estimate!.approvedBaseline!, total: 0, subtotal: 0, gst: 0 } })
    };
    const amountCases = [
      [approvedProject.name, "₹2,78,704", "Client-approved value (incl. GST)"],
      [draftProject.name, "Draft · ₹9,75,000", "Estimate"],
      [project.name, "No estimate yet", "Estimate"],
      [missingBaselineProject.name, "Approved baseline unavailable", "Client-approved value (incl. GST)"],
      [zeroBaselineProject.name, "₹0", "Client-approved value (incl. GST)"]
    ] as const;

    function amountTextIn(article: HTMLElement, label: string) {
      const term = within(article).getByText(label, { selector: "dt" });
      return term.nextElementSibling?.textContent;
    }

    it("defaults to the grid, exposes pressed state, and persists the choice across remounts", async () => {
      installSession();
      server.use(http.get("/api/v1/admin/projects", () => HttpResponse.json(page([project]))));
      const user = userEvent.setup();
      const first = renderApp(["/admin/projects"]);

      const layout = await screen.findByRole("group", { name: "Project layout" });
      const gridButton = within(layout).getByRole("button", { name: "Grid view" });
      const listButton = within(layout).getByRole("button", { name: "List view" });
      expect(gridButton).toHaveAttribute("aria-pressed", "true");
      expect(listButton).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByRole("list", { name: "My Projects" })).toHaveClass("admin-project-grid");

      await user.click(listButton);
      expect(listButton).toHaveAttribute("aria-pressed", "true");
      expect(gridButton).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByRole("list", { name: "My Projects" })).toHaveClass("admin-projects__list");
      expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("list");
      first.unmount();

      renderApp(["/admin/projects"]);
      expect(await screen.findByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
      expect(await screen.findByRole("list", { name: "My Projects" })).toHaveClass("admin-projects__list");
      await user.click(screen.getByRole("button", { name: "Grid view" }));
      expect(screen.getByRole("list", { name: "My Projects" })).toHaveClass("admin-project-grid");
      expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("grid");
    });

    it("renders paired compact card fields with a decorative photo, without workflow rows or team avatars", async () => {
      installSession();
      server.use(http.get("/api/v1/admin/projects", () => HttpResponse.json(page([approvedProject, draftProject]))));
      renderApp(["/admin/projects"]);

      const list = await screen.findByRole("list", { name: "My Projects" });
      const approved = within(list).getByRole("article", { name: "Approved villa" });
      expect(within(approved).getByRole("link", { name: "View details for Approved villa" })).toHaveAttribute(
        "href",
        "/admin/projects/project-approved"
      );
      expect(within(approved).getByText("Kiran Mehta")).toBeVisible();
      expect(within(approved).getByText("Mumbai")).toBeVisible();
      expect(within(approved).getByText("Villa")).toBeVisible();
      expect(within(approved).queryByText("Schedule site visit")).not.toBeInTheDocument();
      expect(within(approved).getByText("Active")).toHaveAttribute("data-tone", "success");
      expect(within(approved).queryByRole("img", { name: "Sales: Ravi Estimator" })).not.toBeInTheDocument();
      expect(within(approved).queryByRole("img", { name: "Designer: Divya Kapoor" })).not.toBeInTheDocument();
      expect(within(approved).getByRole("heading", { name: "Approved villa" })).toHaveAttribute("title", "Approved villa");
      expect(approved.querySelector(".admin-project-tile__meta")?.textContent).toBe("ClientKiran MehtaLocationMumbai");
      expect(approved.querySelector(".admin-project-tile__details")?.textContent).toContain("Property typeVillaClient-approved value (incl. GST)₹2,78,704");
      const media = approved.querySelector("img.admin-project-tile__media");
      expect(media).not.toBeNull();
      expect(media?.getAttribute("src")).toMatch(/projects-living-room/);
      expect(media).toHaveAttribute("alt", "");
      expect(media).toHaveAttribute("aria-hidden", "true");
      expect(media).toHaveAttribute("loading", "lazy");
      expect(approved.querySelector("time")).toBeNull();
      expect(within(approved).queryByText(/^Created /)).not.toBeInTheDocument();
      expect(within(approved).queryByRole("button", { name: /Quick view/ })).not.toBeInTheDocument();

      const draft = within(list).getByRole("article", { name: "Draft flat" });
      expect(within(draft).getByText("Property not captured")).toBeVisible();
      expect(within(draft).queryByText("No action pending")).not.toBeInTheDocument();
      expect(within(draft).getByText("On Hold")).toHaveAttribute("data-tone", "danger");
      expect(within(draft).queryByRole("img", { name: /^Sales:/ })).not.toBeInTheDocument();
      expect(within(draft).queryByRole("img", { name: /^Designer:/ })).not.toBeInTheDocument();
      expect(draft.querySelector("time")).toBeNull();
      expect(within(draft).queryByText(/^Created /)).not.toBeInTheDocument();
      expect(within(draft).queryByRole("button", { name: /Quick view/ })).not.toBeInTheDocument();
    });

    it("shows identical amount text in grid and list for approved, draft, missing-baseline, and no-estimate projects", async () => {
      installSession();
      server.use(
        http.get("/api/v1/admin/projects", () =>
          HttpResponse.json(page([approvedProject, draftProject, project, missingBaselineProject, zeroBaselineProject]))
        )
      );
      const user = userEvent.setup();
      renderApp(["/admin/projects"]);

      const gridList = await screen.findByRole("list", { name: "My Projects" });
      const gridAmounts = amountCases.map(([name, , label]) =>
        amountTextIn(within(gridList).getByRole("article", { name }), label)
      );
      expect(gridAmounts).toEqual(amountCases.map(([, text]) => text));
      expect(within(gridList).queryByText(/3,00,000/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "List view" }));
      const rowList = screen.getByRole("list", { name: "My Projects" });
      expect(rowList).toHaveClass("admin-projects__list");
      const listAmounts = amountCases.map(([name, , label]) =>
        amountTextIn(within(rowList).getByRole("article", { name }), label)
      );
      expect(listAmounts).toEqual(gridAmounts);
    });

    it("shows Assign Designer on a pending card only when the permission is granted", async () => {
      const pending: AdminProjectSummary = {
        ...approvedProject,
        estimate: approvedEstimate("project-approved", { designPlanStatus: "pending_assignment", designPlanDesigner: null })
      };
      tokenStorage.set("admin-token");
      server.use(
        http.get("/api/v1/auth/me", () => HttpResponse.json({ data: admin })),
        http.get("/api/v1/auth/authorization", () => HttpResponse.json({ data: { role: "admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["identity.self.read", "identity.authorization.read", "projects.list", "projects.read"] } })),
        http.get("/api/v1/admin/projects", () => HttpResponse.json(page([pending])))
      );
      const user = userEvent.setup();
      const first = renderApp(["/admin/projects"]);
      const article = await screen.findByRole("article", { name: "Approved villa" });
      expect(within(article).getByText("Estimation Approval")).toHaveAttribute("data-tone", "info");
      expect(within(article).queryByRole("button", { name: /Quick view/ })).not.toBeInTheDocument();
      expect(within(article).queryByRole("link", { name: "Assign Designer" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "List view" }));
      const row = screen.getByRole("article", { name: "Approved villa" });
      expect(within(row).getByRole("button", { name: "Quick view Approved villa" })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Grid view" }));
      first.unmount();

      installSession();
      renderApp(["/admin/projects"]);
      const permitted = await screen.findByRole("article", { name: "Approved villa" });
      expect(await within(permitted).findByRole("link", { name: "Assign Designer" })).toHaveAttribute(
        "href",
        "/admin/projects/project-approved#design-assignment-title"
      );
    });

    it("renders a hidden skeleton grid while the first page loads", async () => {
      installSession();
      server.use(http.get("/api/v1/admin/projects", () => new Promise<never>(() => undefined)));
      renderApp(["/admin/projects"]);
      await screen.findByRole("heading", { name: "My Projects" });
      expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent("Loading projects");
      const skeleton = document.querySelector(".admin-project-grid--skeleton");
      expect(skeleton).not.toBeNull();
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
      expect(skeleton?.querySelectorAll("li")).toHaveLength(8);
      expect(screen.queryByRole("list", { name: "My Projects" })).not.toBeInTheDocument();
    });
  });
});
