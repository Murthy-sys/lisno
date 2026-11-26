import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import axe from "axe-core";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import type { PermissionCode } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { DesignerSuggestionsPage, ProjectFinanceBucket } from "../../api/types";
import { renderApp, renderWithQuery } from "../../test/render";
import { AuthProvider } from "../../auth/AuthProvider";
import { AdminProjectDetailPage } from "./AdminProjectDetailPage";
import { adminProjectKeys } from "./adminProjectsApi";
import { procurementProjectIdentityKeys } from "./procurementProjectIdentityApi";
import { server } from "../../test/server";

beforeEach(() => {
  server.use(http.get("/api/v1/projects/:projectId/design-workflow", ({ params }) =>
    HttpResponse.json({ data: {
      projectId: params.projectId, projectName: "Project", serverNow: new Date().toISOString(), floors: []
    } })
  ));
});

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

function designerSuggestions(projectId: string, designer: { id: string; name: string }): DesignerSuggestionsPage {
  return {
    projectId, serverNow: "2026-11-25T09:00:00.000Z", sourceRevision: "a".repeat(64),
    projectPreferredLanguage: null, projectLocation: null, projectCity: null,
    currentDesigner: null, pendingRequests: [], pendingRequest: null, canRequest: true, blockedReason: null,
    items: [{ ...designer, activeProjectCount: 2, languagesKnown: [], preferredLanguage: null, location: null,
      languageMatch: "unknown", locationMatch: "unknown", eligible: true, blockedReason: null }],
    pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
  };
}

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

function installSuperAdminFinanceSession(additionalPermissions: PermissionCode[] = [], includeFinancePermissions = true) {
  tokenStorage.set("super-admin-project-detail-token");
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({
        data: {
          id: "super-admin-1",
          name: "Sanjay Super Admin",
          email: "sanjay@lisno.example",
          role: "super_admin"
        }
      })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          role: "super_admin",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: [
            "identity.self.read",
            "identity.authorization.read",
            "projects.read",
            "projects.list",
            ...(includeFinancePermissions ? ["finance.bucket.read", "finance.entry.read", "finance.entry.create"] : []),
            ...additionalPermissions
          ]
        }
      })
    )
  );
}

async function openProjectView(user: ReturnType<typeof userEvent.setup>, name: "Project details" | "Client persona" | "Assignments") {
  const navigation = await screen.findByRole("group", { name: "Project views" });
  await user.click(within(navigation).getByRole("button", { name }));
}

async function openProjectTool(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = await screen.findByText("More project tools", { selector: "summary" });
  if (!trigger.closest("details")?.open) await user.click(trigger);
  const navigation = screen.getByRole("group", { name: "Project tools" });
  await user.click(within(navigation).getByRole("button", { name }));
}

const approvedPendingProject = {
  ...project,
  id: "project-murthy",
  name: "murthy-1",
  lead: {
    ...project.lead,
    stage: "won",
    nextAction: "Assign Designer for design plan"
  },
  estimate: {
    id: "estimate-murthy",
    leadId: "lead-1",
    projectId: "project-murthy",
    resolvedProjectId: "project-murthy",
    projectLinkSource: "estimate_and_lead",
    version: 5,
    status: "client_approved",
    subtotal: 236_190,
    gst: 42_514,
    total: 278_704,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 4,
      reviewRoundId: "estimate-review-murthy",
      subtotal: 236_190,
      gst: 42_514,
      total: 278_704,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesigner: null,
    clientReview: null,
    hasPendingClientResponseTask: false
  }
};

const approvedPendingBucket: ProjectFinanceBucket = {
  id: "finance-bucket-project-murthy",
  projectId: "project-murthy",
  projectName: "murthy-1",
  projectStatus: "planning",
  estimateId: "estimate-murthy",
  estimateVersion: 4,
  estimateReviewRoundId: "estimate-review-murthy",
  designPlanVersion: 0,
  currency: "INR",
  approvedSubtotalPaise: 23_619_000,
  approvedGstPaise: 4_251_400,
  approvedContractTotalPaise: 27_870_400,
  targetMarginBps: 2_000,
  targetProfitPaise: 4_723_800,
  costBudgetPaise: 18_895_200,
  procurementCostPaise: 0,
  employeePaymentPaise: 0,
  otherExpensePaise: 0,
  directSpendPaise: 0,
  overheadPaise: 0,
  recordedCostPaise: 0,
  remainingBudgetPaise: 18_895_200,
  currentProfitPaise: 23_619_000,
  currentMarginBps: 10_000,
  overBudget: false,
  deadlineAt: "2026-11-22T10:00:00.000Z",
  overdueDays: 0,
  deadlineStatus: "on_track",
  overdueTaskCount: 0,
  status: "pending_design",
  version: 1,
  openedAt: null,
  closedAt: null,
  createdAt: "2026-08-24T09:00:00.000Z",
  updatedAt: "2026-08-24T09:00:00.000Z"
};

