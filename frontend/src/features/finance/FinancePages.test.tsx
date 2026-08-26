import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type {
  FinanceLedgerEntry,
  ProjectFinanceBucket,
  ProjectFinancePortfolioSummary
} from "../../api/types";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { formatPaise } from "./ProjectFinancePanel";

const baseBucket: ProjectFinanceBucket = {
  id: "finance-bucket-project-one",
  projectId: "project-one",
  projectName: "Aurora Villa",
  projectStatus: "active",
  estimateId: "estimate-one",
  estimateVersion: 4,
  estimateReviewRoundId: "estimate-round-one",
  designPlanVersion: 2,
  currency: "INR",
  approvedSubtotalPaise: 100_000_000,
  approvedGstPaise: 18_000_000,
  approvedContractTotalPaise: 118_000_000,
  targetMarginBps: 2_000,
  targetProfitPaise: 20_000_000,
  costBudgetPaise: 80_000_000,
  procurementCostPaise: 20_000_000,
  employeePaymentPaise: 10_000_000,
  otherExpensePaise: 5_000_000,
  directSpendPaise: 35_000_000,
  overheadPaise: 5_000_000,
  recordedCostPaise: 40_000_000,
  remainingBudgetPaise: 40_000_000,
  currentProfitPaise: 60_000_000,
  currentMarginBps: 6_000,
  overBudget: false,
  deadlineAt: "2026-09-15T00:00:00.000Z",
  overdueDays: 0,
  deadlineStatus: "on_track",
  overdueTaskCount: 0,
  status: "open",
  version: 3,
  openedAt: "2026-08-24T09:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-26T09:00:00.000Z"
};

const overBudgetBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-two",
  projectId: "project/two",
  projectName: "Lake House",
  estimateId: "estimate-two",
  estimateReviewRoundId: "estimate-round-two",
  designPlanVersion: 1,
  approvedSubtotalPaise: 50_000_000,
  approvedGstPaise: 9_000_000,
  approvedContractTotalPaise: 59_000_000,
  targetProfitPaise: 10_000_000,
  costBudgetPaise: 40_000_000,
  procurementCostPaise: 30_000_000,
  employeePaymentPaise: 10_000_000,
  otherExpensePaise: 2_000_000,
  directSpendPaise: 42_000_000,
  overheadPaise: 3_000_000,
  recordedCostPaise: 45_000_000,
  remainingBudgetPaise: -5_000_000,
  currentProfitPaise: 5_000_000,
  currentMarginBps: 1_000,
  overBudget: true,
  deadlineAt: "2026-08-14T00:00:00.000Z",
  overdueDays: 12,
  deadlineStatus: "overdue",
  overdueTaskCount: 3
};

const unknownCompletionBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-three",
  projectId: "project-three",
  projectName: "Cedar Apartment",
  projectStatus: "completed",
  deadlineStatus: "completed_date_unknown",
  status: "closed"
};

const lateCompletionBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-four",
  projectId: "project-four",
  projectName: "Maple Office",
  projectStatus: "completed",
  deadlineStatus: "completed_late",
  status: "closed"
};

const portfolioSummary: ProjectFinancePortfolioSummary = {
  projectCount: 4,
  approvedContractTotalPaise: 413_000_000,
  approvedGstPaise: 63_000_000,
  approvedSubtotalPaise: 350_000_000,
  targetProfitPaise: 70_000_000,
  costBudgetPaise: 280_000_000,
  procurementCostPaise: 90_000_000,
  employeePaymentPaise: 40_000_000,
  otherExpensePaise: 17_000_000,
  directSpendPaise: 147_000_000,
  overheadPaise: 18_000_000,
  recordedCostPaise: 165_000_000,
  remainingBudgetPaise: 115_000_000,
  currentProfitPaise: 185_000_000,
  currentMarginBps: 5_286,
  overBudgetProjectCount: 1,
  overdueProjectCount: 1,
  lateCompletedProjectCount: 1,
  overdueTaskCount: 3
};

function installFinanceSession() {
  tokenStorage.set("finance-manager-token");
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({
        data: {
          id: "finance-manager-one",
          name: "Rohan Finance",
          email: "rohan.finance@lisno.example",
          role: "finance_head"
        }
      })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          role: "finance_head",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: [
            "identity.self.read",
            "identity.authorization.read",
            "finance.bucket.read",
            "finance.entry.read",
            "finance.entry.create"
          ]
        }
      })
    )
  );
}

