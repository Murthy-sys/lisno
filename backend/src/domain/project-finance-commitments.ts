import { financeRiskFactors } from "./super-admin-dashboard.js";

export type FinanceCommitmentReason = "unlinked_procurement_expense" | "invalid_order_source" | "invalid_expense_linkage";
export type FinanceCommitmentStatus = "over_budget" | "at_risk" | "within_budget" | "no_budget";
interface CommitmentAmounts {
  status: "ready" | "needs_reconciliation";
  reasonCodes: FinanceCommitmentReason[];
  approvedVendorNetPaise: number | null;
  outstandingVendorCommitmentPaise: number | null;
  budgetUsedPaise: number | null;
  availableBudgetPaise: number | null;
}
export interface ProjectFinanceCommitmentBudget extends CommitmentAmounts {
  utilizationBps: number | null;
  budgetStatus: FinanceCommitmentStatus | null;
  overBudget: boolean | null;
}
export interface PortfolioFinanceCommitmentBudget extends CommitmentAmounts {
  unresolvedProjectCount: number;
  overBudgetProjectCount: number | null;
}
export type CommitmentSourceRow = Readonly<Record<string, unknown>>;
export interface FinanceCommitmentSources {
  orders: readonly CommitmentSourceRow[];
  revisions: readonly CommitmentSourceRow[];
  entries: readonly CommitmentSourceRow[];
}
const REASONS: readonly FinanceCommitmentReason[] = ["unlinked_procurement_expense", "invalid_order_source", "invalid_expense_linkage"];
const isId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isPaise = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isVersion = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const safeNumber = (value: bigint): number | null => value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
const cancelled = (order: CommitmentSourceRow) => order.cancelledAt != null || order.status === "cancelled";
const hasApproval = (order: CommitmentSourceRow) => order.approvedRevisionId != null || order.approvedRevision != null ||
  order.approvedNetPaise != null || order.approvedGstPaise != null || order.approvedTotalPaise != null || order.status === "approved";

function validTotals(net: unknown, gst: unknown, total: unknown): net is number {
  return isPaise(net) && isPaise(gst) && isPaise(total) && BigInt(net) + BigInt(gst) === BigInt(total);
}

/** An amendment's draft is irrelevant: only the retained approved revision establishes the obligation. */
function approvedNet(order: CommitmentSourceRow, revision: CommitmentSourceRow | undefined): number | null {
  if (!revision || !isId(order._id) || !isId(order.projectId) || !isId(order.vendorId) ||
    !isId(order.approvedRevisionId) || !isVersion(order.approvedRevision) ||
    revision._id !== order.approvedRevisionId || revision.orderId !== order._id || revision.projectId !== order.projectId ||
    revision.vendorId !== order.vendorId || revision.revision !== order.approvedRevision ||
    (revision.tenderAwardId ?? null) !== (order.tenderAwardId ?? null) ||
    !isId(revision.estimateId) || !isVersion(revision.estimateVersion) ||
    !validTotals(order.approvedNetPaise, order.approvedGstPaise, order.approvedTotalPaise) ||
    !validTotals(revision.netPaise, revision.gstPaise, revision.totalPaise) ||
    revision.netPaise !== order.approvedNetPaise || revision.gstPaise !== order.approvedGstPaise || revision.totalPaise !== order.approvedTotalPaise ||
    !Array.isArray(revision.lines) || revision.lines.length === 0) return null;
  const ids = new Set<string>();
  let net = 0n, gst = 0n, total = 0n;
  for (const value of revision.lines) {
    if (typeof value !== "object" || value === null) return null;
    const line = value as CommitmentSourceRow;
    if (!isId(line.id) || ids.has(line.id) || !validTotals(line.netPaise, line.gstPaise, line.totalPaise)) return null;
    ids.add(line.id);
    net += BigInt(line.netPaise as number); gst += BigInt(line.gstPaise as number); total += BigInt(line.totalPaise as number);
  }
  return net === BigInt(revision.netPaise as number) && gst === BigInt(revision.gstPaise as number) &&
    total === BigInt(revision.totalPaise as number) ? order.approvedNetPaise : null;
}