describe("AdminProjectDetailPage", () => {
  it.each([undefined, null, "Lisno000042"])("shows the project number %s separately from internal identity", async (projectNumber) => {
    installSession();
    server.use(http.get("/api/v1/admin/projects/:id", () => HttpResponse.json({ data: { ...project, projectNumber } })));
    renderApp(["/admin/projects/project-1"]);
    expect(await screen.findByText(projectNumber ? `Project ID: ${projectNumber}` : "Project ID not assigned")).toBeVisible();
    expect(screen.getByRole("heading", { name: project.name })).toBeVisible();
    expect(screen.getByText(`System ID: ${project.id}`)).toBeVisible();
  });

  it("presents captured summary facts, clearly labelled reference artwork and only known team members", async () => {
    installSession();
    server.use(http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: project })));
    const user = userEvent.setup();
    renderApp(["/admin/projects/project-1"]);
    const summary = await screen.findByRole("region", { name: "Project summary" });
    for (const value of ["Asha Shah", "Pune", "3BHK", "23 Aug 2026", "Current estimate value (incl. GST)", "₹9,75,000", "Draft"]) {
      expect(within(summary).getByText(value)).toBeVisible();
    }
    expect(within(summary).getByText("Created").nextElementSibling?.querySelector("time")).toHaveAttribute("datetime", project.createdAt);
    expect(within(summary).queryByText("Initial client budget range")).not.toBeInTheDocument();
    const information = screen.getByRole("button", { name: "Project information" });
    expect(information).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Assignment & progress" })).toHaveAttribute("aria-expanded", "true");
    information.focus();
    await user.keyboard("{Enter}");
    expect(information).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(information).toHaveAttribute("aria-expanded", "true");
    const people = screen.getByRole("region", { name: "Team members" });
    expect(within(people).getAllByRole("listitem")).toHaveLength(2);
    expect(within(people).getByText("Ravi Estimator")).toBeVisible();
    expect(within(people).getByText("Asha Shah")).toBeVisible();
    expect(within(people).queryByText("Designer")).not.toBeInTheDocument();
    const artwork = screen.getByRole("figure", { name: "Interior reference" });
    expect(within(artwork).getByText("Illustrative artwork")).toBeVisible();
    expect(artwork.querySelector("img")).toHaveAttribute("alt", "");
    expect(artwork.querySelector("img")?.getAttribute("src")).toContain("projects-living-room");
    for (const name of ["Edit project", "More", "Timeline", "Documents", "Financials", "Start date", "Target date", "Project manager"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name })).not.toBeInTheDocument();
      expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
    }
  });

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
    expect(within(screen.getByRole("region", { name: "Project details" })).getByText("No estimate yet")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Project summary" })).getByText("No estimate yet")).toBeVisible();
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
      http.get("/api/v1/admin/projects/project-1/designer-suggestions", () =>
        HttpResponse.json({
          data: designerSuggestions("project-1", { id: "designer-1", name: "Ananya Designer" })
        })
      )
    );

    renderApp(["/admin/projects/project-1"]);

    const heading = await screen.findByRole("heading", { name: "Asha home" });
    expect(within(heading.closest("header")!).getByText("Estimation Approval")).toBeVisible();
    const detail = screen.getByRole("region", { name: "Project details" });
    expect(within(detail).getByText("Assign Designer to upload design")).toBeVisible();
    expect(within(detail).queryByText("project kickoff")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assign Designer" })).toHaveAttribute(
      "href",
      "#design-assignment-title"
    );
    expect(
      await screen.findByRole("button", { name: "Send assignment request to Ananya Designer" })
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Ananya Designer" })
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

  it("shows an estimate-approved pending-design baseline with project-specific integrity checks", async () => {
    installSuperAdminFinanceSession();
    const financeRequests: string[] = [];
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () =>
        HttpResponse.json({ data: { ...approvedPendingProject, estimate: { ...approvedPendingProject.estimate, total: 999_999 } } })
      ),
      http.get("/api/v1/admin/designers", () => HttpResponse.json({ data: [] })),
      http.get("/api/v1/finance/projects/project-murthy", ({ request }) => {
        financeRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: approvedPendingBucket });
      }),
      http.get("/api/v1/finance/projects/project-murthy/entries", ({ request }) => {
        financeRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        });
      })
    );

    renderApp(["/admin/projects/project-murthy"]);

    expect(await screen.findByRole("heading", { name: "murthy-1" })).toBeVisible();
    const projectDetails = screen.getByRole("region", { name: "Project details" });
    expect(within(projectDetails).getByText("Initial client budget range")).toBeVisible();
    expect(within(projectDetails).getByText(/₹8,00,000\s*–\s*₹12,00,000/)).toBeVisible();
    expect(within(projectDetails).getByText("Client-approved value (incl. GST)")).toBeVisible();
    expect(within(projectDetails).getByText(/₹2,78,704/)).toBeVisible();
    for (const name of ["Project summary", "Quick summary"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText("₹2,78,704")).toHaveLength(1);
    expect(screen.queryByText("₹9,99,999")).not.toBeInTheDocument();
    expect(financeRequests).toEqual([]);

    await openProjectTool(userEvent.setup(), "Finance");
    expect(await screen.findByRole("heading", { name: "murthy-1 finance" })).toBeVisible();
    const breakdown = screen.getByRole("list", { name: "Cost budget breakdown" });
    expect(within(breakdown).getByText("Approved cost budget").closest("li"))
      .toHaveTextContent("₹1,88,952.00");
    expect(within(breakdown).getByText("Recorded expenses").closest("li"))
      .toHaveTextContent("₹0.00");
    const gauge = within(screen.getByRole("region", { name: "murthy-1 finance" })).getByRole("figure");
    expect(within(gauge).getByText("₹1,88,952.00")).toBeVisible();
    expect(within(gauge).getByText("left to spend")).toBeVisible();
    expect(screen.getByText("pending design")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Record project cost" })).not.toBeInTheDocument();
    expect(financeRequests.sort()).toEqual([
      "/api/v1/finance/projects/project-murthy",
      "/api/v1/finance/projects/project-murthy/entries"
    ]);
  });

  it("fails closed when another project's finance bucket is returned", async () => {
    installSuperAdminFinanceSession();
    const foreignBucket: ProjectFinanceBucket = {
      ...approvedPendingBucket,
      id: "finance-bucket-project-blue",
      projectId: "project-blue",
      projectName: "Blue Loft",
      estimateId: "estimate-blue",
      approvedSubtotalPaise: 50_000_000,
      approvedGstPaise: 9_000_000,
      approvedContractTotalPaise: 59_000_000,
      targetProfitPaise: 10_000_000,
      costBudgetPaise: 40_000_000,
      remainingBudgetPaise: 40_000_000,
      currentProfitPaise: 50_000_000
    };
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () =>
        HttpResponse.json({ data: approvedPendingProject })
      ),
      http.get("/api/v1/admin/designers", () => HttpResponse.json({ data: [] })),
      http.get("/api/v1/finance/projects/project-murthy", () =>
        HttpResponse.json({ data: foreignBucket })
      ),
      http.get("/api/v1/finance/projects/project-murthy/entries", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      )
    );

    renderApp(["/admin/projects/project-murthy"]);

    await openProjectTool(userEvent.setup(), "Finance");
    expect(await screen.findByText(/financial details do not match this project's approved estimate/i))
      .toBeVisible();
    expect(screen.getByRole("heading", { name: "murthy-1 finance" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Blue Loft finance" })).not.toBeInTheDocument();
    expect(screen.queryByText("₹5,90,000.00")).not.toBeInTheDocument();
  });

  it("does not query or display mutable Estimate money when the approved baseline is missing", async () => {
    installSuperAdminFinanceSession();
    let financeRequests = 0;
    const projectWithoutBaseline = {
      ...approvedPendingProject,
      estimate: {
        ...approvedPendingProject.estimate,
        subtotal: 900_000,
        gst: 162_000,
        total: 1_062_000,
        approvedBaseline: null
      }
    };
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () =>
        HttpResponse.json({ data: projectWithoutBaseline })
      ),
      http.get("/api/v1/admin/designers", () => HttpResponse.json({ data: [] })),
      http.get("/api/v1/finance/projects/project-murthy", () => {
        financeRequests += 1;
        return HttpResponse.json({ data: approvedPendingBucket });
      }),
      http.get("/api/v1/finance/projects/project-murthy/entries", () => {
        financeRequests += 1;
        return HttpResponse.json({ data: { items: [], pagination: {} } });
      })
    );

    renderApp(["/admin/projects/project-murthy"]);

    const details = await screen.findByRole("region", { name: "Project details" });
    expect(within(details).getByText("Approved baseline unavailable")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Project summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quick summary" })).not.toBeInTheDocument();
    expect(financeRequests).toBe(0);
    await openProjectTool(userEvent.setup(), "Finance");
    expect(screen.getByText(/approved Estimate baseline is missing/i)).toBeVisible();
    expect(screen.queryByText(/₹10,62,000/)).not.toBeInTheDocument();
    expect(financeRequests).toBe(0);
  });

  it("starts with project facts and loads assignment and operational tools only when visited", async () => {
    installSuperAdminFinanceSession(["execution.worker_assignment.override"]);
    let projectRequests = 0;
    let taskRequests = 0;
    let sectionAssignmentRequests = 0;
    const approvedProject = {
      ...approvedPendingProject,
      status: "active",
      estimate: {
        ...approvedPendingProject.estimate,
        designPlanStatus: "approved",
        designPlanVersion: 2
      }
    };
    const openBucket = {
      ...approvedPendingBucket,
      designPlanVersion: 2,
      status: "open" as const,
      version: 2,
      openedAt: "2026-08-26T09:00:00.000Z"
    };
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () => {
        projectRequests += 1;
        return HttpResponse.json({ data: approvedProject });
      }),
      http.get("/api/v1/finance/projects/project-murthy", () =>
        HttpResponse.json({ data: openBucket })
      ),
      http.get("/api/v1/finance/projects/project-murthy/entries", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      ),
      http.get("/api/v1/admin/projects/project-murthy/workflow-tasks", () => {
        taskRequests += 1;
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/admin/projects/project-murthy/section-assignments", () => {
        sectionAssignmentRequests += 1;
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: [] }))
    );

    renderApp(["/admin/projects/project-murthy"]);

    const identity = await screen.findByRole("region", { name: "Project details" });
    const user = userEvent.setup();
    expect(identity).toBeVisible();
    expect(screen.queryByRole("region", { name: "People & assignments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "murthy-1 finance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Entire project workflow" })).not.toBeInTheDocument();
    expect(taskRequests).toBe(0);
    expect(sectionAssignmentRequests).toBe(0);
    await openProjectView(user, "Assignments");
    const people = screen.getByRole("region", { name: "People & assignments" });
    const navigation = within(people).getByRole("group", { name: "Assignment responsibility" });
    expect(within(navigation).getByRole("button", { name: "Designer" })).toHaveAttribute("aria-pressed", "true");
    expect(within(people).getByRole("heading", { name: "Design plan assignment" })).toBeVisible();
    expect(within(navigation).queryByRole("button", { name: "Trade teams" })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "Procurement" }));
    await waitFor(() => expect(taskRequests).toBe(1));
    expect(sectionAssignmentRequests).toBe(0);
    await openProjectTool(user, "Trade teams");
    expect(await screen.findByRole("heading", { name: "Work sections" })).toBeVisible();
    await openProjectTool(user, "Finance");
    expect(await screen.findByRole("heading", { name: "murthy-1 finance" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Work sections" })).not.toBeInTheDocument();
    await openProjectTool(user, "Entire workflow");
    expect(await screen.findByRole("heading", { name: "Entire project workflow" })).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Manage people" }));
    expect(within(navigation).getByRole("button", { name: "Designer" })).toHaveAttribute("aria-pressed", "true");
    expect(projectRequests).toBe(1);
    expect(sectionAssignmentRequests).toBe(1);
    // Reopening a visited editor reuses the mounted query and its draft.
    const reads = taskRequests;
    await user.click(within(navigation).getByRole("button", { name: "Procurement" }));
    expect(taskRequests).toBe(reads);
  });
});


it("enables initial-approved Designer assignment and keeps the unchanged approval current", async () => {
  installSuperAdminFinanceSession(["design.plan_assignment.manage"]);
  let financeCalls = 0;
  server.use(
    http.get("/api/v1/admin/projects/project-murthy", () => HttpResponse.json({ data: {
      ...approvedPendingProject, estimationWorkflowVersion: 3,
      estimate: { ...approvedPendingProject.estimate, status: "draft", estimationPhase: "post", total: 999999,
        initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 4, approvedAt: "2026-11-04T09:00:00.000Z" },
        canAssignDesigner: true, designerAssignmentBlockedReason: null,
        quotationApprovalState: "initial_current", currentQuotationApproved: true, requiresClientReapproval: false,
        quotationApprovalSource: "initial_unchanged",
        currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: "initial-round", estimateVersion: 4, approvedAt: "2026-11-04T09:00:00.000Z" }
      }
    } })),
    http.get("/api/v1/admin/projects/project-murthy/designer-suggestions", () => HttpResponse.json({ data: designerSuggestions("project-murthy", { id: "designer-one", name: "Designer One" }) })),
    http.get("/api/v1/finance/projects/project-murthy", () => { financeCalls++; return HttpResponse.json({ data: approvedPendingBucket }); })
  );
  renderApp(["/admin/projects/project-murthy"]);
  await screen.findByRole("heading", { name: "murthy-1" });
  const details = screen.getByRole("region", { name: "Project details" });
  expect(within(details).getByText("Initial estimate").closest("div")).toHaveTextContent("Client approved");
  expect(within(details).getByText("Designer quotation").closest("div")).toHaveTextContent("No changes; initial approval current");
  expect(within(details).getByText("₹2,78,704")).toBeVisible();
  expect(screen.queryByText("₹9,99,999")).not.toBeInTheDocument();
  const assign = screen.getByRole("link", { name: "Assign Designer" });
  expect(assign).toHaveAttribute("href", "#design-assignment-title");
  expect(financeCalls).toBe(0);
  await userEvent.click(assign);
  expect(await screen.findByRole("button", { name: "Send assignment request to Designer One" })).toBeEnabled();
  await openProjectTool(userEvent.setup(), "Finance");
  await waitFor(() => expect(financeCalls).toBe(1));
});

