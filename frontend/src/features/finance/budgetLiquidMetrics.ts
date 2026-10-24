import type { ProjectFinanceBucket } from "../../api/types";

export type BudgetLiquidTone = "total" | "usable" | "expense" | "overhead" | "reserve";

export interface BudgetLiquidMetric {
  readonly id: BudgetLiquidTone;
  readonly label: string;
  readonly note: string;
  readonly amountPaise: number;
  /** Unclamped share of approved subtotal, independent of the usable-budget ratio. */
  readonly ratio: number | null;
  readonly fill: number;
  readonly excessPaise: number;
}

export interface BudgetLiquidLayout {
  readonly width: number;
  readonly columns: 1 | 2 | 5;
  readonly rowHeight: number;
  readonly visualHeight: number;
}

export interface BudgetLiquidSceneProps {
  readonly metrics: readonly BudgetLiquidMetric[];
  readonly layout: BudgetLiquidLayout;
  readonly animationActive: boolean;
  readonly onReady: () => void;
  readonly onFailure: () => void;
}

/** Presentation only: no financial baseline or margin is recalculated here. */
export function budgetLiquidMetrics(bucket: ProjectFinanceBucket): readonly BudgetLiquidMetric[] {
  const capacity = bucket.approvedSubtotalPaise;
  const values = [
    { id: "total", label: "Total Budget", note: "Excluding GST", amountPaise: capacity },
    { id: "usable", label: "Budget After Margin", note: "After reserving 20%, before expenses", amountPaise: bucket.costBudgetPaise },
    { id: "expense", label: "Expenses", note: "Includes overheads", amountPaise: bucket.recordedCostPaise },
    { id: "overhead", label: "Overheads", note: "Included in expenses", amountPaise: bucket.overheadPaise },
    { id: "reserve", label: "Reserved Profit (20%)", note: "Reserved margin, not realized profit", amountPaise: bucket.targetProfitPaise }
  ] as const;
  return values.map((metric) => {
    const ratio = capacity > 0 ? metric.amountPaise / capacity : null;
    return {
      ...metric,
      ratio,
      fill: ratio === null ? 0 : Math.max(0, Math.min(1, ratio)),
      excessPaise: Math.max(0, metric.amountPaise - Math.max(0, capacity))
    };
  });
}