function expectKpi(summary: HTMLElement, label: string, valuePaise: number) {
  const card = within(summary).getByText(label).closest("article");
  expect(card).not.toBeNull();
  expect(card).toHaveTextContent(formatPaise(valuePaise));
}

function requiredLabel(label: string) {
  return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`);
}

describe("FinanceOverviewPage", () => {
  it("uses the server-wide approved-project summary and shows the fixed profit reserve, expenses, budget, and deadline risk", async () => {
    installFinanceSession();
    const requestedUrls: string[] = [];
    let releaseSecondPage: () => void = () => undefined;
    const secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    server.use(
      http.get("/api/v1/finance/projects", async ({ request }) => {
        requestedUrls.push(request.url);
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        if (offset > 0) await secondPageGate;
        return HttpResponse.json({
          data: {
            items: offset === 0
              ? [{ ...baseBucket, status: "pending_design" }, overBudgetBucket]
              : [unknownCompletionBucket, lateCompletionBucket],
            pagination: { limit: 2, offset, total: 4, hasMore: offset === 0 },
            summary: portfolioSummary
          }
        });
      })
    );

    renderApp(["/finance"]);

    expect(await screen.findByRole("heading", { name: "Portfolio finance" })).toBeVisible();
    expect(await screen.findByText("4 client-approved projects")).toBeVisible();
    await waitFor(() => expect(requestedUrls).toHaveLength(2));
    expect(requestedUrls.map((url) => new URL(url).search)).toEqual([
      "?limit=100&offset=0",
      "?limit=100&offset=2"
    ]);
    expect(screen.getByText("2 of 4 loading")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Cedar Apartment" })).not.toBeInTheDocument();
    const projectList = screen.getByRole("heading", { name: "Client-approved project budgets" }).closest("section")!;
    expect(within(projectList).getByRole("list", { name: "Client-approved project budget list" })).toBeVisible();
    expect(within(projectList).getAllByRole("listitem")).toHaveLength(2);
    expect(within(projectList).getAllByRole("article")).toHaveLength(2);

    // The aggregate cards already include every approved project while only
    // the first card page is loaded, proving they come from the API summary.
    const summary = screen.getByLabelText("Finance summary");
    expectKpi(summary, "Client-approved value (incl. GST)", 413_000_000);
    expectKpi(summary, "GST included (18%)", 63_000_000);
    expectKpi(summary, "Net approved revenue (excl. GST)", 350_000_000);
    expectKpi(summary, "Reserved profit target (20%)", 70_000_000);
    expectKpi(summary, "Project cost budget (80%)", 280_000_000);
    expectKpi(summary, "Procurement expenses", 90_000_000);
    expectKpi(summary, "Employee payments", 40_000_000);
    expectKpi(summary, "Other project expenses", 17_000_000);
    expectKpi(summary, "Overheads", 18_000_000);
    expectKpi(summary, "Total recorded expenses", 165_000_000);
    expectKpi(summary, "Remaining cost budget", 115_000_000);
    expect(screen.getByRole("heading", { name: "₹41,30,000.00" })).toBeVisible();
    const budgetFormula = screen.getByLabelText("Portfolio cost budget calculation");
    expect(budgetFormula).toHaveTextContent(`Net revenue after GST${formatPaise(350_000_000)}`);
    expect(budgetFormula).toHaveTextContent(`Reserved profit target (20%)${formatPaise(70_000_000)}`);
    expect(budgetFormula).toHaveTextContent(`Recorded project expenses${formatPaise(165_000_000)}`);
    expect(budgetFormula).toHaveTextContent(`Remaining cost budget${formatPaise(115_000_000)}`);
    // The reserve and remaining budget are stated once, by the formula steps:
    // the separate margin note and gauge repeated those same two figures.
    expect(screen.queryByText(/target margin reserved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/current margin/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "Remaining portfolio cost budget" })
    ).not.toBeInTheDocument();
    const alerts = screen.getByLabelText("Portfolio attention items");
    expect(alerts).toHaveTextContent("1 over budget");
    expect(alerts).toHaveTextContent("1 live overdue");
    expect(alerts).toHaveTextContent("1 completed late");
    expect(alerts).toHaveTextContent("3 overdue tasks");

    const aurora = screen.getByRole("heading", { name: "Aurora Villa" }).closest("article")!;
    expect(within(aurora).getByText("Awaiting design approval")).toBeVisible();
    expect(within(aurora).queryByText("Costs locked")).not.toBeInTheDocument();
    expect(within(aurora).queryByText("Within budget")).not.toBeInTheDocument();
    const approvedValue = within(aurora).getByText("Client-approved value").closest("div")!;
    expect(within(approvedValue).getByText(formatPaise(118_000_000))).toBeVisible();
    const remainingBudget = within(aurora).getByText("Remaining budget").closest("div")!;
    expect(within(remainingBudget).getByText(formatPaise(40_000_000))).toBeVisible();
    expect(within(aurora).queryByText(/recorded expenses|reserved profit|project cost budget/i)).not.toBeInTheDocument();
    expect(within(aurora).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(aurora.querySelector("dl")).not.toBeNull();
    const auroraLink = within(aurora).getByRole("link");
    expect(auroraLink).toHaveAccessibleName("View Aurora Villa financial details");
    expect(auroraLink).toHaveAttribute("href", "/finance/projects/project-one");
    expect(auroraLink.parentElement).toBe(aurora);
    expect(within(aurora).getAllByRole("link")).toHaveLength(1);
    expect(within(aurora).queryByRole("button")).not.toBeInTheDocument();
    expect(within(aurora).getByText("Deadline 15 Sept 2026")).toBeVisible();

    const lakeHouse = screen.getByRole("heading", { name: "Lake House" }).closest("article")!;
    expect(within(lakeHouse).getByText("Over budget")).toBeVisible();
    const budgetOverrun = within(lakeHouse).getByText("Budget overrun").closest("div")!;
    expect(within(budgetOverrun).getByText(formatPaise(5_000_000))).toBeVisible();
    expect(within(lakeHouse).getByText("12d overdue")).toBeVisible();
    expect(within(lakeHouse).getByText("3 overdue tasks")).toBeVisible();
    const lakeHouseLink = within(lakeHouse).getByRole("link");
    expect(lakeHouseLink).toHaveAccessibleName("View Lake House financial details");
    expect(lakeHouseLink).toHaveAttribute("href", "/finance/projects/project%2Ftwo");

    releaseSecondPage();
    const cedar = (await screen.findByRole("heading", { name: "Cedar Apartment" })).closest("article")!;
    expect(within(cedar).getByText("Completion date unavailable")).toBeVisible();
    expect(within(cedar).queryByText("On track")).not.toBeInTheDocument();
    expect(within(cedar).getByText("View financial details")).toBeVisible();

    const maple = screen.getByRole("heading", { name: "Maple Office" }).closest("article")!;
    expect(within(maple).getByText("Completed late")).toBeVisible();
    expect(screen.getByText("4 projects")).toBeVisible();
    const loadedProjectCards = within(projectList).getAllByRole("article");
    expect(within(projectList).getAllByRole("listitem")).toHaveLength(4);
    expect(loadedProjectCards).toHaveLength(4);
    expect(loadedProjectCards.map((card) => within(card).getByRole("heading", { level: 3 }).textContent)).toEqual([
      "Aurora Villa",
      "Lake House",
      "Cedar Apartment",
      "Maple Office"
    ]);
    for (const card of loadedProjectCards) {
      // A single full-card link remains a reliable tap target when the metric
      // grid collapses on narrow screens, without nested interactive controls.
      expect(within(card).getAllByRole("link")).toHaveLength(1);
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
      expect(card.querySelector("dl")).not.toBeNull();
      expect(within(card).getByText("View financial details")).toBeVisible();
    }
  });

  it("opens the selected project's complete financial details from its compact card", async () => {
    installFinanceSession();
    server.use(
      http.get("/api/v1/finance/projects", () =>
        HttpResponse.json({
          data: {
            items: [baseBucket],
            pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
            summary: { ...portfolioSummary, projectCount: 1 }
          }
        })
      ),
      http.get("/api/v1/finance/projects/project-one", () =>
        HttpResponse.json({ data: baseBucket })
      ),
      http.get("/api/v1/finance/projects/project-one/entries", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      )
    );
    const user = userEvent.setup();

    renderApp(["/finance"]);

    expect(await screen.findByText("1 project")).toBeVisible();
    await user.click(screen.getByRole("link", { name: "View Aurora Villa financial details" }));

    expect(await screen.findByRole("heading", { name: "Aurora Villa finance" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Budget detail" })).toBeVisible();
    const calculation = screen.getByLabelText("Project cost budget calculation");
    expect(calculation).toHaveTextContent(`Project cost budget${formatPaise(80_000_000)}`);
    expect(calculation).toHaveTextContent(`Recorded project expenses${formatPaise(40_000_000)}`);
    expect(calculation).toHaveTextContent(`Remaining cost budget${formatPaise(40_000_000)}`);
    expectKpi(screen.getByLabelText("Finance summary"), "Reserved profit target (20%)", 20_000_000);
  });
});

describe("ProjectFinancePanel", () => {
  it("reuses the same idempotency key when a committed request fails at the network boundary and is retried unchanged", async () => {
    installFinanceSession();
    const attempts: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/finance/projects/project-one", () =>
        HttpResponse.json({ data: { ...baseBucket, deadlineStatus: "completed_date_unknown" } })
      ),
      http.get("/api/v1/finance/projects/project-one/entries", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      ),
      http.post("/api/v1/finance/projects/project-one/entries", async ({ request }) => {
        attempts.push(await request.json() as Record<string, unknown>);
        if (attempts.length === 1) return HttpResponse.error();
        return HttpResponse.json({
          data: { entry: {}, bucket: baseBucket, replayed: true }
        }, { status: 200 });
      })
    );
    const user = userEvent.setup();

    renderApp(["/finance/projects/project-one"]);

    await screen.findByLabelText(requiredLabel("Expense class"));
    expect(screen.getByText("Completion date unavailable")).toBeVisible();
    await user.type(screen.getByLabelText(requiredLabel("Category")), "Kitchen hardware");
    await user.type(screen.getByLabelText(requiredLabel("Amount (INR)")), "8750");
    await user.type(screen.getByLabelText(requiredLabel("Description")), "Cabinet fittings procurement");
    await user.click(screen.getByRole("button", { name: "Record cost" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project finance could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Record cost" }));
    expect(await screen.findByText("Project cost recorded.")).toBeVisible();

    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(attempts[1]?.idempotencyKey).toBe(attempts[0]?.idempotencyKey);
  });

  it("records direct costs with an explicit procurement, employee, or other expense class", async () => {
    installFinanceSession();
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/v1/finance/projects/project-one", () =>
        HttpResponse.json({ data: baseBucket })
      ),
      http.get("/api/v1/finance/projects/project-one/entries", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      ),
      http.post("/api/v1/finance/projects/project-one/entries", async ({ request }) => {
        submitted = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ data: { entry: {}, bucket: baseBucket, replayed: false } }, { status: 201 });
      })
    );
    const user = userEvent.setup();

    renderApp(["/finance/projects/project-one"]);

    expect(await screen.findByLabelText(requiredLabel("Expense class"))).toHaveValue("procurement");
    await user.selectOptions(screen.getByLabelText(requiredLabel("Expense class")), "employee_payment");
    await user.type(screen.getByLabelText(requiredLabel("Category")), "Installation crew");
    await user.type(screen.getByLabelText(requiredLabel("Amount (INR)")), "2500");
    await user.type(screen.getByLabelText(requiredLabel("Description")), "Weekly electrician payment");
    await user.click(screen.getByRole("button", { name: "Record cost" }));

    await waitFor(() => {
      expect(submitted).toEqual(expect.objectContaining({
        type: "direct_spend",
        expenseClass: "employee_payment",
        category: "Installation crew",
        amountPaise: 250_000,
        description: "Weekly electrician payment"
      }));
    });
  });

  it("posts a paise-denominated ledger entry and refreshes the bucket and ledger", async () => {
    installFinanceSession();
    const updatedBucket: ProjectFinanceBucket = {
      ...baseBucket,
      overheadPaise: 5_012_345,
      recordedCostPaise: 40_012_345,
      remainingBudgetPaise: 39_987_655,
      currentProfitPaise: 59_987_655,
      currentMarginBps: 5_999,
      version: 4
    };
    let posted = false;
    let postedEntry: FinanceLedgerEntry | null = null;
    let submitted: Record<string, unknown> | null = null;
    let bucketRequests = 0;
    let entryRequests = 0;
    server.use(
      http.get("/api/v1/finance/projects/project-one", () => {
        bucketRequests += 1;
        return HttpResponse.json({ data: posted ? updatedBucket : baseBucket });
      }),
      http.get("/api/v1/finance/projects/project-one/entries", () => {
        entryRequests += 1;
        return HttpResponse.json({
          data: {
            items: postedEntry ? [postedEntry] : [],
            pagination: {
              limit: 100,
              offset: 0,
              total: postedEntry ? 1 : 0,
              hasMore: false
            }
          }
        });
      }),
      http.post("/api/v1/finance/projects/project-one/entries", async ({ request }) => {
        submitted = await request.json() as Record<string, unknown>;
        postedEntry = {
          id: "finance-entry-one",
          bucketId: baseBucket.id,
          projectId: baseBucket.projectId,
          type: "overhead",
          expenseClass: null,
          category: "Site supervision",
          amountPaise: 12_345,
          incurredAt: "2026-08-25T00:00:00.000Z",
          description: "Allocated weekly supervision",
          vendor: "Lisno Site Team",
          reference: "OH-001",
          sourceSectionId: null,
          idempotencyKey: String(submitted.idempotencyKey),
          status: "posted",
          version: 1,
          createdById: "finance-manager-one",
          voidedAt: null,
          voidedById: null,
          voidReason: null,
          createdAt: "2026-08-26T09:00:00.000Z",
          updatedAt: "2026-08-26T09:00:00.000Z"
        };
        posted = true;
        return HttpResponse.json({
          data: {
            entry: postedEntry,
            bucket: updatedBucket,
            replayed: false
          }
        }, { status: 201 });
      })
    );
    const user = userEvent.setup();

    renderApp(["/finance/projects/project-one"]);

    expect(await screen.findByRole("heading", { name: "Aurora Villa finance" })).toBeVisible();
    expect(await screen.findByText("No project costs have been recorded.")).toBeVisible();
    const budgetCalculation = screen.getByLabelText("Project cost budget calculation");
    expect(budgetCalculation).toHaveTextContent(`Project cost budget${formatPaise(80_000_000)}`);
    expect(budgetCalculation).toHaveTextContent(`Recorded project expenses${formatPaise(40_000_000)}`);
    expect(budgetCalculation).toHaveTextContent(`Remaining cost budget${formatPaise(40_000_000)}`);
    expect(screen.getByText("20.00% target margin reserved")).toBeVisible();
    const initialSummary = screen.getByLabelText("Finance summary");
    expectKpi(initialSummary, "Reserved profit target (20%)", 20_000_000);
    expectKpi(initialSummary, "Total recorded expenses", 40_000_000);
    expect(screen.queryByText(/current profit|current margin/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(requiredLabel("Expense class"))).toHaveValue("procurement");
    await user.selectOptions(screen.getByLabelText(requiredLabel("Cost type")), "overhead");
    expect(screen.queryByLabelText(requiredLabel("Expense class"))).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(requiredLabel("Category")), "Site supervision");
    await user.type(screen.getByLabelText(requiredLabel("Amount (INR)")), "123.45");
    await user.clear(screen.getByLabelText(requiredLabel("Incurred date")));
    await user.type(screen.getByLabelText(requiredLabel("Incurred date")), "2026-08-25");
    await user.type(
      screen.getByLabelText(requiredLabel("Description")),
      "Allocated weekly supervision"
    );
    await user.type(screen.getByLabelText("Vendor / payee"), "Lisno Site Team");
    await user.type(screen.getByLabelText("Invoice / reference"), "OH-001");
    await user.click(screen.getByRole("button", { name: "Record cost" }));

    expect(await screen.findByText("Project cost recorded.")).toBeVisible();
    await waitFor(() => {
      expect(submitted).toEqual({
        type: "overhead",
        category: "Site supervision",
        amountPaise: 12_345,
        incurredAt: "2026-08-25T00:00:00.000Z",
        description: "Allocated weekly supervision",
        vendor: "Lisno Site Team",
        reference: "OH-001",
        idempotencyKey: expect.any(String)
      });
      expect(bucketRequests).toBeGreaterThanOrEqual(2);
      expect(entryRequests).toBeGreaterThanOrEqual(2);
    });

    const ledgerEntry = (await screen.findByText("Site supervision")).closest("article")!;
    expect(within(ledgerEntry).getByText(formatPaise(12_345))).toBeVisible();
    expect(within(ledgerEntry).getByText("Overhead · 25 Aug 2026")).toBeVisible();
    expect(within(ledgerEntry).getByText("Allocated weekly supervision")).toBeVisible();
    expect(within(ledgerEntry).getByText("Lisno Site Team · OH-001")).toBeVisible();
    expect(screen.queryByText("No project costs have been recorded.")).not.toBeInTheDocument();

    const summary = screen.getByLabelText("Finance summary");
    expectKpi(summary, "Overheads", 5_012_345);
    expectKpi(summary, "Remaining cost budget", 39_987_655);
    expect(screen.getByLabelText(requiredLabel("Category"))).toHaveValue("");
    expect(screen.getByLabelText(requiredLabel("Amount (INR)"))).toHaveValue(null);
  });
});
