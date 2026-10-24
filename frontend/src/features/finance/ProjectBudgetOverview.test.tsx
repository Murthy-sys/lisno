import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import type { FinanceLedgerEntry, ProjectFinanceBucket } from "../../api/types";
import { server } from "../../test/server";
import { formatPaise } from "./financeFormat";
import { budgetLiquidMetrics } from "./budgetLiquidMetrics";
import { ProjectBudgetCostBreakdown, ProjectBudgetOverview } from "./ProjectBudgetOverview";
import { ProjectFinancePanel } from "./ProjectFinancePanel";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: authMock }));

const bucket: ProjectFinanceBucket = {
  id: "budget-one", projectId: "project-one", projectName: "Murthy Villa", projectStatus: "active",
  estimateId: "estimate-one", estimateVersion: 3, estimateReviewRoundId: "review-one", designPlanVersion: 1,
  currency: "INR", approvedSubtotalPaise: 250_000_000, approvedGstPaise: 45_000_000,
  approvedContractTotalPaise: 295_000_000, targetMarginBps: 2000, targetProfitPaise: 50_000_000,
  costBudgetPaise: 200_000_000, procurementCostPaise: 100_000_000, employeePaymentPaise: 40_000_000,
  otherExpensePaise: 20_000_000, directSpendPaise: 160_000_000, overheadPaise: 20_000_000,
  recordedCostPaise: 180_000_000, remainingBudgetPaise: 20_000_000, currentProfitPaise: 70_000_000,
  currentMarginBps: 2800, overBudget: false, budgetStatus: "at_risk", budgetUtilizationBps: 9000,
  deadlineAt: "2026-12-01T00:00:00Z", overdueDays: 0, deadlineStatus: "on_track", overdueTaskCount: 0,
  status: "open", version: 1, openedAt: "2026-09-01T00:00:00Z", closedAt: null,
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z"
};

function entry(id: string, overhead = false): FinanceLedgerEntry {
  return {
    id, projectId: bucket.projectId, bucketId: bucket.id,
    type: overhead ? "overhead" : "direct_spend", expenseClass: overhead ? null : "other",
    category: overhead ? "Site management" : "Material delivery", amountPaise: 100_000,
    incurredAt: "2026-10-01T00:00:00Z", description: overhead ? "Overhead entry" : "Direct cost entry",
    vendor: null, reference: null, status: "posted", supportingDocument: null,
    sourceSectionId: null, sourceLineItemKey: null, sourceSectionLabel: null, sourceLineItemLabel: null,
    idempotencyKey: `entry-${id}`, version: 1, voidedAt: null, voidedById: null, voidReason: null,
    createdById: "finance-one", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z"
  };
}