it("does not load current finance from a stale historical approval during a quotation revision", async () => {
  installSuperAdminFinanceSession();
  let financeCalls = 0;
  server.use(
    http.get("/api/v1/admin/projects/project-murthy", () => HttpResponse.json({ data: {
      ...approvedPendingProject,
      estimationWorkflowVersion: 3,
      estimate: {
        ...approvedPendingProject.estimate,
        estimationPhase: "post",
        initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 4, approvedAt: "2026-11-04T09:00:00.000Z" },
        quotationApprovalState: "revision_draft",
        currentQuotationApproved: false,
        requiresClientReapproval: true,
        quotationApprovalSource: null,
        currentQuotationApproval: null,
        canAssignDesigner: false,
        designerAssignmentBlockedReason: "Designer already assigned."
      }
    } })),
    http.get("/api/v1/finance/projects/project-murthy", () => { financeCalls += 1; return HttpResponse.json({ data: approvedPendingBucket }); })
  );
  renderApp(["/admin/projects/project-murthy"]);
  await openProjectTool(userEvent.setup(), "Finance");
  expect(await screen.findByText("The current approved financial baseline is unavailable until the latest quotation is approved.")).toBeVisible();
  expect(financeCalls).toBe(0);
});


it("keeps Procurement and Project Manager people separate and preserves a selection between responsibilities", async () => {
  installSuperAdminFinanceSession(["execution.worker_assignment.override", "projects.procurement_identity.manage"]);
  const procurement = { id: "procurement-1", name: "Priya Procurement", email: "priya@example.test", role: "procurement" };
  const manager = { id: "manager-1", name: "Maya Project Manager", email: "maya@example.test", role: "site_manager" };
  const approvedProject = { ...project, estimate: { ...approvedPendingProject.estimate,
    id: "estimate-1", projectId: project.id, resolvedProjectId: project.id, designPlanStatus: "approved", designPlanVersion: 1 } };
  server.use(
    http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: approvedProject })),
    http.get("/api/v1/admin/projects/project-1/procurement-identity", () => HttpResponse.json({ data: {
      projectId: project.id, city: { name: "Pune", key: "pune" }, programManagerId: manager.id, version: 1
    } })),
    http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [manager], total: 1, limit: 50, offset: 0 } })),
    http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: [manager, procurement] })),
    http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => HttpResponse.json({ data: [{
      id: "task-procurement", projectId: project.id, projectName: project.name, estimateId: "estimate-1",
      kind: "procurement", title: "Coordinate procurement", assigneeRole: "procurement", assignedWorker: null,
      description: "", sourceSectionId: null, roomName: null, status: "open", progress: 0, version: 1,
      openedAt: "2026-08-26T08:00:00.000Z", updatedAt: "2026-08-26T08:00:00.000Z"
    }] })),
    http.get("/api/v1/admin/projects/project-1/section-assignments", () => HttpResponse.json({ data: [] }))
  );
  const user = userEvent.setup();
  renderApp(["/admin/projects/project-1"]);
  await openProjectView(user, "Assignments");
  const people = screen.getByRole("region", { name: "People & assignments" });
  await user.click(within(people).getByRole("button", { name: "Procurement" }));
  const procurementSelect = await within(people).findByRole("combobox", { name: "Assigned Procurement" });
  expect(within(procurementSelect).getByRole("option", { name: /Priya Procurement/ })).toBeVisible();
  expect(within(procurementSelect).queryByRole("option", { name: /Maya/ })).not.toBeInTheDocument();
  expect(within(people).queryByRole("combobox", { name: "Project Manager" })).not.toBeInTheDocument();
  await user.selectOptions(procurementSelect, procurement.id);
  await openProjectView(user, "Client persona");
  expect(screen.queryByRole("combobox", { name: "Assigned Procurement" })).not.toBeInTheDocument();
  await openProjectView(user, "Project details");
  await openProjectView(user, "Assignments");
  expect(within(people).getByRole("combobox", { name: "Assigned Procurement" })).toHaveValue(procurement.id);
  const navigation = within(people).getByRole("group", { name: "Assignment responsibility" });
  await user.click(within(navigation).getByRole("button", { name: "Project Manager" }));
  const managerSelect = await within(people).findByRole("combobox", { name: "Project Manager" });
  expect(managerSelect).toHaveValue(manager.id);
  expect(within(managerSelect).getByRole("option", { name: /Maya Project Manager/ })).toBeVisible();
  expect(within(managerSelect).queryByRole("option", { name: /Priya/ })).not.toBeInTheDocument();
  expect(within(people).queryByRole("combobox", { name: "Assigned Procurement" })).not.toBeInTheDocument();
  await user.click(within(navigation).getByRole("button", { name: "Procurement" }));
  expect(within(people).getByRole("combobox", { name: "Assigned Procurement" })).toHaveValue(procurement.id);
  expect(within(people).getByRole("button", { name: "Assign Procurement" })).toBeEnabled();
});


