import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectFinanceBucket } from "../../api/types";
import { formatPaise } from "./financeFormat";
import { projectBudgetFiltersFromSearch, projectBudgetPageCsv } from "./projectBudgetList";
import { getProjectBudgetPage, type ProjectBudgetPage } from "./projectFinanceApi";
import { SuperAdminProjectBudgets } from "./SuperAdminProjectBudgets";

vi.mock("./DesignPaymentConfirmations", () => ({ DesignPaymentConfirmations: () => <p>Existing payment workflow</p> }));
vi.mock("./projectFinanceApi", async (importOriginal) => ({ ...await importOriginal<typeof import("./projectFinanceApi")>(), getProjectBudgetPage: vi.fn() }));

const bucket: ProjectFinanceBucket = {
  id: "bucket-one", projectId: "project-one", projectName: "Aurora Villa", projectStatus: "active", clientId: "client-one", clientName: "A Kumar",
  budgetApprovedAt: "2026-09-01T12:00:00Z", budgetStatus: "at_risk", budgetUtilizationBps: 9000,
  estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: "review-one", designPlanVersion: 1, currency: "INR",
  approvedSubtotalPaise: 250_000_000, approvedGstPaise: 45_000_000, approvedContractTotalPaise: 295_000_000,
  targetMarginBps: 2000, targetProfitPaise: 50_000_000, costBudgetPaise: 200_000_000,
  procurementCostPaise: 110_000_000, employeePaymentPaise: 40_000_000, otherExpensePaise: 10_000_000, directSpendPaise: 160_000_000,
  overheadPaise: 20_000_000, recordedCostPaise: 180_000_000, remainingBudgetPaise: 20_000_000,
  currentProfitPaise: 70_000_000, currentMarginBps: 2800, overBudget: false,
  deadlineAt: "2026-12-01T00:00:00Z", overdueDays: 0, deadlineStatus: "on_track", overdueTaskCount: 0, status: "open", version: 1,
  openedAt: "2026-09-02T00:00:00Z", closedAt: null, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z"
};
const unequalBucket: ProjectFinanceBucket = {
  ...bucket, id: "bucket-two", projectId: "project-two", projectName: "Cedar Court", clientId: "client-two", budgetStatus: "over_budget", budgetUtilizationBps: 12500,
  approvedSubtotalPaise: 10_003, approvedGstPaise: 1801, approvedContractTotalPaise: 11_804, targetProfitPaise: 2001, costBudgetPaise: 8002,
  procurementCostPaise: 5000, employeePaymentPaise: 0, otherExpensePaise: 0, directSpendPaise: 5000, overheadPaise: 5003,
  recordedCostPaise: 10_003, remainingBudgetPaise: -2001, currentProfitPaise: 0, currentMarginBps: 0, overBudget: true
};

function response(items = [bucket], total = 2): ProjectBudgetPage {
  return {
    items, pagination: { limit: 10, offset: 0, total, hasMore: total > 10 }, observedAt: "2026-10-24T08:00:00Z",
    filterOptions: {
      projects: [bucket, unequalBucket].map((item) => ({ id: item.projectId, name: item.projectName })),
      clients: [{ id: "client-one", name: "A Kumar" }, { id: "client-two", name: "A Kumar" }], hasUnlinkedClients: true
    },
    summary: {
      projectCount: 2, approvedSubtotalPaise: 250_010_003, approvedGstPaise: 45_001_801, approvedContractTotalPaise: 295_011_804,
      targetProfitPaise: 50_002_001, costBudgetPaise: 200_008_002, procurementCostPaise: 110_005_000, employeePaymentPaise: 40_000_000,
      otherExpensePaise: 10_000_000, directSpendPaise: 160_005_000, overheadPaise: 20_005_003, recordedCostPaise: 180_010_003,
      remainingBudgetPaise: 19_997_999, currentProfitPaise: 70_000_000, currentMarginBps: 2800, overBudgetProjectCount: 1,
      overdueProjectCount: 0, lateCompletedProjectCount: 0, overdueTaskCount: 0
    }
  };
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderList(url = "/finance") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><SuperAdminProjectBudgets /><Location /></MemoryRouter></QueryClientProvider>) };
}

