import { useId, type ReactNode } from "react";

import type {
  ProjectFinanceBucket,
  ProjectFinancePortfolioSummary
} from "../../api/types";
import { formatBps, formatPaise, formatShare } from "./financeFormat";

/*
 * One chart, shared by the portfolio dashboard and a single project: a ring
 * showing how much of the approved cost budget each expense class has consumed,
 * with the remaining budget as the unfilled track. Every amount the ring
 * encodes is also listed beside it, so no value is reachable only by hovering
 * an arc.
 */

interface FinanceSegment {
  key: string;
  label: string;
  valuePaise: number;
  /** Chart palette slot; see --finance-chart-* in tokens.css. */
  swatch: string;
}

const RING_RADIUS = 54;
const RING_STROKE = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Surface gap between arcs, in the same user units as the radius. */
const RING_GAP = 3;

/** The money a ring needs; both the per-project bucket and the portfolio summary carry it. */
export interface FinanceRingPosition {
  approvedContractTotalPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
}

export function ProjectFinanceChart({ bucket }: { bucket: ProjectFinanceBucket }) {
  return (
    <FinanceRingChart
      position={bucket}
      caption={
        <>
          Client-approved value including GST. {formatBps(bucket.targetMarginBps)}
          {" "}({formatPaise(bucket.targetProfitPaise)}) is reserved as profit, leaving
          {" "}{formatPaise(bucket.costBudgetPaise)} as the project cost budget.
        </>
      }
    />
  );
}

export function PortfolioFinanceChart({
  summary
}: {
  summary: ProjectFinancePortfolioSummary;
}) {
  return (
    <FinanceRingChart
      eyebrow="Live portfolio position"
      position={summary}
      caption={
        <>
          Client-approved value including GST across {summary.projectCount}
          {" "}{summary.projectCount === 1 ? "project" : "projects"}.
          {" "}{formatPaise(summary.approvedGstPaise)} GST is excluded and
          {" "}{formatPaise(summary.targetProfitPaise)} reserved as profit before budgeting.
        </>
      }
      footer={
        <ul className="finance-chart__alerts" aria-label="Portfolio attention items">
          <li data-empty={summary.overBudgetProjectCount === 0 ? "true" : undefined}>
            <strong>{summary.overBudgetProjectCount}</strong> over budget
          </li>
          <li data-empty={summary.overdueProjectCount === 0 ? "true" : undefined}>
            <strong>{summary.overdueProjectCount}</strong> live overdue
          </li>
          <li data-empty={summary.lateCompletedProjectCount === 0 ? "true" : undefined}>
            <strong>{summary.lateCompletedProjectCount}</strong> completed late
          </li>
          <li data-empty={summary.overdueTaskCount === 0 ? "true" : undefined}>
            <strong>{summary.overdueTaskCount}</strong> overdue tasks
          </li>
        </ul>
      }
    />
  );
}

