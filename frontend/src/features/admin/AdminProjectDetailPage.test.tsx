import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
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

function installSession() {
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
          permissions: ["identity.self.read", "identity.authorization.read", "projects.read", "projects.list"]
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
    for (const name of ["Edit", "Reassign", "Approve", "Start estimate", "Continue estimate"]) {
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
});