const completionReady = {
  projectId: "project-murthy", projectStatus: "active", completionAuthority: "vendor_client",
  completionAuthorityVersion: 4, blockers: [], readyForCompletion: true, completedAt: null
};

it.each([false, true])("closes an active project from the header without a current finance baseline (finance permission: %s)", async (includeFinancePermissions) => {
  installSuperAdminFinanceSession(["procurement.project_completion.decide"], includeFinancePermissions);
  let completed = false;
  let projectRequests = 0;
  let readinessRequests = 0;
  let financeRequests = 0;
  const decisions: Array<Record<string, unknown>> = [];
  server.use(
    http.get("/api/v1/admin/projects/project-murthy", () => {
      projectRequests += 1;
      return HttpResponse.json({ data: {
        ...approvedPendingProject, status: completed ? "completed" : "active", estimationWorkflowVersion: 3,
        estimate: { ...approvedPendingProject.estimate, status: "draft", estimationPhase: "post", designPlanStatus: "approved",
          initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 4, approvedAt: "2026-11-04T09:00:00.000Z" },
          finalApproval: null }
      } });
    }),
    http.get("/api/v1/finance/projects/project-murthy", () => { financeRequests += 1; return HttpResponse.json({ data: approvedPendingBucket }); }),
    http.get("/api/v1/admin/projects/project-murthy/completion", () => {
      readinessRequests += 1;
      return HttpResponse.json({ data: { ...completionReady, projectStatus: completed ? "completed" : "active", readyForCompletion: !completed } });
    }),
    http.post("/api/v1/admin/projects/project-murthy/complete", async ({ request }) => {
      decisions.push(await request.json() as Record<string, unknown>);
      completed = true;
      return HttpResponse.json({ data: { projectId: "project-murthy", completedAt: "2026-11-16T09:00:00.000Z", resultingAuthorityVersion: 5 } });
    })
  );
  const user = userEvent.setup();
  renderApp(["/admin/projects/project-murthy#project-people-assignments"]);
  const trigger = await screen.findByRole("button", { name: "Close project" });
  expect(readinessRequests).toBe(0);
  expect(decisions).toHaveLength(0);
  expect(screen.queryByText("The current approved financial baseline is unavailable until the latest quotation is approved.")).not.toBeInTheDocument();
  await user.click(trigger);
  const dialog = screen.getByRole("alertdialog", { name: "Close murthy-1?" });
  const confirm = within(dialog).getByRole("button", { name: "Close project" });
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(readinessRequests).toBe(1);
  expect(decisions).toHaveLength(0);
  await user.click(confirm);
  await waitFor(() => {
    expect(decisions).toEqual([{ expectedAuthorityVersion: 4, idempotencyKey: expect.any(String) }]);
    expect(projectRequests).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: "Close project" })).not.toBeInTheDocument();
  });
  expect(financeRequests).toBe(0);
});

