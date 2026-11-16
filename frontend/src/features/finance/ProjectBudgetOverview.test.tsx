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
import { ProjectFinancePanel, type ProjectFinanceExpectedSource } from "./ProjectFinancePanel";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: authMock }));

function recordedProjection(data: ProjectFinanceBucket): ProjectFinanceBucket {
  return { ...data, commitmentBudget: {
    status: "ready", reasonCodes: [], approvedVendorNetPaise: 0, outstandingVendorCommitmentPaise: 0,
    budgetUsedPaise: data.recordedCostPaise, availableBudgetPaise: data.costBudgetPaise - data.recordedCostPaise,
    utilizationBps: data.costBudgetPaise > 0 ? Math.round(data.recordedCostPaise / data.costBudgetPaise * 10_000) : null,
    budgetStatus: data.budgetStatus ?? "within_budget", overBudget: data.recordedCostPaise > data.costBudgetPaise
  } };
}

const bucket: ProjectFinanceBucket = recordedProjection({
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
});

const roundedBucket = recordedProjection({
  ...bucket,
  projectName: "North Studio",
  approvedSubtotalPaise: 12_125, approvedGstPaise: 2_183,
  approvedContractTotalPaise: 14_300, approvedRoundOffPaise: -8,
  targetProfitPaise: 2_425, costBudgetPaise: 9_700,
  procurementCostPaise: 0, employeePaymentPaise: 0, otherExpensePaise: 0,
  directSpendPaise: 0, overheadPaise: 0, recordedCostPaise: 0,
  remainingBudgetPaise: 9_700, currentProfitPaise: 12_125,
  currentMarginBps: 10_000, budgetStatus: "within_budget" as const, budgetUtilizationBps: 0
});

const secondRoundedBucket: ProjectFinanceBucket = recordedProjection({
  ...roundedBucket,
  id: "budget-two", projectId: "project-two", projectName: "South Workshop",
  estimateId: "estimate-two", estimateVersion: 5, estimateReviewRoundId: "review-two",
  approvedSubtotalPaise: 7_003, approvedGstPaise: 1_261,
  approvedContractTotalPaise: 8_300, approvedRoundOffPaise: 36,
  targetProfitPaise: 1_401, costBudgetPaise: 5_602,
  remainingBudgetPaise: 5_602, currentProfitPaise: 7_003
});

const committedBucket: ProjectFinanceBucket = {
  ...roundedBucket,
  approvedSubtotalPaise: 9_000, approvedGstPaise: 1_620, approvedContractTotalPaise: 10_600,
  approvedRoundOffPaise: -20, targetProfitPaise: 1_800, costBudgetPaise: 7_200,
  remainingBudgetPaise: 7_200, currentProfitPaise: 9_000,
  commitmentBudget: {
    status: "ready", reasonCodes: [], approvedVendorNetPaise: 5_000,
    outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_000,
    availableBudgetPaise: 2_200, utilizationBps: 6_944,
    budgetStatus: "within_budget", overBudget: false
  }
};

function approvedSource(data: ProjectFinanceBucket): ProjectFinanceExpectedSource {
  const { projectId, projectName, estimateId, estimateVersion,
    approvedSubtotalPaise, approvedGstPaise, approvedContractTotalPaise } = data;
  return { projectId, projectName, estimateId, estimateVersion,
    approvedSubtotalPaise, approvedGstPaise, approvedContractTotalPaise };
}

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

function renderPanel(data = bucket, entries = [entry("direct"), entry("overhead", true)], paginated = false, {
  projectId = "project-one", presentation = "project-budget", expectedSource
}: {
  projectId?: string;
  presentation?: "standard" | "project-budget";
  expectedSource?: ProjectFinanceExpectedSource;
} = {}) {
  server.use(
    http.get(`/api/v1/finance/projects/${projectId}`, () => HttpResponse.json({ data })),
    http.get(`/api/v1/finance/projects/${projectId}/entries`, ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      return HttpResponse.json({ data: { items: paginated ? entries.slice(offset, offset + 1) : entries, pagination: { total: entries.length, offset, limit: paginated ? 1 : 100, hasMore: paginated && offset + 1 < entries.length } } });
    })
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProjectFinancePanel projectId={projectId} presentation={presentation} expectedSource={expectedSource} /></QueryClientProvider>);
}

