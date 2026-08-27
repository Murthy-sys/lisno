import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { KpiBreakdown } from "./KpiBreakdown";
import { KpiScore } from "./KpiScore";
import { Field, Select } from "../ui/Field";
import { Surface } from "../ui/Surface";
import { kpiQueryOptions, reviewPeriod } from "../../features/designer/designerApi";

/**
 * The shared performance panel. Designers and every operational or worker role
 * score on the same KPI: components that need design data report "not
 * available" for operational work and their weight redistributes, so one panel
 * serves both without a role-specific variant.
 */
export function KpiPanel({ userId }: { userId: string }) {
  const [periodOffset, setPeriodOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const period = reviewPeriod(periodOffset);
  const kpiQuery = useQuery(kpiQueryOptions(userId, period));

  if (kpiQuery.isPending || kpiQuery.isError) return null;
  const kpi = kpiQuery.data;

  return (
    <Surface as="section" className="designer-kpi" aria-labelledby="kpi-title">
      <div className="designer-kpi__summary">
        <div className="designer-kpi__identity">
          <p className="eyebrow">Personal performance</p>
          <h2 id="kpi-title">KPI overview</h2>
        </div>
        <KpiScore score={kpi.score} />
        <div className="designer-kpi__controls">
          <Field
            id="reporting-period"
            className="designer-kpi__period"
            label="Reporting period"
          >
            {(controlProps) => (
              <Select
                {...controlProps}
                value={periodOffset}
                onChange={(event) => setPeriodOffset(Number(event.target.value))}
              >
                <option value={0}>Current month</option>
                <option value={-1}>Previous month</option>
              </Select>
            )}
          </Field>
          <button
            type="button"
            className="designer-kpi__toggle"
            aria-expanded={expanded}
            aria-controls="designer-kpi-breakdown"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide breakdown" : "Show breakdown"}
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="designer-kpi__content" id="designer-kpi-breakdown">
          <KpiBreakdown components={kpi.components} />
        </div>
      ) : null}
    </Surface>
  );
}