it.each([
  { role: "admin", permitted: true, status: "active" },
  { role: "super_admin", permitted: false, status: "active" },
  { role: "super_admin", permitted: true, status: "planning" },
  { role: "super_admin", permitted: true, status: "completed" }
])("hides header closure for role=$role, permission=$permitted, project=$status", async ({ role, permitted, status }) => {
  if (role === "admin") installSession(["identity.self.read", "identity.authorization.read", "projects.read", "projects.list", "procurement.project_completion.decide"]);
  else installSuperAdminFinanceSession(permitted ? ["procurement.project_completion.decide"] : [], false);
  let readinessRequests = 0;
  server.use(
    http.get("/api/v1/admin/projects/project-murthy", () => HttpResponse.json({ data: { ...approvedPendingProject, status } })),
    http.get("/api/v1/admin/projects/project-murthy/completion", () => { readinessRequests += 1; return HttpResponse.json({ data: completionReady }); })
  );
  renderApp(["/admin/projects/project-murthy"]);
  await screen.findByRole("heading", { name: "murthy-1" });
  expect(screen.queryByRole("button", { name: "Close project" })).not.toBeInTheDocument();
  expect(readinessRequests).toBe(0);
});

it("keeps header closure blocked until the completion service confirms readiness", async () => {
  installSuperAdminFinanceSession(["procurement.project_completion.decide"], false);
  let decisions = 0;
  server.use(
    http.get("/api/v1/admin/projects/project-murthy", () => HttpResponse.json({ data: { ...approvedPendingProject, status: "active" } })),
    http.get("/api/v1/admin/projects/project-murthy/completion", () => HttpResponse.json({ data: {
      ...completionReady, readyForCompletion: false,
      blockers: [{ code: "SITE_COMPLETION_PENDING", message: "Client acceptance of project completion is pending." }]
    } })),
    http.post("/api/v1/admin/projects/project-murthy/complete", () => { decisions += 1; return HttpResponse.json({ data: {} }); })
  );
  const user = userEvent.setup();
  renderApp(["/admin/projects/project-murthy"]);
  await user.click(await screen.findByRole("button", { name: "Close project" }));
  const dialog = screen.getByRole("alertdialog", { name: "Close murthy-1?" });
  expect(await within(dialog).findByText("Client acceptance of project completion is pending.")).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Close project" })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(decisions).toBe(0);
});


