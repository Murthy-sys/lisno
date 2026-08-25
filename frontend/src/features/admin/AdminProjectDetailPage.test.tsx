import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import type { PermissionCode } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const project = {
  id: "project-1",
  name: "Asha home",
  status: "planning",
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: { id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example" },
  lead: {
    id: "lead-1",
    stage: "site_visit",
    nextAction: "Share measurements",
    nextActionAt: "2026-08-25T05:00:00.000Z"
  },
  estimate: { id: "estimate-1", status: "draft", total: 975000 },
  createdAt: "2026-08-23T10:00:00.000Z"
};

function installSession(
  permissions: readonly PermissionCode[] = [
    "identity.self.read",
    "identity.authorization.read",
    "projects.read",
    "projects.list",
    "design.plan_assignment.manage",
    "estimation.client_response_tasks.read"
  ]
) {
  tokenStorage.set("admin-detail-token");
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({
        data: { id: "admin-1", name: "Meera Admin", email: "meera@lisno.example", role: "admin" }
      })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          role: "admin",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions
        }
      })
    )
  );
}

describe("AdminProjectDetailPage", () => {
  it("renders loading, retry, captured identity, handoff progress, and estimate data", async () => {
    installSession();
    let requests = 0;
    let releaseInitial!: () => void;
    const initial = new Promise<void>((resolve) => { releaseInitial = resolve; });
    server.use(
      http.get("/api/v1/admin/projects/project-1", async () => {
        requests += 1;
        if (requests === 1) {
          await initial;
          return HttpResponse.json(
            { error: { code: "FAILED", message: "Project unavailable." } },
            { status: 503 }
          );
        }
        return HttpResponse.json({ data: project });
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/projects/project-1"]);
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
        "Loading project details"
      )
    );
    releaseInitial();
    expect(await screen.findByText("Project unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Asha home" })).toBeVisible();
    const detail = screen.getByRole("region", { name: "Project details" });
    for (const value of [
      "Asha Shah",
      "asha@example.com",
      "+91 90000 00000",
      "Pune",
      "3BHK",
      "Ravi Estimator",
      "Share measurements",
      "25 Aug 2026, 05:00",
      "Draft"
    ]) {
      expect(within(detail).getByText(value)).toBeVisible();
    }
    expect(within(detail).getByText(/₹9,75,000/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to My Projects" })).toHaveAttribute(
      "href",
      "/admin/projects"
    );
    for (const name of [
      "Edit",
      "Edit estimate",
      "Reassign",
      "Approve",
      "Start estimate",
      "Continue estimate",
      "Act as Client",
      "Decide as Client"
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("uses explicit fallbacks when estimator, lead, and estimate are null", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: { ...project, estimator: null, lead: null, estimate: null }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);
    expect(await screen.findByRole("heading", { name: "Asha home" })).toBeVisible();
    expect(screen.getAllByText("Unassigned handoff")).toHaveLength(2);
    expect(screen.getByText("No estimate yet")).toBeVisible();
  });

  it("normalizes a legacy approved handoff and exposes Designer assignment", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            lead: {
              ...project.lead,
              stage: "won",
              nextAction: "project kickoff"
            },
            estimate: {
              ...project.estimate,
              status: "client_approved"
            }
          }
        })
      ),
      http.get("/api/v1/admin/designers", () =>
        HttpResponse.json({
          data: [
            {
              id: "designer-1",
              name: "Ananya Designer",
              email: "ananya@lisno.example"
            }
          ]
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    expect(await screen.findByText("Estimation Approval")).toBeVisible();
    const detail = screen.getByRole("region", { name: "Project details" });
    expect(within(detail).getByText("Assign Designer to upload design")).toBeVisible();
    expect(within(detail).queryByText("project kickoff")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assign Designer" })).toHaveAttribute(
      "href",
      "#design-assignment-title"
    );
    expect(
      await screen.findByRole("combobox", { name: "Assigned Designer" })
    ).toBeEnabled();
    expect(
      screen.getByRole("option", { name: "Ananya Designer · ananya@lisno.example" })
    ).toBeVisible();
  });

  it("links the assigned current pending Client response task from the project summary", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            estimate: {
              ...project.estimate,
              clientReview: {
                id: "round-1",
                sendGeneration: 2,
                estimateVersion: 4,
                version: 3,
                deliveryStatus: "sent",
                deliveryAttemptCount: 1,
                deliveredAt: "2026-08-23T10:00:02.000Z",
                status: "pending"
              },
              hasPendingClientResponseTask: true
            }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    expect(await screen.findByRole("heading", { name: "Asha home" })).toBeVisible();
    const response = screen.getByRole("region", { name: "Client response" });
    expect(within(response).getByText("Pending")).toBeVisible();
    expect(within(response).getByText("Email sent")).toBeVisible();
    expect(within(response).getByRole("link", { name: "Review Client response" })).toHaveAttribute(
      "href",
      "/admin/client-responses/round-1"
    );
    for (const name of ["Edit estimate", "Decide as Client", "Approve for Client"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("keeps the pending Client response task link hidden without task read permission", async () => {
    installSession([
      "identity.self.read",
      "identity.authorization.read",
      "projects.read",
      "projects.list"
    ]);
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            estimate: {
              ...project.estimate,
              clientReview: {
                id: "round-1",
                sendGeneration: 2,
                estimateVersion: 4,
                version: 3,
                deliveryStatus: "sent",
                deliveryAttemptCount: 1,
                deliveredAt: "2026-08-23T10:00:02.000Z",
                status: "pending"
              },
              hasPendingClientResponseTask: true
            }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    const response = await screen.findByRole("region", { name: "Client response" });
    expect(within(response).getByText("Pending")).toBeVisible();
    expect(
      within(response).queryByRole("link", { name: "Review Client response" })
    ).not.toBeInTheDocument();
  });

  it("keeps an unassigned pending Client response round read-only", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            estimate: {
              ...project.estimate,
              clientReview: {
                id: "round-unassigned",
                sendGeneration: 2,
                estimateVersion: 4,
                version: 3,
                deliveryStatus: "sent",
                deliveryAttemptCount: 1,
                deliveredAt: "2026-08-23T10:00:02.000Z",
                status: "pending"
              },
              hasPendingClientResponseTask: false
            }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    const response = await screen.findByRole("region", { name: "Client response" });
    expect(within(response).getByText("Pending")).toBeVisible();
    expect(
      within(response).queryByRole("link", { name: "Review Client response" })
    ).not.toBeInTheDocument();
  });

  it("renders a terminal Client response as read-only history", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            estimate: {
              ...project.estimate,
              clientReview: {
                id: "round-terminal",
                sendGeneration: 2,
                estimateVersion: 4,
                version: 4,
                deliveryStatus: "sent",
                deliveryAttemptCount: 1,
                deliveredAt: "2026-08-23T10:00:02.000Z",
                status: "approved"
              },
              hasPendingClientResponseTask: false
            }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    expect(await screen.findByRole("region", { name: "Client response" })).toHaveTextContent(
      "Approved"
    );
    expect(screen.getByText("Read-only Client response history")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Review Client response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject|edit/i })).not.toBeInTheDocument();
  });

  it("renders no Client response section or action when no review round exists", async () => {
    installSession();
    server.use(
      http.get("/api/v1/admin/projects/project-1", () =>
        HttpResponse.json({
          data: {
            ...project,
            estimate: {
              ...project.estimate,
              clientReview: null,
              hasPendingClientResponseTask: false
            }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    expect(await screen.findByRole("heading", { name: "Asha home" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Client response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review Client response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject|edit|act as client/i })).not.toBeInTheDocument();
  });
});
