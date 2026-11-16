import { useId } from "react";

import type { ProjectFinanceBucket } from "../../api/types";
import { formatPaise } from "./financeFormat";
import { budgetLiquidMetrics } from "./budgetLiquidMetrics";
import { BudgetLiquidStage } from "./BudgetLiquidStage";
import { readProjectCommitmentBudget } from "./projectCommitmentBudget";
import "./ProjectBudgetOverview.css";

const percentage = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function share(value: number | null, total: number) {
  return value !== null && Number.isFinite(value) && Number.isFinite(total) && total > 0
    ? `${percentage.format(value / total * 100)}%`
    : null;
}

const budgetStatusLabels = {
  over_budget: "Over budget",
  at_risk: "At risk",
  within_budget: "Within budget",
  no_budget: "No usable budget"
} as const;

/** All amounts come from the reconciled backend projection; ledger pages never supply totals. */
export function ProjectBudgetOverview({ bucket }: { bucket: ProjectFinanceBucket }) {
  const titleId = useId();
  const commitment = readProjectCommitmentBudget(bucket);
  const budget = commitment.ready ? commitment.budget : null;
  const used = budget?.budgetUsedPaise ?? null;
  const available = budget?.availableBudgetPaise ?? null;
  const utilization = budget?.utilizationBps == null ? null : `${percentage.format(budget.utilizationBps / 100)}%`;
  const overheadShare = share(bucket.overheadPaise, bucket.approvedSubtotalPaise);
  const remainingShare = share(available, bucket.costBudgetPaise);
  const overrun = available !== null && available < 0;
  const status = budget?.budgetStatus ? budgetStatusLabels[budget.budgetStatus] : null;
  const rows = [
    { label: "Total project budget", hint: "Excluding GST", amount: bucket.approvedSubtotalPaise, ratio: share(bucket.approvedSubtotalPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "total" },
    { label: "Reserved margin (20%)", hint: "Reserved, not usable", amount: bucket.targetProfitPaise, ratio: share(bucket.targetProfitPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "reserve" },
    { label: "Usable budget", hint: "After the reserved margin", amount: bucket.costBudgetPaise, ratio: share(bucket.costBudgetPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "usable" },
    { label: "Budget used", hint: "Recorded costs + outstanding commitments", amount: used, ratio: utilization, denominator: "of usable budget", tone: "spending" },
    { label: "Recorded expenses", hint: "Includes recorded overheads", amount: bucket.recordedCostPaise, ratio: share(bucket.recordedCostPaise, bucket.costBudgetPaise), denominator: "of usable budget", tone: "spending" },
    { label: "Outstanding vendor commitments", hint: "Approved vendor costs not yet recorded", amount: budget?.outstandingVendorCommitmentPaise ?? null, ratio: null, denominator: "", tone: "spending" },
    ...(!commitment.ready && commitment.budget?.approvedVendorNetPaise != null ? [{ label: "Approved vendor commitments", hint: "Before matching recorded expenses", amount: commitment.budget.approvedVendorNetPaise, ratio: null, denominator: "", tone: "spending" }] : []),
    { label: "Overheads", hint: "Included in recorded expenses and budget usage", amount: bucket.overheadPaise, ratio: overheadShare, denominator: "of total budget", tone: "overhead" },
    { label: "Remaining usable budget", hint: overrun ? "Negative balance is the budget overrun" : "After recorded costs and outstanding commitments", amount: available, ratio: remainingShare, denominator: "of usable budget", tone: overrun ? "overrun" : "remaining" }
  ];

  return <div className="project-budget-overview">
    <section className="project-budget-overview__visual" aria-labelledby={titleId}>
      <h3 id={titleId}>Budget Overview</h3>
      {commitment.message ? <p role="status">{commitment.message}</p> : null}
      <BudgetLiquidStage metrics={budgetLiquidMetrics(bucket)} />
      {overrun ? <p className="project-budget-overview__overrun"><strong>{formatPaise(Math.abs(available!))} over usable budget.</strong> Recorded costs and outstanding commitments exceed the budget after the reserved margin.</p> : null}
    </section>

    <div className="project-budget-overview__information">
      <section className="project-budget-overview__summary" aria-label="Budget Summary">
        <h3>Budget Summary</h3>
        <dl>{rows.map((row) => <div key={row.label} data-tone={row.tone}>
          <dt>{row.label}<small>{row.hint}</small></dt>
          <dd><strong>{row.amount === null ? "Unavailable" : formatPaise(row.amount)}</strong>{row.ratio ? <small>{row.ratio} {row.denominator}</small> : row.denominator ? <small>{row.amount === null ? "Percentage unavailable" : "Percentage not defined"}</small> : null}</dd>
        </div>)}</dl>
      </section>
      <section className="project-budget-overview__insights" aria-label="Budget insights">
        <h3>Budget insights</h3>
        <ul>
          {status ? <li><strong>{status}.</strong>{budget?.budgetStatus === "at_risk" ? " At least 90% of the usable budget is used or committed on this unfinished project." : null}</li> : null}
          <li>{utilization ? `${utilization} of usable budget utilized.` : commitment.ready ? bucket.costBudgetPaise === 0 ? "Utilization is not defined because there is no usable budget." : "Budget utilization is unavailable." : "Budget utilization is unavailable until vendor commitments are reconciled."}</li>
          {available !== null ? <li>{overrun ? `${formatPaise(Math.abs(available))} exceeds the usable budget.` : `${formatPaise(available)} remains available after outstanding commitments.`}</li> : null}
          {overheadShare ? <li>Overheads are {overheadShare} of total project budget and are included in recorded expenses.</li> : null}
          <li>{formatPaise(bucket.targetProfitPaise)} is reserved and is not usable budget.</li>
        </ul>
      </section>
    </div>
  </div>;
}

export function ProjectBudgetCostBreakdown({ bucket }: { bucket: ProjectFinanceBucket }) {
  const commitment = readProjectCommitmentBudget(bucket);
  const budget = commitment.ready ? commitment.budget : null;
  const rows = [
    { label: "Procurement", value: bucket.procurementCostPaise },
    { label: "Employee payments", value: bucket.employeePaymentPaise },
    { label: "Other project expenses", value: bucket.otherExpensePaise },
    { label: "Overheads", value: bucket.overheadPaise }
  ];
  return <section className="project-budget-costs" aria-label="Cost Breakdown">
    <h3>Cost Breakdown</h3>
    <p>Recorded costs and outstanding approved vendor commitments. Overheads are included in recorded expenses.</p>
    {commitment.message ? <p role="status">{commitment.message}</p> : null}
    <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><strong>{formatPaise(row.value)}</strong><small>{share(row.value, bucket.recordedCostPaise) ? `${share(row.value, bucket.recordedCostPaise)} of recorded expenses` : "No recorded spending"}</small></dd></div>)}
      <div><dt>Recorded expenses</dt><dd><strong>{formatPaise(bucket.recordedCostPaise)}</strong></dd></div>
      <div><dt>Outstanding vendor commitments</dt><dd><strong>{budget?.outstandingVendorCommitmentPaise == null ? "Unavailable" : formatPaise(budget.outstandingVendorCommitmentPaise)}</strong></dd></div>
      {!commitment.ready && commitment.budget?.approvedVendorNetPaise != null ? <div><dt>Approved vendor commitments</dt><dd><strong>{formatPaise(commitment.budget.approvedVendorNetPaise)}</strong></dd></div> : null}
      <div className="project-budget-costs__total"><dt>Budget used</dt><dd><strong>{budget?.budgetUsedPaise == null ? "Unavailable" : formatPaise(budget.budgetUsedPaise)}</strong></dd></div>
    </dl>
  </section>;
}