function FinanceRingChart({
  position: bucket,
  caption,
  eyebrow = "Approved commercial baseline",
  footer
}: {
  position: FinanceRingPosition;
  caption: ReactNode;
  eyebrow?: string;
  footer?: ReactNode;
}) {
  const headingId = useId();
  const budgetHealthy = bucket.remainingBudgetPaise >= 0;
  const segments: FinanceSegment[] = [
    { key: "procurement", label: "Procurement", valuePaise: bucket.procurementCostPaise, swatch: "spend-procurement" },
    { key: "employee", label: "Employee payments", valuePaise: bucket.employeePaymentPaise, swatch: "spend-employee" },
    { key: "other", label: "Other expenses", valuePaise: bucket.otherExpensePaise, swatch: "spend-other" },
    { key: "overhead", label: "Overheads", valuePaise: bucket.overheadPaise, swatch: "spend-overhead" }
  ];
  /* Over budget the ring is full, so it scales to what was actually recorded. */
  const ringTotalPaise = Math.max(bucket.costBudgetPaise, bucket.recordedCostPaise);

  let consumed = 0;
  const arcs = segments
    .filter((segment) => segment.valuePaise > 0)
    .map((segment) => {
      const length = ringTotalPaise > 0
        ? (segment.valuePaise / ringTotalPaise) * RING_CIRCUMFERENCE
        : 0;
      const arc = {
        segment,
        start: consumed,
        drawn: length > RING_GAP * 2 ? length - RING_GAP : Math.max(length, 1.5)
      };
      consumed += length;
      return arc;
    });

  return (
    <section className="finance-chart" aria-labelledby={headingId}>
      <header className="finance-chart__header">
        <p className="eyebrow">{eyebrow}</p>
        <p className="finance-chart__figure" id={headingId}>
          {formatPaise(bucket.approvedContractTotalPaise)}
        </p>
        <p className="finance-chart__caption">{caption}</p>
      </header>

      <div className="finance-chart__body">
        <figure className="finance-chart__gauge">
          <div className="finance-chart__ring">
            <svg
              viewBox="0 0 140 140"
              role="img"
              aria-label={`Cost budget consumed: ${segments
                .map((segment) => `${segment.label} ${formatPaise(segment.valuePaise)}`)
                .join(", ")}, of a ${formatPaise(bucket.costBudgetPaise)} cost budget`}
            >
              <g transform="rotate(-90 70 70)">
                <circle
                  className="finance-chart__ring-track"
                  cx="70"
                  cy="70"
                  r={RING_RADIUS}
                  strokeWidth={RING_STROKE}
                />
                {arcs.map(({ segment, start, drawn }) => (
                  <circle
                    key={segment.key}
                    className={`finance-chart__arc finance-chart__arc--${segment.swatch}`}
                    cx="70"
                    cy="70"
                    r={RING_RADIUS}
                    strokeWidth={RING_STROKE}
                    strokeDasharray={`${drawn} ${RING_CIRCUMFERENCE - drawn}`}
                    strokeDashoffset={-start}
                  >
                    {/* role="img" on the svg keeps these out of the accessibility
                        tree; the title is the hover readout. */}
                    <title>
                      {`${segment.label} · ${formatPaise(segment.valuePaise)} · ${formatShare(segment.valuePaise, ringTotalPaise)}`}
                    </title>
                  </circle>
                ))}
                {budgetHealthy ? null : (
                  /* Where the approved cost budget sits on a ring that overran it. */
                  <line
                    className="finance-chart__ring-threshold"
                    x1="70"
                    y1={70 - RING_RADIUS - RING_STROKE / 2 - 4}
                    x2="70"
                    y2={70 - RING_RADIUS + RING_STROKE / 2 + 4}
                    transform={`rotate(${(bucket.costBudgetPaise / ringTotalPaise) * 360} 70 70)`}
                  />
                )}
              </g>
            </svg>
            <p className={`finance-chart__ring-center finance-chart__ring-center--${budgetHealthy ? "healthy" : "risk"}`}>
              <strong>{formatShare(bucket.recordedCostPaise, bucket.costBudgetPaise)}</strong>
              <span>of cost budget spent</span>
            </p>
          </div>
          <figcaption
            className={`finance-chart__gauge-caption finance-chart__gauge-caption--${budgetHealthy ? "healthy" : "risk"}`}
          >
            <strong>{formatPaise(Math.abs(bucket.remainingBudgetPaise))}</strong>
            <span>{budgetHealthy ? "left to spend" : "over the cost budget"}</span>
          </figcaption>
        </figure>

        <ul className="finance-chart__breakdown" aria-label="Cost budget breakdown">
          {segments.map((segment) => (
            <li key={segment.key} data-empty={segment.valuePaise === 0 ? "true" : undefined}>
              <span
                className={`finance-chart__swatch finance-chart__swatch--${segment.swatch}`}
                aria-hidden="true"
              />
              <span>{segment.label}</span>
              <strong>{formatPaise(segment.valuePaise)}</strong>
            </li>
          ))}
          <li className="finance-chart__breakdown-total">
            <span aria-hidden="true" />
            <span>Recorded expenses</span>
            <strong>{formatPaise(bucket.recordedCostPaise)}</strong>
          </li>
          <li className="finance-chart__breakdown-limit">
            <span aria-hidden="true" />
            <span>Approved cost budget</span>
            <strong>{formatPaise(bucket.costBudgetPaise)}</strong>
          </li>
        </ul>
      </div>

      {footer}
    </section>
  );
}
