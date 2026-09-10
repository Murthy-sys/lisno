import { useEffect, useId, useRef, useState } from "react";

import type { ProjectFinancePortfolioSummary } from "../../../api/types";
import { MeterChart, seriesColor } from "../../../components/charts";
import { formatBps, formatPaise, formatShare } from "../../finance/financeFormat";

/*
 * The portfolio-wide cost picture, laid out as a stack of bars rather than a
 * ring: one bar per spend category (identity colour, matching the donuts
 * elsewhere on this dashboard), a row of filled pills for the attention
 * counts, then the two "live" ratios (budget consumed, margin) as the same
 * MeterChart already used by every other ratio on this page. A fresh
 * component rather than a change to FinanceRingChart/ProjectFinanceChart,
 * which this same card also backs on the per-project finance page and the
 * (separate) finance role's own overview page — this bar treatment is only
 * asked for here. The header keeps the shared `.finance-chart__*` classes
 * so that top section of the card stays pixel-identical to the ring version
 * it replaces; everything below it is new, dashboard-only markup.
 */

interface FinanceBarSegment {
  key: string;
  label: string;
  valuePaise: number;
  color: string;
}

export function DashboardPortfolioFinanceChart({ summary }: { summary: ProjectFinancePortfolioSummary }) {
  const headingId = useId();
  const budgetHealthy = summary.remainingBudgetPaise >= 0;

  const rootRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (inView) return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const segments: FinanceBarSegment[] = [
    { key: "procurement", label: "Procurement", valuePaise: summary.procurementCostPaise, color: seriesColor(0) },
    { key: "employee", label: "Employee payments", valuePaise: summary.employeePaymentPaise, color: seriesColor(1) },
    { key: "other", label: "Other expenses", valuePaise: summary.otherExpensePaise, color: seriesColor(2) },
    { key: "overhead", label: "Overheads", valuePaise: summary.overheadPaise, color: seriesColor(3) }
  ];
  const compositionTotalPaise = segments.reduce((sum, segment) => sum + segment.valuePaise, 0);

  const budgetShare = summary.costBudgetPaise > 0 ? summary.recordedCostPaise / summary.costBudgetPaise : 0;
  const marginShare = summary.currentMarginBps === null ? null : summary.currentMarginBps / 10_000;

  return (
    <section ref={rootRef} className="finance-chart dashboard-finance-card" aria-labelledby={headingId}>
      <header className="finance-chart__header">
        <p className="eyebrow">Live portfolio position</p>
        <p className="finance-chart__figure" id={headingId}>
          {formatPaise(summary.approvedContractTotalPaise)}
        </p>
        <p className="finance-chart__caption">
          Client-approved value including GST across {summary.projectCount}
          {" "}{summary.projectCount === 1 ? "project" : "projects"}.
          {" "}{formatPaise(summary.approvedGstPaise)} GST is excluded and
          {" "}{formatPaise(summary.targetProfitPaise)} reserved as profit before budgeting.
        </p>
      </header>

      <div className="dashboard-finance-composition">
        <p className="dashboard-finance-composition__title">Spend composition</p>
        <ul className="dashboard-finance-bars">
          {segments.map((segment) => {
            const widthPercent = compositionTotalPaise > 0 ? (segment.valuePaise / compositionTotalPaise) * 100 : 0;
            return (
              <li key={segment.key} data-empty={segment.valuePaise === 0 ? "true" : undefined}>
                <div className="dashboard-finance-bars__row">
                  <span className="dashboard-finance-bars__swatch" aria-hidden="true" style={{ background: segment.color }} />
                  <span className="dashboard-finance-bars__label">{segment.label}</span>
                  <strong className="dashboard-finance-bars__value">
                    {formatPaise(segment.valuePaise)} · {formatShare(segment.valuePaise, compositionTotalPaise)}
                  </strong>
                </div>
                <div
                  className="dashboard-finance-bars__track"
                  role="img"
                  aria-label={`${segment.label}: ${formatPaise(segment.valuePaise)}, ${formatShare(segment.valuePaise, compositionTotalPaise)} of recorded spend`}
                >
                  <span
                    className={`dashboard-finance-bars__fill${inView ? " dashboard-finance-bars__fill--in-view" : ""}`}
                    style={{ width: `${inView ? widthPercent : 0}%`, background: segment.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="dashboard-finance-pills" aria-label="Portfolio attention items">
        <li data-tone="critical" data-empty={summary.overBudgetProjectCount === 0 ? "true" : undefined}>
          <strong>{summary.overBudgetProjectCount}</strong> over budget
        </li>
        <li data-tone="warning" data-empty={summary.overdueProjectCount === 0 ? "true" : undefined}>
          <strong>{summary.overdueProjectCount}</strong> live overdue
        </li>
        <li data-tone="warning" data-empty={summary.lateCompletedProjectCount === 0 ? "true" : undefined}>
          <strong>{summary.lateCompletedProjectCount}</strong> completed late
        </li>
        <li data-tone="critical" data-empty={summary.overdueTaskCount === 0 ? "true" : undefined}>
          <strong>{summary.overdueTaskCount}</strong> overdue tasks
        </li>
      </ul>

      <div className="dashboard-finance-meters">
        <MeterChart
          size="compact"
          label="Cost budget consumed"
          value={budgetShare}
          valueText={`${Math.round(budgetShare * 100)}%`}
          status={budgetHealthy ? "good" : "critical"}
          detail={
            budgetHealthy
              ? `${formatPaise(summary.remainingBudgetPaise)} left to spend · of ${formatPaise(summary.costBudgetPaise)} approved`
              : `${formatPaise(Math.abs(summary.remainingBudgetPaise))} over budget · of ${formatPaise(summary.costBudgetPaise)} approved`
          }
        />
        <MeterChart
          size="compact"
          label="Current margin (live)"
          value={marginShare}
          valueText={marginShare === null ? formatBps(summary.currentMarginBps) : `${Math.round(marginShare * 100)}%`}
          status={marginShare !== null && marginShare >= 0.1 ? "good" : "warning"}
        />
      </div>

      <dl className="dashboard-finance-notes">
        <div>
          <dt>Approved net revenue, excluding GST</dt>
          <dd>{formatPaise(summary.approvedSubtotalPaise)}</dd>
        </div>
        <div>
          <dt>Current profit (live)</dt>
          <dd>{formatPaise(summary.currentProfitPaise)}</dd>
        </div>
      </dl>
    </section>
  );
}
