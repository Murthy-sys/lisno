import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import type { PermissionCode } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { ProjectFinanceBucket } from "../../api/types";
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

function installSuperAdminFinanceSession(additionalPermissions: PermissionCode[] = []) {
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
            "finance.bucket.read",
            "finance.entry.read",
            "finance.entry.create",
            ...additionalPermissions
          ]
        }
      })
    )
  );
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

  it("shows an estimate-approved pending-design baseline with project-specific integrity checks", async () => {
    installSuperAdminFinanceSession();
    const financeRequests: string[] = [];
    server.use(
      http.get("/api/v1/admin/projects/project-murthy", () =>
        HttpResponse.json({ data: approvedPendingProject })
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

    expect(await screen.findByRole("heading", { name: "murthy-1 finance" })).toBeVisible();
    const breakdown = screen.getByRole("list", { name: "Cost budget breakdown" });
    expect(within(breakdown).getByText("Approved cost budget").closest("li"))
      .toHaveTextContent("₹1,88,952.00");
    expect(within(breakdown).getByText("Recorded expenses").closest("li"))
      .toHaveTextContent("₹0.00");
    const gauge = screen.getByRole("figure");
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

    expect(await screen.findByText("Approved baseline unavailable")).toBeVisible();
    expect(screen.getByText(/approved Estimate baseline is missing/i)).toBeVisible();
    expect(screen.queryByText(/₹10,62,000/)).not.toBeInTheDocument();
    expect(financeRequests).toBe(0);
  });

  it("reuses the loaded project and loads section assignments once in the Super Admin detail sequence", async () => {
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
    const finance = await screen.findByRole("heading", { name: "murthy-1 finance" });
    const workflow = await screen.findByRole("heading", { name: "Entire project workflow" });
    const design = screen.getByRole("heading", { name: "Design plan assignment" });
    const workers = await screen.findByRole("heading", { name: "Task assignment" });
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(identity.compareDocumentPosition(finance) & follows).toBeTruthy();
    expect(finance.compareDocumentPosition(workflow) & follows).toBeTruthy();
    expect(workflow.compareDocumentPosition(design) & follows).toBeTruthy();
    expect(design.compareDocumentPosition(workers) & follows).toBeTruthy();
    expect(projectRequests).toBe(1);
    expect(taskRequests).toBe(1);
    expect(sectionAssignmentRequests).toBe(1);
  });
});