describe("Simple Super Admin project views", () => {
  it("shows facts once and presents captured Client persona through keyboard-operable views", async () => {
    installSuperAdminFinanceSession();
    server.use(http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: {
      ...project, projectNumber: "Lisno000042", nativePlace: "Mysuru", preferredLanguage: "kannada",
      languagesKnown: ["kannada", "english"], category: "self_use", tentativeBudget: "Flexible up to 12 lakh after scope review",
      closureTentativeDate: "2027-02-14"
    } })));
    const user = userEvent.setup();
    const view = renderApp(["/admin/projects/project-1"]);
    const details = await screen.findByRole("region", { name: "Project details" });
    expect(within(details).getByText("₹9,75,000")).toBeVisible();
    expect(screen.getAllByText("₹9,75,000")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Quick summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("figure", { name: "Interior reference" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Team members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("More project tools", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
    const navigation = screen.getByRole("group", { name: "Project views" });
    const viewButtons = within(navigation).getAllByRole("button");
    expect(viewButtons).toHaveLength(3);
    ["Project details", "Client persona", "Assignments"].forEach((name, index) => expect(viewButtons[index]).toHaveAccessibleName(name));
    const personaButton = within(navigation).getByRole("button", { name: "Client persona" });
    personaButton.focus();
    await user.keyboard("{Enter}");
    expect(personaButton).toHaveAttribute("aria-pressed", "true");
    const persona = screen.getByRole("region", { name: "Client persona" });
    expect(screen.queryByRole("region", { name: "Project details" })).not.toBeInTheDocument();
    for (const text of ["Asha Shah", "asha@example.com", "+91 90000 00000", "Mysuru", "Self use", "Flexible up to 12 lakh after scope review", "14 Feb 2027"]) {
      expect(within(persona).getByText(text)).toBeVisible();
    }
    expect(within(persona).getByText("Preferred language").closest("div")).toHaveTextContent("Kannada");
    expect(within(persona).getByText("Languages known").closest("div")).toHaveTextContent("English");
    expect(within(persona).queryByText(/expected completion|handover/i)).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await openProjectView(user, "Project details");
    const technical = screen.getByText("Technical details", { selector: "summary" });
    await user.click(technical);
    expect(screen.getByText(`System ID: ${project.id}`)).toBeVisible();
  });

  it("keeps unrecorded persona fields explicit and hides unauthorized tools", async () => {
    installSuperAdminFinanceSession([], false);
    server.use(http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: project })));
    const user = userEvent.setup();
    renderApp(["/admin/projects/project-1"]);
    await openProjectView(user, "Client persona");
    const persona = screen.getByRole("region", { name: "Client persona" });
    expect(within(persona).getByText("Native place").closest("div")).toHaveTextContent("Not captured");
    expect(within(persona).getByText("Tentative closure date").closest("div")).toHaveTextContent("Not captured");
    expect(within(persona).queryByRole("textbox")).not.toBeInTheDocument();
    const tools = screen.queryByText("More project tools", { selector: "summary" });
    if (tools) {
      await user.click(tools);
      const group = screen.getByRole("group", { name: "Project tools" });
      for (const name of ["Finance", "Trade teams", "Entire workflow"]) expect(within(group).queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it.each([false, true])("keeps Client response history secondary and respects response-task access=%s", async canRead => {
    installSuperAdminFinanceSession(canRead ? ["estimation.client_response_tasks.read"] : [], false);
    server.use(http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: {
      ...project, estimate: { ...project.estimate, hasPendingClientResponseTask: true,
        clientReview: { id: "round-1", sendGeneration: 2, estimateVersion: 4, version: 3,
          deliveryStatus: "sent", deliveryAttemptCount: 1, deliveredAt: "2026-08-23T10:00:02.000Z", status: "pending" } }
    } })));
    const user = userEvent.setup();
    renderApp(["/admin/projects/project-1"]);
    await screen.findByRole("region", { name: "Project details" });
    expect(screen.queryByRole("region", { name: "Client response" })).not.toBeInTheDocument();
    await openProjectTool(user, "Client response");
    const response = screen.getByRole("region", { name: "Client response" });
    expect(within(response).getByText("Pending")).toBeVisible();
    expect(within(response).getByText("Email sent")).toBeVisible();
    if (canRead) expect(within(response).getByRole("link", { name: "Review Client response" })).toHaveAttribute("href", "/admin/client-responses/round-1");
    else {
      expect(within(response).queryByRole("link", { name: "Review Client response" })).not.toBeInTheDocument();
      expect(within(response).getByText("Read-only Client response history")).toBeVisible();
    }
  });

  it("opens an existing Designer anchor without opening unrelated tools", async () => {
    installSuperAdminFinanceSession(["design.plan_assignment.manage"]);
    let financeRequests = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () => HttpResponse.json({ data: approvedPendingProject })),
      http.get("/api/v1/admin/projects/project-murthy/designer-suggestions", () => HttpResponse.json({ data: designerSuggestions("project-murthy", { id: "designer-one", name: "Designer One" }) })),
      http.get("/api/v1/finance/projects/project-murthy", () => { financeRequests++; return HttpResponse.json({ data: approvedPendingBucket }); })
    );
    renderApp(["/admin/projects/project-murthy#design-assignment-title"]);
    const navigation = await screen.findByRole("group", { name: "Project views" });
    expect(within(navigation).getByRole("button", { name: "Assignments" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: "Send assignment request to Designer One" })).toBeEnabled();
    expect(screen.getByText("More project tools", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
    expect(financeRequests).toBe(0);
  });

  it("clears the prior project's persona and view when navigating to a different project", async () => {
    installSuperAdminFinanceSession(["projects.procurement_identity.manage"], false);
    const other = { ...project, id: "project-2", name: "Garden studio", location: "",
      client: { name: "Second Client", email: "second@example.test", mobile: "2222222222" },
      nativePlace: "Madurai", estimate: { ...project.estimate, id: "estimate-2", total: 432100 } };
    server.use(
      http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: { ...project, location: "", nativePlace: "Mysuru" } })),
      http.get("/api/v1/admin/projects/project-2", () => HttpResponse.json({ data: other })),
      http.get("/api/v1/admin/projects/:projectId/procurement-identity", ({ params }) => HttpResponse.json({ data: {
        projectId: params.projectId, city: params.projectId === project.id ? { name: "Pune", key: "pune" } : { name: "Chennai", key: "chennai" },
        programManagerId: null, version: 1
      } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/admin/projects/project-1"]}><AuthProvider>
      <Link to="/admin/projects/project-2">Open second fixture project</Link>
      <Routes><Route path="/admin/projects/:projectId" element={<AdminProjectDetailPage />} /></Routes>
    </AuthProvider></MemoryRouter>);
    expect(await screen.findByText("Pune")).toBeVisible();
    await openProjectView(user, "Client persona");
    expect(screen.getByText("Mysuru")).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Open second fixture project" }));
    expect(await screen.findByRole("heading", { name: "Garden studio" })).toBeVisible();
    const details = screen.getByRole("region", { name: "Project details" });
    expect(await within(details).findByText("Chennai")).toBeVisible();
    expect(screen.queryByText("Pune")).not.toBeInTheDocument();
    expect(within(details).getByText("₹4,32,100")).toBeVisible();
    expect(screen.queryByText("₹9,75,000")).not.toBeInTheDocument();
    expect(screen.queryByText("Mysuru")).not.toBeInTheDocument();
    await openProjectView(user, "Client persona");
    expect(screen.getByText("Second Client")).toBeVisible();
    expect(screen.getByText("Madurai")).toBeVisible();
    expect(screen.queryByText("Asha Shah")).not.toBeInTheDocument();
  });

  it("removes previously visible project data after a denied refresh", async () => {
    installSuperAdminFinanceSession([], false);
    let denied = false;
    server.use(http.get("/api/v1/admin/projects/project-1", () => denied
      ? HttpResponse.json({ error: { code: "FORBIDDEN", message: "Project access changed." } }, { status: 403 })
      : HttpResponse.json({ data: project })));
    const view = renderApp(["/admin/projects/project-1"]);
    await screen.findByRole("region", { name: "Project details" });
    denied = true;
    await view.queryClient.invalidateQueries({ queryKey: adminProjectKeys.detail("project-1") });
    expect(await screen.findByText("Project access changed.")).toBeVisible();
    expect(screen.queryByText("₹9,75,000")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Project views" })).not.toBeInTheDocument();
  });
});

