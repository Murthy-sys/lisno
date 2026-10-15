import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { FinanceOverviewWorkspace, FinanceLedger, ProjectFinanceWorkspace } from "./FinanceWorkspace";
import { InvoiceAssessment } from "./FinanceWorkOrderAssessments";
import { useNativeWorkspace, type NativeContext } from "../admin/nativeWorkspace";
import { ApiError } from "../../core/http/apiClient";
import type { AuthenticatedSession } from "../../contracts/session";
import { KnowledgeDetailProvider } from "../knowledge/knowledgeDetailUi";
import { formatBps, formatPaise, dateOnlyIso, parseNonnegativeHundredths } from "./money";
import { financeArithmeticValid, financeBucketValid } from "./financeIntegrity";
import type { ProjectFinanceBucket } from "./financeTypes";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../admin/nativeWorkspace", () => ({ ...jest.requireActual("../admin/nativeWorkspace"), useNativeWorkspace: jest.fn() }));
jest.mock("./FinanceEntryForm", () => ({ FinanceWorkspace: () => null }));
const page = (items: unknown[], total = items.length) => ({ items, pagination: { total, limit: 20, offset: 0, hasMore: total > items.length } });
const summary = { projectCount: 2, approvedContractTotalPaise: 1234567, approvedGstPaise: 188323, approvedSubtotalPaise: 1046244, targetProfitPaise: 209249, costBudgetPaise: 836995, procurementCostPaise: 300001, employeePaymentPaise: 99001, otherExpensePaise: 77777, directSpendPaise: 476779, overheadPaise: 12001, recordedCostPaise: 488780, remainingBudgetPaise: 348215, currentProfitPaise: 557464, currentMarginBps: 5328, overBudgetProjectCount: 1, overdueProjectCount: 0, lateCompletedProjectCount: 0, overdueTaskCount: 0 };
const bucket = { ...summary, id: "bucket-a", currency: "INR", projectId: "project-a", projectName: "North residence", projectStatus: "active", estimateId: "estimate-a", estimateVersion: 4, approvedContractTotalPaise: 345678, approvedSubtotalPaise: 292948, approvedGstPaise: 52730, targetMarginBps: 2000, targetProfitPaise: 58590, costBudgetPaise: 234358, procurementCostPaise: 100001, employeePaymentPaise: 10000, otherExpensePaise: 5000, directSpendPaise: 115001, overheadPaise: 5000, recordedCostPaise: 120001, remainingBudgetPaise: 114357, currentProfitPaise: 172947, currentMarginBps: 5904, overBudget: false, status: "open", deadlineAt: "2026-12-10T00:00:00Z", deadlineStatus: "on_track" };
const order = { id: "order-a", projectId: "project-a", orderNumber: "WO-A", vendorName: "Synthetic fabrication", netPaise: 100001, gstPaise: 18000, totalPaise: 118001 };
function setup(role = "finance_head") {
  const get = jest.fn(); const post = jest.fn(); const share = jest.fn(async () => undefined); const release = jest.fn(async () => undefined); const download = jest.fn(() => ({ result: Promise.resolve({ share, release }) }));
  const c = { http: { get, post, patch: jest.fn() }, transfers: { download }, session: { user: { id: "actor-a", role } }, scope: "test:actor-a", ready: true, can: jest.fn(() => true), key: (...parts: unknown[]) => ["test", "actor-a", "finance-buckets", ...parts], refresh: jest.fn(async () => undefined), guards: { current: new Map() }, navigate: (action: () => void) => action() } as unknown as NativeContext;
  jest.mocked(useNativeWorkspace).mockReturnValue(c); const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const show = async (node: React.ReactNode) => render(<QueryClientProvider client={client}><KnowledgeDetailProvider>{node}</KnowledgeDetailProvider></QueryClientProvider>);
  return { c, get, post, download, share, release, show, client };
}

