import type { KpiComponent } from "../../api/types";
import { ProgressBar } from "../ui/ProgressBar";

export function KpiBreakdown({
  components
}: {
  components: KpiComponent[];
}) {
  return (
    <div className="kpi-breakdown" aria-label="KPI component breakdown">
      {components.map((component) => (
        <article className="kpi-component" key={component.key}>
          <div className="kpi-component__heading">
            <div>
              <strong>{component.label}</strong>
              <span>{component.configuredWeight}% weight</span>
            </div>
            <b>{component.score === null ? "—" : Math.round(component.score)}</b>
          </div>
          {component.score === null ? (
            <span className="kpi-component__unavailable">Not available</span>
          ) : (
            <ProgressBar
              value={component.score}
              label={`${component.label}: ${component.score} out of 100`}
            />
          )}
          <p>{component.explanation}</p>
        </article>
      ))}
    </div>
  );
}