describe("Super Admin Project city", () => {
  it("shows the captured city read-only when legacy location is blank, with loading and accessible markup", async () => {
    installSuperAdminFinanceSession(["projects.procurement_identity.manage"], false);
    let releaseIdentity!: () => void;
    const identityReady = new Promise<void>(resolve => { releaseIdentity = resolve; });
    server.use(
      http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: { ...project, location: "  " } })),
      http.get("/api/v1/admin/projects/project-1/procurement-identity", async () => {
        await identityReady;
        return HttpResponse.json({ data: { projectId: project.id, city: { name: "Bengaluru", key: "bengaluru" }, programManagerId: null, version: 1 } });
      })
    );
    const view = renderApp(["/admin/projects/project-1"]);
    const details = await screen.findByRole("region", { name: "Project details" });
    expect(await within(details).findByText("Loading project city…")).toBeVisible();
    await act(async () => { releaseIdentity(); });
    expect(await within(details).findByText("Bengaluru")).toBeVisible();
    expect(within(details).getByText("Project city").closest("div")).toHaveTextContent("Bengaluru");
    expect(within(details).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(details).queryByRole("combobox")).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("preserves a captured legacy Location without requesting the city identity", async () => {
    installSuperAdminFinanceSession(["projects.procurement_identity.manage"], false);
    let identityRequests = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: project })),
      http.get("/api/v1/admin/projects/project-1/procurement-identity", () => {
        identityRequests++;
        return HttpResponse.json({ data: { projectId: project.id, city: { name: "Mumbai", key: "mumbai" }, programManagerId: null, version: 1 } });
      })
    );
    renderApp(["/admin/projects/project-1"]);
    const details = await screen.findByRole("region", { name: "Project details" });
    expect(within(details).getByText("Location").closest("div")).toHaveTextContent("Pune");
    expect(within(details).queryByText("Project city")).not.toBeInTheDocument();
    expect(identityRequests).toBe(0);
  });

  it("keeps absent and foreign cities explicit, retries failures, and hides cached cities after failed or denied refreshes", async () => {
    installSuperAdminFinanceSession(["projects.procurement_identity.manage"], false);
    let response: "missing" | "foreign" | "saved" | "failed" | "denied" = "missing";
    let identityRequests = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: { ...project, location: "" } })),
      http.get("/api/v1/admin/projects/project-1/procurement-identity", () => {
        identityRequests++;
        if (response === "failed" || response === "denied") return HttpResponse.json({ error: {
          code: response === "denied" ? "FORBIDDEN" : "UNAVAILABLE", message: "Identity unavailable."
        } }, { status: response === "denied" ? 403 : 503 });
        return HttpResponse.json({ data: {
          projectId: response === "foreign" ? "project-foreign" : project.id,
          city: response === "missing" ? null : response === "foreign" ? { name: "Foreign city", key: "foreign" } : { name: "Bengaluru", key: "bengaluru" },
          programManagerId: null, version: 1
        } });
      })
    );
    const user = userEvent.setup();
    const view = renderApp(["/admin/projects/project-1"]);
    const details = await screen.findByRole("region", { name: "Project details" });
    await waitFor(() => expect(within(details).getByText("Project city").closest("div")).toHaveTextContent("Not captured"));
    response = "foreign";
    await act(async () => { await view.queryClient.invalidateQueries({ queryKey: procurementProjectIdentityKeys.detail(project.id) }); });
    expect(await within(details).findByText("Project city could not be loaded.")).toBeVisible();
    expect(screen.queryByText("Foreign city")).not.toBeInTheDocument();
    response = "saved";
    await user.click(within(details).getByRole("button", { name: "Retry project city" }));
    expect(await within(details).findByText("Bengaluru")).toBeVisible();
    expect(identityRequests).toBe(3);
    for (const failure of ["failed", "denied"] as const) {
      response = failure;
      await act(async () => { await view.queryClient.invalidateQueries({ queryKey: procurementProjectIdentityKeys.detail(project.id) }); });
      expect(await within(details).findByText("Project city could not be loaded.")).toBeVisible();
      expect(screen.queryByText("Bengaluru")).not.toBeInTheDocument();
      response = "saved";
      await user.click(within(details).getByRole("button", { name: "Retry project city" }));
      expect(await within(details).findByText("Bengaluru")).toBeVisible();
    }
    expect(identityRequests).toBe(7);
  });

  it("does not fetch or expose cached city data without identity permission", async () => {
    installSuperAdminFinanceSession([], false);
    let identityRequests = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-1", () => HttpResponse.json({ data: { ...project, location: "" } })),
      http.get("/api/v1/admin/projects/project-1/procurement-identity", () => { identityRequests++; return HttpResponse.json({ data: null }); })
    );
    const view = renderApp(["/admin/projects/project-1"]);
    view.queryClient.setQueryData(procurementProjectIdentityKeys.detail(project.id), {
      projectId: project.id, city: { name: "Cached city", key: "cached" }, programManagerId: null, version: 1
    });
    const details = await screen.findByRole("region", { name: "Project details" });
    expect(within(details).getByText("Project city").closest("div")).toHaveTextContent("Not available");
    expect(screen.queryByText("Cached city")).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Retry project city" })).not.toBeInTheDocument();
    expect(identityRequests).toBe(0);
  });
});