it("uses backend portfolio totals for unequal projects, never the visible page subtotal", async () => {
  const t = setup(); t.get.mockResolvedValue({ ...page([bucket], 2), summary });
  await t.show(<FinanceOverviewWorkspace session={t.c.session} />);
  await screen.findByText("Approved contract: ₹12,345.67");
  expect(screen.getByText("Contract ₹3,456.78 · Recorded cost ₹1,200.01")).toBeTruthy();
  expect(screen.getByText("Current margin excluding GST: 53.28%")).toBeTruthy();
  expect(screen.getByText("Current profit: ₹5,574.64")).toBeTruthy();
});

it("rejects finance data for a different project instead of presenting another baseline", async () => {
  const t = setup(); t.get.mockResolvedValue(bucket);
  await t.show(<ProjectFinanceWorkspace projectId="project-b" session={t.c.session} />);
  await screen.findByText("The approved finance source could not be verified.");
  expect(screen.queryByText("North residence")).toBeNull(); expect(t.post).not.toHaveBeenCalled();
});

it("shows exact ledger amounts, classes and approved source labels and releases private receipts", async () => {
  const t = setup(); t.get.mockResolvedValue(page([{ id: "entry-a", bucketId: "bucket-a", projectId: "project-a", category: "Joinery", type: "direct_spend", expenseClass: "procurement", amountPaise: 12345, incurredAt: "2026-10-10T00:00:00Z", createdAt: "2026-10-11T00:00:00Z", description: "Approved fitting", status: "posted", vendor: null, reference: "INV-A", sourceSectionId: "private-section-id", sourceLineItemKey: "private-item-id", sourceSectionLabel: "Carpentry", sourceLineItemLabel: "Wardrobe", supportingDocument: { originalFilename: "receipt.pdf", mimeType: "application/pdf" } }]));
  await t.show(<FinanceLedger context={t.c} projectId="project-a" bucketId="bucket-a" />);
  await screen.findByText(/₹123.45/); await fireEvent.press(screen.getByRole("button", { name: "View entry for Joinery" }));
  expect(screen.getByText("Estimate section: Carpentry")).toBeTruthy(); expect(screen.getByText("Estimate item: Wardrobe")).toBeTruthy(); expect(screen.queryByText("private-item-id")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Open receipt receipt.pdf" }));
  await waitFor(() => expect(t.release).toHaveBeenCalledTimes(1));
  expect(t.download).toHaveBeenCalledWith(expect.objectContaining({ path: "/finance/projects/project-a/entries/entry-a/document" })); expect(t.share).toHaveBeenCalledTimes(1);
});

it("keeps Super Admin invoice assessments read-only with backend net payable", async () => {
  const t = setup("super_admin"); t.get.mockResolvedValue({ order, assessment: { orderId: "order-a", version: 3, invoiceNumber: "INV-A", invoiceDate: "2026-10-01", invoiceEvidenceReference: "Receipt A", invoiceTotalPaise: 118001, tdsBasisPaise: 100001, tdsRateBasisPoints: 125, tdsPaise: 1250, netPayablePaise: 116751, withholdingEffectiveDate: "2026-10-01", withholdingRuleReference: "Rule A", assessedAt: "2026-10-02T00:00:00Z" } });
  await t.show(<InvoiceAssessment context={t.c} projectId="project-a" orderId="order-a" onClose={jest.fn()} />);
  await screen.findByText("Saved net payable: ₹1,167.51"); expect(screen.getByLabelText("Invoice total (INR)").props.editable).toBe(false); expect(screen.queryByRole("button", { name: "Save invoice assessment" })).toBeNull(); expect(t.post).not.toHaveBeenCalled();
});

it("captures finance invoice CAS and retries the identical uncertain command", async () => {
  const t = setup(); t.get.mockResolvedValue({ order, assessment: null }); t.post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Lost response")).mockResolvedValueOnce({ orderId: "order-a", version: 1 });
  await t.show(<InvoiceAssessment context={t.c} projectId="project-a" orderId="order-a" onClose={jest.fn()} />);
  await screen.findByLabelText("Invoice number");
  for (const [label, value] of [["Invoice number", "INV-1"], ["Invoice date (YYYY-MM-DD)", "2026-10-01"], ["Invoice evidence reference", "Receipt A"], ["Invoice total (INR)", "1180.01"], ["TDS basis (INR)", "1000.01"], ["TDS rate (%)", "1.25"], ["Withholding effective date (YYYY-MM-DD)", "2026-10-01"], ["Withholding rule reference", "Rule A"], ["Assessment reason", "Verified original invoice"]]) await fireEvent.changeText(screen.getByLabelText(label!), value!);
  await fireEvent.press(screen.getByRole("button", { name: "Save invoice assessment" })); await screen.findByRole("button", { name: "Retry same request" }); expect(screen.getByLabelText("Invoice number").props.editable).toBe(false); expect(screen.getByRole("button", { name: "Close assessment" })).toBeDisabled();
  // The original command committed, but its response was lost. A refetch must
  // neither remount the command nor replace its frozen version/idempotency key.
  t.get.mockResolvedValue({ order, assessment: { orderId: "order-a", version: 1, invoiceNumber: "INV-1", invoiceDate: "2026-10-01", invoiceEvidenceReference: "Receipt A", invoiceTotalPaise: 118001, tdsBasisPaise: 100001, tdsRateBasisPoints: 125, tdsPaise: 1250, netPayablePaise: 116751, withholdingEffectiveDate: "2026-10-01", withholdingRuleReference: "Rule A", assessedAt: "2026-10-02T00:00:00Z" } });
  await act(async () => { await t.client.invalidateQueries(); });
  expect(await screen.findByRole("button", { name: "Load current assessment" })).toBeDisabled();
  expect(screen.getByLabelText("Assessment reason").props.value).toBe("Verified original invoice");
  expect(screen.getByRole("button", { name: "Save invoice assessment" })).toBeDisabled();
  t.get.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Read unavailable"));
  await act(async () => { await t.client.invalidateQueries(); });
  await screen.findByText("The latest assessment could not be verified. Your draft is retained; reload before saving.");
  expect(screen.getByRole("button", { name: "Retry same request" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Retry same request" })); await waitFor(() => expect(t.post).toHaveBeenCalledTimes(2));
  expect(t.post.mock.calls[0]).toEqual(t.post.mock.calls[1]); expect(t.post.mock.calls[0]?.[1]).toMatchObject({ expectedVersion: 0, invoiceTotalPaise: 118001, tdsBasisPaise: 100001, tdsRateBasisPoints: 125, idempotencyKey: expect.any(String) });
});

it("keeps a stale invoice draft until explicit reload and uses the reviewed new version", async () => {
  const t = setup();
  const saved = { orderId: "order-a", version: 3, invoiceNumber: "INV-A", invoiceDate: "2026-10-01", invoiceEvidenceReference: "Receipt A", invoiceTotalPaise: 118001, tdsBasisPaise: 100001, tdsRateBasisPoints: 125, tdsPaise: 1250, netPayablePaise: 116751, withholdingEffectiveDate: "2026-10-01", withholdingRuleReference: "Rule A", assessedAt: "2026-10-02T00:00:00Z" };
  t.get.mockResolvedValue({ order, assessment: saved });
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find(button => button.style === "destructive")?.onPress?.());
  await t.show(<InvoiceAssessment context={t.c} projectId="project-a" orderId="order-a" onClose={jest.fn()} />);
  await screen.findByLabelText("Invoice number");
  await fireEvent.changeText(screen.getByLabelText("Invoice number"), "UNSAVED-DRAFT");
  t.get.mockResolvedValue({ order, assessment: { ...saved, version: 4, invoiceNumber: "INV-CURRENT", invoiceTotalPaise: 150001 } });
  await act(async () => { await t.client.invalidateQueries(); });
  await screen.findByRole("button", { name: "Load current assessment" });
  expect(screen.getByLabelText("Invoice number").props.value).toBe("UNSAVED-DRAFT");
  expect(screen.getByRole("button", { name: "Save invoice assessment" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Save invoice assessment" }));
  expect(t.post).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Load current assessment" }));
  await waitFor(() => expect(screen.getByLabelText("Invoice number").props.value).toBe("INV-CURRENT"));
  expect(screen.getByLabelText("Invoice total (INR)").props.value).toBe("1500.01");
  await fireEvent.changeText(screen.getByLabelText("Assessment reason"), "Verified updated assessment");
  t.post.mockResolvedValue({ orderId: "order-a", version: 5 });
  await fireEvent.press(screen.getByRole("button", { name: "Save invoice assessment" }));
  await waitFor(() => expect(t.post).toHaveBeenCalledWith("/finance/work-orders/order-a/invoice-assessment", expect.objectContaining({ expectedVersion: 4, invoiceTotalPaise: 150001, invoiceNumber: "INV-CURRENT" })));
  alert.mockRestore();
});

it("clears the retained assessment and retry controls when its read is denied", async () => {
  const t = setup();
  t.get.mockResolvedValue({ order, assessment: { orderId: "order-a", version: 3, invoiceNumber: "INV-PRIVATE", invoiceDate: "2026-10-01", invoiceEvidenceReference: "Receipt A", invoiceTotalPaise: 118001, tdsBasisPaise: 100001, tdsRateBasisPoints: 125, tdsPaise: 1250, netPayablePaise: 116751, withholdingEffectiveDate: "2026-10-01", withholdingRuleReference: "Rule A", assessedAt: "2026-10-02T00:00:00Z" } });
  t.post.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Lost response"));
  await t.show(<InvoiceAssessment context={t.c} projectId="project-a" orderId="order-a" onClose={jest.fn()} />);
  await screen.findByLabelText("Invoice number");
  await fireEvent.changeText(screen.getByLabelText("Assessment reason"), "Verify invoice");
  await fireEvent.press(screen.getByRole("button", { name: "Save invoice assessment" }));
  await screen.findByRole("button", { name: "Retry same request" });
  t.get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed"));
  await act(async () => { await t.client.invalidateQueries(); });
  await waitFor(() => expect(screen.queryByLabelText("Invoice number")).toBeNull());
  expect(screen.queryByText(/Synthetic fabrication/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry same request" })).toBeNull();
});

it("keeps invalid money and dates unavailable without inventing zero baselines", () => {
  expect(formatPaise(undefined)).toBe("Unavailable"); expect(formatPaise(12.5)).toBe("Unavailable"); expect(formatPaise(0)).toBe("₹0.00"); expect(formatBps(null)).toBe("Unavailable"); expect(parseNonnegativeHundredths("0.00")).toBe(0); expect(parseNonnegativeHundredths("1.125")).toBeNull(); expect(dateOnlyIso("2026-02-30")).toBeNull();
});

it("rejects non-reconciling overhead, altered approved baselines and mismatched projects", () => {
  const value = bucket as unknown as ProjectFinanceBucket;
  expect(financeBucketValid(value, "project-a")).toBe(true);
  expect(financeBucketValid(value, "project-b")).toBe(false);
  expect(financeBucketValid({ ...value, overheadPaise: value.overheadPaise + 1 }, "project-a")).toBe(false);
  expect(financeBucketValid({ ...value, targetProfitPaise: value.targetProfitPaise + 1 }, "project-a")).toBe(false);
  expect(financeArithmeticValid(summary)).toBe(true);
  expect(financeArithmeticValid({ ...summary, recordedCostPaise: summary.recordedCostPaise + 100 })).toBe(false);
});