beforeEach(() => { vi.mocked(getProjectBudgetPage).mockReset().mockResolvedValue(response()); });

describe("Super Admin project budgets", () => {
  it("uses matching portfolio totals rather than loaded rows, and shows exact source budget arithmetic", async () => {
    renderList();
    const totals = await screen.findByRole("definition", { name: formatPaise(250_010_003) });
    expect(totals).toHaveTextContent("₹25 L");
    expect(screen.getByRole("definition", { name: formatPaise(50_002_001) })).toBeInTheDocument();
    expect(screen.getByRole("definition", { name: formatPaise(200_008_002) })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 1 of 2 projects")).toBeInTheDocument();
    const row = screen.getByRole("rowheader", { name: /Aurora Villa/ }).closest("tr")!;
    expect(within(row).getByText("90% of usable budget spent")).toBeInTheDocument();
    expect(within(row).getByText("₹18,00,000")).toBeInTheDocument();
    expect(within(row).getAllByText("₹2,00,000")).toHaveLength(2);
    expect(within(row).getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText(/Dates select budgets by approval date/)).toHaveTextContent("current lifetime totals");
    expect(getProjectBudgetPage).toHaveBeenCalledExactlyOnceWith({ limit: 10, offset: 0 });
  });

  it("retains signed overrun and does not infer missing utilization, status, or client identity", async () => {
    vi.mocked(getProjectBudgetPage).mockResolvedValue(response([unequalBucket, { ...bucket, clientId: undefined, clientName: undefined, budgetStatus: undefined, budgetUtilizationBps: null }]));
    renderList();
    const row = (await screen.findByRole("rowheader", { name: /Cedar Court/ })).closest("tr")!;
    expect(within(row).getByText(formatPaise(-2001))).toBeInTheDocument();
    expect(within(row).getByText("125% of usable budget spent")).toBeInTheDocument();
    const unknown = screen.getByRole("rowheader", { name: /Aurora Villa/ }).closest("tr")!;
    expect(within(unknown).getByText("Utilization unavailable")).toBeInTheDocument();
    expect(within(unknown).getByText("Not available")).toBeInTheDocument();
    expect(within(unknown).getByText("Name unavailable")).toBeInTheDocument();
    expect(within(unknown).queryByText("Unlinked client")).not.toBeInTheDocument();
  });

  it("requests only the selected page and resets pagination when a stable client ID filter changes", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectBudgetPage).mockImplementation(async (filters) => ({ ...response([bucket], 24), pagination: { limit: 10, offset: filters?.offset ?? 0, total: 24, hasMore: true } }));
    renderList();
    await screen.findByRole("link", { name: "View details for Aurora Villa" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getProjectBudgetPage).toHaveBeenLastCalledWith({ limit: 10, offset: 10 }));
    expect(await screen.findByText("Showing 11 to 11 of 24 projects")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Client" }), "client-two");
    await waitFor(() => expect(getProjectBudgetPage).toHaveBeenLastCalledWith({ limit: 10, offset: 0, clientId: "client-two" }));
    expect(screen.getByRole("option", { name: "A Kumar (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "A Kumar (2)" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("clientId=client-two");
    expect(screen.getByTestId("location")).not.toHaveTextContent("offset=");
  });

  it("preserves URL selection through detail links and handles combined native filters", async () => {
    const user = userEvent.setup();
    renderList("/finance?search=Aurora&financeStage=open&offset=10");
    const link = await screen.findByRole("link", { name: "View details for Aurora Villa" });
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("returnTo")).toBe("/finance?search=Aurora&financeStage=open&offset=10");
    await user.selectOptions(screen.getByRole("combobox", { name: "Budget status" }), "at_risk");
    await user.selectOptions(screen.getByRole("combobox", { name: "Client" }), "__unlinked__");
    await user.click(screen.getByText("More filters"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Project lifecycle" }), "active");
    await waitFor(() => expect(getProjectBudgetPage).toHaveBeenLastCalledWith({ limit: 10, offset: 0, search: "Aurora", financeStage: "open", budgetStatus: "at_risk", unlinkedClient: true, projectStatus: "active" }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/finance$/);
  });

  it("applies search and inclusive approval dates without treating date input as historical spending", async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByRole("link", { name: "View details for Aurora Villa" });
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "Aurora");
    expect(getProjectBudgetPage).toHaveBeenCalledTimes(1);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(getProjectBudgetPage).toHaveBeenLastCalledWith({ limit: 10, offset: 0, search: "Aurora" }));
    fireEvent.change(screen.getByLabelText("Budget approved from"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Budget approved to"), { target: { value: "2026-09-30" } });
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("start date must be on or before");
    expect(getProjectBudgetPage).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText("Budget approved from"), { target: { value: "2026-09-01" } });
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    await waitFor(() => expect(getProjectBudgetPage).toHaveBeenLastCalledWith({ limit: 10, offset: 0, search: "Aurora", approvedFrom: "2026-09-01", approvedTo: "2026-09-30" }));
  });

  it("labels previous selection during a pending filter change and disables stale export", async () => {
    const user = userEvent.setup();
    let resolveNext!: (page: ProjectBudgetPage) => void;
    vi.mocked(getProjectBudgetPage).mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    renderList();
    await screen.findByRole("link", { name: "View details for Aurora Villa" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), "project-two");
    expect(screen.getByText(/still show the previous selection/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "View details for Aurora Villa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export current page" })).toBeDisabled();
    await act(async () => resolveNext(response([unequalBucket], 1)));
    expect(await screen.findByRole("link", { name: "View details for Cedar Court" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export current page" })).toBeEnabled();
  });

  it("shows actionable load failures and retries, then distinguishes a no-match result", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectBudgetPage).mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce(response([], 0));
    renderList("/finance?search=Missing");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByRole("definition")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "No projects match these filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export current page" })).toBeDisabled();
  });

  it("keeps the wide table in an explicitly labelled keyboard-focusable region and payment workflow in a disclosure", async () => {
    renderList();
    const region = await screen.findByRole("region", { name: "Project budget details" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleDescription("Scroll horizontally to view all budget columns.");
    expect(screen.getByText("Existing payment workflow").closest("details")).not.toHaveAttribute("open");
  });
});

describe("current-page budget CSV", () => {
  it("exports exact paise-to-rupee values and separate matching totals without inventing unreturned rows", () => {
    const csv = projectBudgetPageCsv(response([unequalBucket], 24), { limit: 10, offset: 0, approvedFrom: "2026-09-01", clientId: "client-two" });
    expect(csv).toContain('"Matching projects","24"');
    expect(csv).toContain('"Current page rows","1"');
    expect(csv).toContain('"Reserved margin (20%)","500020.01"');
    expect(csv).toContain('"Total usable budget","2000080.02"');
    expect(csv).toContain('"100.03","100.03","50.03","20.01","80.02","-20.01","125.00"');
    expect(csv).toContain('"Budget approved from (UTC, inclusive)","2026-09-01"');
    expect(csv).toContain("current lifetime totals");
    expect(csv).not.toContain("Aurora Villa");
  });

  it("escapes formula-capable project/client/search text while keeping signed financial values numeric", () => {
    const csv = projectBudgetPageCsv(response([{ ...unequalBucket, projectName: '=HYPERLINK("https://invalid")', clientName: "\t+SUM(1,2)" }]), { search: "@SUM(1,2)" });
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
    expect(csv).toContain('"\'\t+SUM(1,2)"');
    expect(csv).toContain('"\'@SUM(1,2)"');
    expect(csv).toContain('"-20.01"');
    expect(csv).not.toContain('"\'-20.01"');
  });

  it("parses known URL filters without allowing paging overrides or ambiguous client selection", () => {
    expect(projectBudgetFiltersFromSearch(new URLSearchParams("limit=100&offset=-10&clientId=client-one&unlinkedClient=true&budgetStatus=garbage"))).toEqual({ limit: 10, offset: 0, unlinkedClient: true });
  });
});