/** Read-only budget usage. No bid, payment, invoice or ledger record is manufactured. */
export function projectFinanceCommitmentBudget(input: FinanceCommitmentSources & {
  projectId: string;
  projectCompleted: boolean;
  costBudgetPaise: number;
  recordedCostPaise: number;
}): ProjectFinanceCommitmentBudget {
  if (!isPaise(input.costBudgetPaise) || !isPaise(input.recordedCostPaise)) throw new TypeError("Finance budget amounts must be safe nonnegative paise.");
  const reasons = new Set<FinanceCommitmentReason>();
  const orders = new Map<string, CommitmentSourceRow>();
  const revisions = new Map<string, CommitmentSourceRow>();
  for (const revision of input.revisions) {
    if (!isId(revision._id)) { reasons.add("invalid_order_source"); continue; }
    if (revisions.has(revision._id) && JSON.stringify(revisions.get(revision._id)) !== JSON.stringify(revision)) reasons.add("invalid_order_source");
    revisions.set(revision._id, revision);
  }
  const commitments = new Map<string, number>();
  const awards = new Set<string>();
  for (const order of input.orders) {
    if (!isId(order._id) || order.projectId !== input.projectId) { reasons.add("invalid_order_source"); continue; }
    const previous = orders.get(order._id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(order)) reasons.add("invalid_order_source");
      continue;
    }
    orders.set(order._id, order);
    if (cancelled(order) || !hasApproval(order)) continue;
    const net = approvedNet(order, revisions.get(String(order.approvedRevisionId)));
    if (net === null) { reasons.add("invalid_order_source"); continue; }
    if (isId(order.tenderAwardId)) {
      if (awards.has(order.tenderAwardId)) reasons.add("invalid_order_source");
      awards.add(order.tenderAwardId);
    }
    commitments.set(order._id, net);
  }
  const linked = new Map<string, bigint>();
  const entryIds = new Set<string>();
  let procurementSpend = 0n;
  for (const entry of input.entries) {
    if (entry.status !== "posted" || entry.type !== "direct_spend" || entry.expenseClass !== "procurement") continue;
    if (entry.projectId !== input.projectId || !isId(entry._id) || entryIds.has(entry._id) || !isPaise(entry.amountPaise) || entry.amountPaise === 0) {
      reasons.add("invalid_expense_linkage"); continue;
    }
    entryIds.add(entry._id);
    procurementSpend += BigInt(entry.amountPaise);
    if (entry.purchaseOrderId == null) {
      if (entry.paymentMilestoneId != null) reasons.add("invalid_expense_linkage");
      if (commitments.size > 0 || reasons.has("invalid_order_source")) reasons.add("unlinked_procurement_expense");
      continue;
    }
    const order = isId(entry.purchaseOrderId) ? orders.get(entry.purchaseOrderId) : undefined;
    if (!order || !isId(entry.paymentMilestoneId) || !hasApproval(order) ||
      approvedNet(order, revisions.get(String(order.approvedRevisionId))) === null) {
      reasons.add("invalid_expense_linkage"); continue;
    }
    const id = entry.purchaseOrderId as string;
    linked.set(id, (linked.get(id) ?? 0n) + BigInt(entry.amountPaise));
  }
  if (procurementSpend > BigInt(input.recordedCostPaise)) reasons.add("invalid_expense_linkage");
  let committed = 0n, outstanding = 0n;
  for (const [id, amount] of commitments) {
    committed += BigInt(amount);
    const remainder = BigInt(amount) - (linked.get(id) ?? 0n);
    if (remainder > 0n) outstanding += remainder;
  }
  if (safeNumber(committed) === null) reasons.add("invalid_order_source");
  const used = safeNumber(BigInt(input.recordedCostPaise) + outstanding);
  if (used === null) reasons.add("invalid_expense_linkage");
  const approvedVendorNetPaise = reasons.has("invalid_order_source") ? null : Number(committed);
  if (reasons.size > 0) return { status: "needs_reconciliation", reasonCodes: REASONS.filter(reason => reasons.has(reason)),
    approvedVendorNetPaise, outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null,
    utilizationBps: null, budgetStatus: null, overBudget: null };
  const budgetUsedPaise = used!;
  const risk = financeRiskFactors({ projectId: input.projectId, projectCompleted: input.projectCompleted,
    costBudgetPaise: input.costBudgetPaise, recordedCostPaise: budgetUsedPaise });
  const availableBudgetPaise = input.costBudgetPaise - budgetUsedPaise;
  return { status: "ready", reasonCodes: [], approvedVendorNetPaise, outstandingVendorCommitmentPaise: Number(outstanding),
    budgetUsedPaise, availableBudgetPaise,
    utilizationBps: input.costBudgetPaise === 0 ? null : safeNumber((BigInt(budgetUsedPaise) * 10_000n + BigInt(input.costBudgetPaise) / 2n) / BigInt(input.costBudgetPaise)),
    budgetStatus: risk.some(item => item.level === "red") ? "over_budget" : input.costBudgetPaise === 0 ? "no_budget" :
      risk.some(item => item.level === "yellow") ? "at_risk" : "within_budget",
    overBudget: availableBudgetPaise < 0 };
}

export function portfolioFinanceCommitmentBudget(projects: readonly ProjectFinanceCommitmentBudget[]): PortfolioFinanceCommitmentBudget {
  const unresolvedProjectCount = projects.filter(project => project.status !== "ready").length;
  const reasons = new Set(projects.flatMap(project => project.reasonCodes));
  const sum = (key: "approvedVendorNetPaise" | "outstandingVendorCommitmentPaise" | "budgetUsedPaise" | "availableBudgetPaise") => {
    let total = 0n;
    for (const project of projects) {
      const value = project[key];
      if (value === null) return null;
      total += BigInt(value);
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new TypeError("Finance commitment portfolio exceeds safe integer paise.");
    return Number(total);
  };
  return { status: unresolvedProjectCount ? "needs_reconciliation" : "ready", reasonCodes: REASONS.filter(reason => reasons.has(reason)),
    approvedVendorNetPaise: sum("approvedVendorNetPaise"),
    outstandingVendorCommitmentPaise: unresolvedProjectCount ? null : sum("outstandingVendorCommitmentPaise"),
    budgetUsedPaise: unresolvedProjectCount ? null : sum("budgetUsedPaise"),
    availableBudgetPaise: unresolvedProjectCount ? null : sum("availableBudgetPaise"),
    unresolvedProjectCount, overBudgetProjectCount: unresolvedProjectCount ? null : projects.filter(project => project.overBudget).length };
}
