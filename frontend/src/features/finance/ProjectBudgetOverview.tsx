import { useId } from "react";

import type { ProjectFinanceBucket } from "../../api/types";
import { formatPaise } from "./financeFormat";
import { budgetLiquidMetrics } from "./budgetLiquidMetrics";
import { BudgetLiquidStage } from "./BudgetLiquidStage";
import "./ProjectBudgetOverview.css";

const percentage = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function share(value: number, total: number) {
  return Number.isFinite(value) && Number.isFinite(total) && total > 0
    ? `${percentage.format(value / total * 100)}%`
    : null;
}

const budgetStatusLabels = {
  over_budget: "Over budget",
  at_risk: "At risk",
  within_budget: "Within budget",
  no_budget: "No usable budget"
} as const;

/** All amounts come from the reconciled bucket; ledger pages never supply totals. */
export function ProjectBudgetOverview({ bucket }: { bucket: ProjectFinanceBucket }) {
  const titleId = useId();
  const utilization = share(bucket.recordedCostPaise, bucket.costBudgetPaise);
  const overheadShare = share(bucket.overheadPaise, bucket.approvedSubtotalPaise);
  const remainingShare = share(bucket.remainingBudgetPaise, bucket.costBudgetPaise);
  const overrun = bucket.remainingBudgetPaise < 0;
  const status = bucket.budgetStatus ? budgetStatusLabels[bucket.budgetStatus] : null;
  const rows = [
    { label: "Total project budget", hint: "Excluding GST", amount: bucket.approvedSubtotalPaise, ratio: share(bucket.approvedSubtotalPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "total" },
    { label: "Reserved margin (20%)", hint: "Reserved, not usable", amount: bucket.targetProfitPaise, ratio: share(bucket.targetProfitPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "reserve" },
    { label: "Usable budget", hint: "After the reserved margin", amount: bucket.costBudgetPaise, ratio: share(bucket.costBudgetPaise, bucket.approvedSubtotalPaise), denominator: "of total budget", tone: "usable" },
    { label: "Total spending", hint: "Includes overheads", amount: bucket.recordedCostPaise, ratio: utilization, denominator: "of usable budget", tone: "spending" },
    { label: "Overheads", hint: "Included in total spending", amount: bucket.overheadPaise, ratio: overheadShare, denominator: "of total budget", tone: "overhead" },
    { label: "Remaining usable budget", hint: overrun ? "Negative balance is the budget overrun" : "Available to spend", amount: bucket.remainingBudgetPaise, ratio: remainingShare, denominator: "of usable budget", tone: overrun ? "overrun" : "remaining" }
  ];

  return <div className="project-budget-overview">
    <section className="project-budget-overview__visual" aria-labelledby={titleId}>
      <h3 id={titleId}>Budget Overview</h3>
      <BudgetLiquidStage metrics={budgetLiquidMetrics(bucket)} />
      {overrun ? <p className="project-budget-overview__overrun"><strong>{formatPaise(Math.abs(bucket.remainingBudgetPaise))} over usable budget.</strong> Expenses have exceeded the budget available after the reserved margin.</p> : null}
    </section>

    <div className="project-budget-overview__information">
      <section className="project-budget-overview__summary" aria-label="Budget Summary">
        <h3>Budget Summary</h3>
        <dl>{rows.map((row) => <div key={row.label} data-tone={row.tone}>
          <dt>{row.label}<small>{row.hint}</small></dt>
          <dd><strong>{formatPaise(row.amount)}</strong>{row.ratio ? <small>{row.ratio} {row.denominator}</small> : <small>Percentage not defined</small>}</dd>
        </div>)}</dl>
      </section>
      <section className="project-budget-overview__insights" aria-label="Budget insights">
        <h3>Budget insights</h3>
        <ul>
          {status ? <li><strong>{status}.</strong>{bucket.budgetStatus === "at_risk" ? " At least 90% of the usable budget is consumed on this unfinished project." : null}</li> : null}
          <li>{utilization ? `${utilization} of usable budget utilized.` : "Utilization is not defined because there is no usable budget."}</li>
          <li>{overrun ? `${formatPaise(Math.abs(bucket.remainingBudgetPaise))} exceeds the usable budget.` : `${formatPaise(bucket.remainingBudgetPaise)} remains available to spend.`}</li>
          {overheadShare ? <li>Overheads are {overheadShare} of total project budget and are included in spending.</li> : null}
          <li>{formatPaise(bucket.targetProfitPaise)} is reserved and is not usable budget.</li>
        </ul>
      </section>
    </div>
  </div>;
}

export function ProjectBudgetCostBreakdown({ bucket }: { bucket: ProjectFinanceBucket }) {
  const rows = [
    { label: "Procurement", value: bucket.procurementCostPaise },
    { label: "Employee payments", value: bucket.employeePaymentPaise },
    { label: "Other project expenses", value: bucket.otherExpensePaise },
    { label: "Overheads", value: bucket.overheadPaise }
  ];
  return <section className="project-budget-costs" aria-label="Cost Breakdown">
    <h3>Cost Breakdown</h3>
    <p>Current lifetime amounts from the project finance summary. Overheads are included in total spending.</p>
    <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><strong>{formatPaise(row.value)}</strong><small>{share(row.value, bucket.recordedCostPaise) ? `${share(row.value, bucket.recordedCostPaise)} of total spending` : "No recorded spending"}</small></dd></div>)}
      <div className="project-budget-costs__total"><dt>Total spending</dt><dd><strong>{formatPaise(bucket.recordedCostPaise)}</strong></dd></div>
    </dl>
  </section>;
}
