import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { AdminProjectSummary } from "../../api/types";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { adminProjectsPath, estimatorOptionsPath } from "./adminProjectsApi";

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
});

describe("AdminProjectsPage", () => {
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
      expect(within(list).getByText("Assign Designer to upload design")).toBeVisible();
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

    resolveFirst();
    expect(await screen.findByText("Projects unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No projects initiated yet.")).toBeVisible();
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

    renderApp(["/admin/projects"]);
    expect(await screen.findByRole("heading", { name: "My Projects" })).toBeVisible();
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
    const estimatorInput = within(dialog).getByRole("combobox", { name: "Estimator/Sales" });
    await user.click(estimatorInput);
    await within(dialog).findByRole("option", { name: /Ravi Estimator/ });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Initiate project" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Initiate project" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/projects/project-created"));
    expect(body).not.toHaveProperty("source");
  });
});