function session(permissions = ["finance.bucket.read", "finance.entry.read", "finance.entry.create"]) {
  authMock.mockReturnValue({ user: { id: "admin-one", role: "super_admin" }, authorization: { role: "super_admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } });
}

beforeEach(() => session());

function renderPanel(data = bucket, entries = [entry("direct"), entry("overhead", true)], paginated = false) {
  server.use(
    http.get("/api/v1/finance/projects/project-one", () => HttpResponse.json({ data })),
    http.get("/api/v1/finance/projects/project-one/entries", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      return HttpResponse.json({ data: { items: paginated ? entries.slice(offset, offset + 1) : entries, pagination: { total: entries.length, offset, limit: paginated ? 1 : 100, hasMore: paginated && offset + 1 < entries.length } } });
    })
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProjectFinancePanel projectId="project-one" presentation="project-budget" /></QueryClientProvider>);
}

function summaryRow(label: string) {
  const summary = screen.getByRole("region", { name: "Budget Summary" });
  return within(summary).getByText(label, { exact: true }).closest("div")!;
}

describe("Project budget overview", () => {
  it("reconciles a 25 lakh budget, reserved margin, overhead-inclusive spending and 90% usable consumption", () => {
    render(<ProjectBudgetOverview bucket={bucket} />);
    expect(summaryRow("Total project budget")).toHaveTextContent(formatPaise(250_000_000));
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent(formatPaise(50_000_000));
    expect(summaryRow("Usable budget")).toHaveTextContent(formatPaise(200_000_000));
    expect(summaryRow("Total spending")).toHaveTextContent(`${formatPaise(180_000_000)}90% of usable budget`);
    expect(summaryRow("Overheads")).toHaveTextContent(`${formatPaise(20_000_000)}8% of total budget`);
    expect(summaryRow("Remaining usable budget")).toHaveTextContent(`${formatPaise(20_000_000)}10% of usable budget`);
    const metrics = screen.getByRole("list", { name: "Budget buckets" });
    expect(within(metrics).getByText("Total Budget")).toBeInTheDocument();
    expect(within(metrics).getByText("Budget After Margin")).toBeInTheDocument();
    expect(within(metrics).getByText("Expenses")).toBeInTheDocument();
    expect(within(metrics).getByText("Overheads")).toBeInTheDocument();
    expect(within(metrics).getByText("Reserved Profit (20%)")).toBeInTheDocument();
    expect(metrics).toHaveTextContent("72% of total budget");
    expect(metrics).toHaveTextContent("₹5,00,000.00");
    expect(metrics).not.toHaveTextContent("₹7,00,000.00");
    expect(screen.queryByText("72% of usable budget")).not.toBeInTheDocument();
  });

  it("keeps the signed overrun and utilization above 100% with bounded nonnegative geometry", () => {
    const overrun = { ...bucket, directSpendPaise: 200_000_000, recordedCostPaise: 220_000_000, remainingBudgetPaise: -20_000_000, overBudget: true, budgetStatus: "over_budget" as const };
    const { container } = render(<ProjectBudgetOverview bucket={overrun} />);
    expect(summaryRow("Total spending")).toHaveTextContent("110% of usable budget");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent(formatPaise(-20_000_000));
    expect(screen.getByText("₹2,00,000.00 over usable budget.")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole("list", { name: "Budget buckets" })).toHaveTextContent("88% of total budget");
  });

  it("leaves zero-budget percentages undefined without hiding zero amounts", () => {
    const zero = { ...bucket, approvedSubtotalPaise: 0, targetProfitPaise: 0, costBudgetPaise: 0, directSpendPaise: 0, overheadPaise: 0, recordedCostPaise: 0, remainingBudgetPaise: 0, budgetStatus: "no_budget" as const };
    const { container } = render(<ProjectBudgetOverview bucket={zero} />);
    expect(summaryRow("Total spending")).toHaveTextContent(`${formatPaise(0)}Percentage not defined`);
    expect(screen.getByText("Utilization is not defined because there is no usable budget.")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("preserves exact rounded reserves for unequal projects and never uses current profit", () => {
    const small = { ...bucket, approvedSubtotalPaise: 1667501, targetProfitPaise: 333500, costBudgetPaise: 1334001, recordedCostPaise: 0, overheadPaise: 0, currentProfitPaise: 1667501 };
    const first = budgetLiquidMetrics(bucket);
    const second = budgetLiquidMetrics(small);
    expect(first.map(({ amountPaise, ratio, fill }) => ({ amountPaise, ratio, fill }))).toEqual([
      { amountPaise: 250000000, ratio: 1, fill: 1 },
      { amountPaise: 200000000, ratio: .8, fill: .8 },
      { amountPaise: 180000000, ratio: .72, fill: .72 },
      { amountPaise: 20000000, ratio: .08, fill: .08 },
      { amountPaise: 50000000, ratio: .2, fill: .2 }
    ]);
    expect(second[4].amountPaise).toBe(333500);
    expect(second[1].amountPaise).toBe(1334001);
    expect(second[2].fill).toBe(0);
    expect(second[3].fill).toBe(0);
    render(<ProjectBudgetOverview bucket={{ ...small, remainingBudgetPaise: small.costBudgetPaise }} />);
    const metrics = screen.getByRole("list", { name: "Budget buckets" });
    expect(metrics).toHaveTextContent("₹16,675.01");
    expect(metrics).toHaveTextContent("₹13,340.01");
    expect(metrics).toHaveTextContent("₹3,335.00");
  });

  it("bounds an over-capacity vessel while retaining its true amount and excess", () => {
    const excess = { ...bucket, recordedCostPaise: 300_000_000, directSpendPaise: 280_000_000, remainingBudgetPaise: -100_000_000, budgetStatus: "over_budget" as const };
    const expense = budgetLiquidMetrics(excess)[2];
    expect(expense).toMatchObject({ amountPaise: 300_000_000, ratio: 1.2, fill: 1, excessPaise: 50_000_000 });
    render(<ProjectBudgetOverview bucket={excess} />);
    const metrics = screen.getByRole("list", { name: "Budget buckets" });
    expect(metrics).toHaveTextContent("₹30,00,000.00");
    expect(metrics).toHaveTextContent("120% of total budget");
    expect(metrics).toHaveTextContent("₹5,00,000.00");
    expect(summaryRow("Total spending")).toHaveTextContent("150% of usable budget");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("-₹10,00,000.00");
  });

  it("keeps positive expenses visible when total capacity is zero", () => {
    const noCapacity = { ...bucket, approvedSubtotalPaise: 0, targetProfitPaise: 0, costBudgetPaise: 0, recordedCostPaise: 12550, overheadPaise: 50, directSpendPaise: 12500, remainingBudgetPaise: -12550, budgetStatus: "no_budget" as const };
    expect(budgetLiquidMetrics(noCapacity)[2]).toMatchObject({ amountPaise: 12550, ratio: null, fill: 0, excessPaise: 12550 });
    const { container } = render(<ProjectBudgetOverview bucket={noCapacity} />);
    expect(screen.getByRole("list", { name: "Budget buckets" })).toHaveTextContent("₹125.50");
    expect(summaryRow("Total spending")).toHaveTextContent("Percentage not defined");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("does not infer risk status when backend metadata is absent", () => {
    render(<ProjectBudgetOverview bucket={{ ...bucket, budgetStatus: undefined }} />);
    expect(screen.queryByText("At risk.")).not.toBeInTheDocument();
    expect(screen.queryByText("Within budget.")).not.toBeInTheDocument();
    expect(screen.getByText("90% of usable budget utilized.")).toBeInTheDocument();
  });

  it("uses authoritative cost classes and includes overhead only once in the total", () => {
    render(<ProjectBudgetCostBreakdown bucket={bucket} />);
    const costs = screen.getByRole("region", { name: "Cost Breakdown" });
    expect(costs).toHaveTextContent("Procurement₹10,00,000.00");
    expect(costs).toHaveTextContent("Employee payments₹4,00,000.00");
    expect(costs).toHaveTextContent("Total spending₹18,00,000.00");
  });
});

describe("Project budget sections", () => {
  it("switches sections by keyboard and keeps the existing entry workspace available", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("heading", { name: "Budget Overview" });
    const transactions = screen.getByRole("button", { name: "Transactions" });
    transactions.focus();
    await user.keyboard("{Enter}");
    expect(transactions).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("heading", { name: "Spending and overhead ledger" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Budget Overview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cost Breakdown" }));
    expect(screen.getByRole("region", { name: "Cost Breakdown" })).toHaveTextContent("Total spending₹18,00,000.00");
    await user.click(screen.getByRole("button", { name: "Record project cost" }));
    expect(await screen.findByRole("dialog", { name: "Record project cost" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forecast" })).not.toBeInTheDocument();
  });

  it("filters overheads by authoritative type and can load more when none occur in the loaded page", async () => {
    const user = userEvent.setup();
    renderPanel(bucket, [entry("direct"), entry("overhead", true)], true);
    await screen.findByRole("heading", { name: "Budget Overview" });
    await user.click(screen.getByRole("button", { name: "Overheads" }));
    expect(await screen.findByText("No overheads in the loaded entries.")).toBeInTheDocument();
    expect(screen.getByText(/Partial history:/)).toHaveTextContent("1 of 2 ledger entries loaded");
    expect(screen.queryByText("Material delivery")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more ledger entries" }));
    expect(await screen.findByText("Site management")).toBeInTheDocument();
    expect(screen.queryByText(/Partial history:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Total overheads:/)).toHaveTextContent("₹2,00,000.00");
    await user.click(screen.getByRole("button", { name: "View entry for Site management" }));
    expect(await screen.findByRole("dialog", { name: "Site management" })).toHaveTextContent("Overhead entry");
  });

  it("does not expose cost entry or completion actions without permission", async () => {
    session(["finance.bucket.read", "finance.entry.read"]);
    renderPanel();
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(screen.queryByRole("button", { name: "Record project cost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("blocks the new visual and financial actions on an unsafe approved bucket", async () => {
    renderPanel({ ...bucket, projectId: "another-project" });
    expect(await screen.findByText(/These financial details do not match/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Budget Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record project cost" })).not.toBeInTheDocument();
  });

  it("exposes unsafe ledger lineage even from Overview and disables entry actions", async () => {
    renderPanel(bucket, [{ ...entry("wrong"), bucketId: "wrong-baseline" }]);
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(await screen.findByText(/The spending ledger contains entries from a different project/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record project cost" })).not.toBeInTheDocument();
  });
});