function summaryRow(label: string) {
  const summary = screen.getByRole("region", { name: "Budget Summary" });
  return within(summary).getByText(label, { exact: true }).closest("div")!;
}

async function expectBlockedFinance() {
  expect(await screen.findByText(/These financial details do not match/)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Budget Overview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record project cost" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh financial details" })).toBeEnabled();
}

describe("Project budget overview", () => {
  it("reconciles a 25 lakh budget, reserved margin, overhead-inclusive spending and 90% usable consumption", () => {
    render(<ProjectBudgetOverview bucket={bucket} />);
    expect(summaryRow("Total project budget")).toHaveTextContent(formatPaise(250_000_000));
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent(formatPaise(50_000_000));
    expect(summaryRow("Usable budget")).toHaveTextContent(formatPaise(200_000_000));
    expect(summaryRow("Budget used")).toHaveTextContent(`${formatPaise(180_000_000)}90% of usable budget`);
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
    const overrun = recordedProjection({ ...bucket, directSpendPaise: 200_000_000, recordedCostPaise: 220_000_000, remainingBudgetPaise: -20_000_000, overBudget: true, budgetStatus: "over_budget" as const });
    const { container } = render(<ProjectBudgetOverview bucket={overrun} />);
    expect(summaryRow("Budget used")).toHaveTextContent("110% of usable budget");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent(formatPaise(-20_000_000));
    expect(screen.getByText("₹2,00,000.00 over usable budget.")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole("list", { name: "Budget buckets" })).toHaveTextContent("88% of total budget");
  });

  it("leaves zero-budget percentages undefined without hiding zero amounts", () => {
    const zero = recordedProjection({ ...bucket, approvedSubtotalPaise: 0, targetProfitPaise: 0, costBudgetPaise: 0, directSpendPaise: 0, overheadPaise: 0, recordedCostPaise: 0, remainingBudgetPaise: 0, budgetStatus: "no_budget" as const });
    const { container } = render(<ProjectBudgetOverview bucket={zero} />);
    expect(summaryRow("Budget used")).toHaveTextContent(`${formatPaise(0)}Percentage not defined`);
    expect(screen.getByText("Utilization is not defined because there is no usable budget.")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("preserves exact rounded reserves for unequal projects and never uses current profit", () => {
    const small = recordedProjection({ ...bucket, approvedSubtotalPaise: 1667501, targetProfitPaise: 333500, costBudgetPaise: 1334001, recordedCostPaise: 0, overheadPaise: 0, currentProfitPaise: 1667501 });
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
    const excess = recordedProjection({ ...bucket, recordedCostPaise: 300_000_000, directSpendPaise: 280_000_000, remainingBudgetPaise: -100_000_000, budgetStatus: "over_budget" as const });
    const expense = budgetLiquidMetrics(excess)[2];
    expect(expense).toMatchObject({ amountPaise: 300_000_000, ratio: 1.2, fill: 1, excessPaise: 50_000_000 });
    render(<ProjectBudgetOverview bucket={excess} />);
    const metrics = screen.getByRole("list", { name: "Budget buckets" });
    expect(metrics).toHaveTextContent("₹30,00,000.00");
    expect(metrics).toHaveTextContent("120% of total budget");
    expect(metrics).toHaveTextContent("₹5,00,000.00");
    expect(summaryRow("Budget used")).toHaveTextContent("150% of usable budget");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("-₹10,00,000.00");
  });

  it("keeps positive expenses visible when total capacity is zero", () => {
    const noCapacity = recordedProjection({ ...bucket, approvedSubtotalPaise: 0, targetProfitPaise: 0, costBudgetPaise: 0, recordedCostPaise: 12550, overheadPaise: 50, directSpendPaise: 12500, remainingBudgetPaise: -12550, budgetStatus: "no_budget" as const });
    expect(budgetLiquidMetrics(noCapacity)[2]).toMatchObject({ amountPaise: 12550, ratio: null, fill: 0, excessPaise: 12550 });
    const { container } = render(<ProjectBudgetOverview bucket={noCapacity} />);
    expect(screen.getByRole("list", { name: "Budget buckets" })).toHaveTextContent("₹125.50");
    expect(summaryRow("Budget used")).toHaveTextContent("Percentage not defined");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("does not infer risk status when backend metadata is absent", () => {
    render(<ProjectBudgetOverview bucket={{ ...bucket, commitmentBudget: undefined, budgetStatus: undefined }} />);
    expect(screen.queryByText("At risk.")).not.toBeInTheDocument();
    expect(screen.queryByText("Within budget.")).not.toBeInTheDocument();
    expect(screen.getByText("Budget utilization is unavailable until vendor commitments are reconciled.")).toBeInTheDocument();
  });

  it("uses authoritative cost classes and includes overhead only once in the total", () => {
    render(<ProjectBudgetCostBreakdown bucket={bucket} />);
    const costs = screen.getByRole("region", { name: "Cost Breakdown" });
    expect(costs).toHaveTextContent("Procurement₹10,00,000.00");
    expect(costs).toHaveTextContent("Employee payments₹4,00,000.00");
    expect(costs).toHaveTextContent("Budget used₹18,00,000.00");
  });
});

describe("Project budget sections", () => {
  it("deducts the approved vendor commitment from the usable budget before an expense is recorded", async () => {
    renderPanel(committedBucket, []);
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(summaryRow("Budget used")).toHaveTextContent("₹50.00");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("₹22.00");
    expect(summaryRow("Recorded expenses")).toHaveTextContent("₹0.00");
    expect(summaryRow("Outstanding vendor commitments")).toHaveTextContent("₹50.00");
    expect(summaryRow("Usable budget")).toHaveTextContent("₹72.00");
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent("₹18.00");
  });

  it("keeps usage stable after a linked partial vendor expense is recorded", async () => {
    renderPanel({ ...committedBucket, procurementCostPaise: 3_000, directSpendPaise: 3_000,
      recordedCostPaise: 3_000, remainingBudgetPaise: 4_200, currentProfitPaise: 6_000,
      currentMarginBps: 6_667, commitmentBudget: { ...committedBucket.commitmentBudget!, outstandingVendorCommitmentPaise: 2_000 } }, []);
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(summaryRow("Budget used")).toHaveTextContent("₹50.00");
    expect(summaryRow("Recorded expenses")).toHaveTextContent("₹30.00");
    expect(summaryRow("Outstanding vendor commitments")).toHaveTextContent("₹20.00");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("₹22.00");
    expect(screen.getByRole("listitem", { name: "Expenses" })).toHaveTextContent("₹50.00");
  });

  it("shows commitment-only overruns and preserves the original usable allocation", async () => {
    renderPanel({ ...committedBucket, commitmentBudget: { ...committedBucket.commitmentBudget!,
      approvedVendorNetPaise: 9_000, outstandingVendorCommitmentPaise: 9_000, budgetUsedPaise: 9_000,
      availableBudgetPaise: -1_800, utilizationBps: 12_500, budgetStatus: "over_budget", overBudget: true } }, []);
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(summaryRow("Usable budget")).toHaveTextContent("₹72.00");
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("-₹18.00");
    expect(screen.getByText("₹18.00 over usable budget.")).toBeInTheDocument();
    expect(screen.getByText("Over cost budget")).toBeInTheDocument();
    expect(summaryRow("Recorded expenses")).toHaveTextContent("₹0.00");
  });

  it.each([
    ["missing", undefined], ["null", null], ["malformed", { ...committedBucket.commitmentBudget!, budgetUsedPaise: 0 }],
    ["unresolved", { status: "needs_reconciliation", reasonCodes: ["unlinked_procurement_expense"], approvedVendorNetPaise: 5_000,
      outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null,
      utilizationBps: null, budgetStatus: null, overBudget: null }]
  ])("shows unavailable combined values for a %s projection while retaining recorded finance", async (_label, projection) => {
    renderPanel({ ...committedBucket, commitmentBudget: projection } as ProjectFinanceBucket, []);
    await screen.findByRole("heading", { name: "Budget Overview" });
    const expenses = screen.getByRole("listitem", { name: "Expenses" });
    expect(expenses).toHaveTextContent("UnavailablePercentage unavailable");
    expect(expenses).not.toHaveTextContent("₹0.00");
    expect(expenses).not.toHaveTextContent("0% of total budget");
    expect(screen.getAllByRole("listitem", { name: /Total Budget|Budget After Margin|Expenses|Overheads|Reserved Profit/ })).toHaveLength(5);
    expect(summaryRow("Remaining usable budget")).toHaveTextContent("Unavailable");
    expect(summaryRow("Recorded expenses")).toHaveTextContent("₹0.00");
    expect(summaryRow("Total project budget")).toHaveTextContent("₹90.00");
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent("₹18.00");
    expect(await screen.findByRole("button", { name: "Record project cost" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Refresh financial details" })).toBeEnabled();
    if (_label === "unresolved") expect(summaryRow("Approved vendor commitments")).toHaveTextContent("₹50.00");
  });

  it("keeps the standard panel recorded-cost based even when commitments are present", async () => {
    renderPanel(committedBucket, [], false, { presentation: "standard" });
    const recorded = await screen.findByRole("list", { name: "Cost budget breakdown" });
    expect(within(recorded).getByText("Recorded expenses").closest("li")).toHaveTextContent("₹0.00");
    expect(screen.getByText("left to spend").closest("figcaption")).toHaveTextContent("₹72.00");
    expect(screen.queryByRole("heading", { name: "Budget Overview" })).not.toBeInTheDocument();
    expect(screen.queryByText("₹50.00")).not.toBeInTheDocument();
  });

  it("renders an approved rounded total without changing the net budget or reserved margin", async () => {
    renderPanel(roundedBucket, []);
    expect(await screen.findByRole("heading", { name: "Budget Overview" })).toBeInTheDocument();
    expect(summaryRow("Total project budget")).toHaveTextContent("₹121.25");
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent("₹24.25");
    expect(summaryRow("Usable budget")).toHaveTextContent("₹97.00");
    expect(await screen.findByRole("button", { name: "Record project cost" })).toBeEnabled();
    expect(screen.queryByText(/These financial details do not match/)).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole("region", { name: "Cost Breakdown" })).toHaveTextContent("Budget used₹18,00,000.00");
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

describe("Approved finance total rounding", () => {
  it("accepts a positive adjustment for a different approved project in the standard panel", async () => {
    const user = userEvent.setup();
    renderPanel(secondRoundedBucket, [], false, {
      projectId: "project-two", presentation: "standard", expectedSource: approvedSource(secondRoundedBucket)
    });
    expect(await screen.findByRole("heading", { name: "South Workshop finance" })).toBeInTheDocument();
    const contract = await screen.findByText("Client-approved value (incl. GST)");
    expect(contract.closest("div")).toHaveTextContent("₹83.00");
    expect(screen.getByText("Net approved revenue (excl. GST)").closest("div")).toHaveTextContent("₹70.03");
    expect(screen.getByText("GST included (18%)").closest("div")).toHaveTextContent("₹12.61");
    expect(screen.getByText(/is reserved as profit, leaving/)).toHaveTextContent("₹14.01");
    expect(screen.getByText(/is reserved as profit, leaving/)).toHaveTextContent("₹56.02");
    expect(screen.queryByText(/These financial details do not match/)).not.toBeInTheDocument();
    const recordCost = await screen.findByRole("button", { name: "Record project cost" });
    recordCost.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Record project cost" })).toBeInTheDocument();
  });

  it.each([
    { label: "zero adjustment", data: { ...bucket, approvedRoundOffPaise: 0 } },
    { label: "exactly fifty paise rounded down", data: {
      ...roundedBucket, approvedSubtotalPaise: 12_500, approvedGstPaise: 2_250,
      approvedContractTotalPaise: 14_700, approvedRoundOffPaise: -50,
      targetProfitPaise: 2_500, costBudgetPaise: 10_000,
      remainingBudgetPaise: 10_000, currentProfitPaise: 12_500
    } },
    { label: "legacy exact paise without an adjustment", data: {
      ...roundedBucket, approvedContractTotalPaise: 14_308, approvedRoundOffPaise: undefined
    } }
  ])("accepts $label while preserving approved amounts", async ({ data }) => {
    renderPanel(data, []);
    await screen.findByRole("heading", { name: "Budget Overview" });
    expect(summaryRow("Total project budget")).toHaveTextContent(formatPaise(data.approvedSubtotalPaise));
    expect(summaryRow("Reserved margin (20%)")).toHaveTextContent(formatPaise(data.targetProfitPaise));
    expect(summaryRow("Usable budget")).toHaveTextContent(formatPaise(data.costBudgetPaise));
    expect(screen.getByText("Client-approved value (incl. GST)").closest("div"))
      .toHaveTextContent(formatPaise(data.approvedContractTotalPaise));
    expect(await screen.findByRole("button", { name: "Record project cost" })).toBeEnabled();
    expect(screen.queryByText(/These financial details do not match/)).not.toBeInTheDocument();
  });

  it.each([
    { label: "missing required adjustment", data: { ...roundedBucket, approvedRoundOffPaise: undefined } },
    { label: "inconsistent adjustment", data: { ...roundedBucket, approvedRoundOffPaise: -7 } },
    { label: "fractional adjustment", data: { ...roundedBucket, approvedRoundOffPaise: -8.5 } },
    { label: "unsafe adjustment", data: { ...roundedBucket, approvedRoundOffPaise: Number.MAX_SAFE_INTEGER + 1 } },
    { label: "changed final total", data: { ...roundedBucket, approvedContractTotalPaise: 14_400 } },
    { label: "balanced but out-of-policy adjustment", data: { ...roundedBucket, approvedContractTotalPaise: 14_200, approvedRoundOffPaise: -108 } },
    { label: "fifty paise incorrectly rounded up", data: {
      ...roundedBucket, approvedSubtotalPaise: 12_500, approvedGstPaise: 2_250,
      approvedContractTotalPaise: 14_800, approvedRoundOffPaise: 50,
      targetProfitPaise: 2_500, costBudgetPaise: 10_000,
      remainingBudgetPaise: 10_000, currentProfitPaise: 12_500
    } },
    { label: "missing adjustment on an unsafe total", data: { ...roundedBucket, approvedContractTotalPaise: Number.MAX_SAFE_INTEGER + 1, approvedRoundOffPaise: undefined } }
  ])("rejects $label and blocks financial actions", async ({ data }) => {
    renderPanel(data, []);
    await expectBlockedFinance();
  });

  it.each([
    { label: "null", value: null },
    { label: "string", value: "0" },
    { label: "fractional", value: 0.5 },
    { label: "unsafe", value: Number.MAX_SAFE_INTEGER + 1 }
  ])("rejects an explicit $label adjustment even when subtotal plus GST already equals total", async ({ value }) => {
    const malformedResponse = { ...bucket, approvedRoundOffPaise: value } as unknown as ProjectFinanceBucket;
    renderPanel(malformedResponse, []);
    await expectBlockedFinance();
  });

  it("rejects a valid rounded bucket belonging to the other unequal project", async () => {
    renderPanel(secondRoundedBucket, [], false, { expectedSource: approvedSource(roundedBucket) });
    await expectBlockedFinance();
    expect(screen.queryByText("South Workshop finance")).not.toBeInTheDocument();
    expect(screen.queryByText("₹83.00")).not.toBeInTheDocument();
  });

  it.each([
    { label: "different approved estimate", override: { estimateId: "estimate-other" } },
    { label: "stale approved version", override: { estimateVersion: 2 } },
    { label: "different approved total", override: { approvedContractTotalPaise: 14_400 } }
  ])("retains the expected-source check for a $label", async ({ override }) => {
    renderPanel(roundedBucket, [], false, {
      presentation: "standard", expectedSource: { ...approvedSource(roundedBucket), ...override }
    });
    await expectBlockedFinance();
    expect(screen.queryByText("Client-approved value (incl. GST)")).not.toBeInTheDocument();
  });

  it.each([
    { label: "cost budget", override: { costBudgetPaise: 9_701 } },
    { label: "classified spending", override: { procurementCostPaise: 1 } },
    { label: "recorded spending", override: { recordedCostPaise: 1 } }
  ])("still rejects inconsistent $label with valid rounded contract totals", async ({ override }) => {
    renderPanel({ ...roundedBucket, ...override }, []);
    await expectBlockedFinance();
  });
});
