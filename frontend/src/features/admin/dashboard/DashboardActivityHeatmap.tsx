import { useRef, useState } from "react";
import { ChartFigure } from "../../../components/charts";
import { chartUtcDate, getVisibleDashboardChartDataset, projectCreationHeatmapDataset } from "./dashboardChartData";
import type { SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DashboardActivityHeatmap({ data }: { data: SuperAdminDashboardOverview }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const dataset = getVisibleDashboardChartDataset(projectCreationHeatmapDataset(data));
  if (!dataset || dataset.rows.length === 0) return null;
  const rows = dataset.rows;
  const maximum = Math.max(1, ...rows.map((row) => row.values[0] ?? 0));
  const offset = (new Date(`${rows[0].id}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((offset + rows.length) / 7);
  const selected = rows.find((row) => row.id === selectedId) ?? [...rows].reverse().find((row) => row.values[0] !== null) ?? rows[0];
  const description = (index: number) => `${rows[index].label}: ${rows[index].values[0] === null ? "No observation available" : `${rows[index].values[0]!.toLocaleString("en-IN")} projects created`}`;

  return <ChartFigure
    title={dataset.title}
    subtitle={dataset.subtitle}
    className="dashboard-reference-chart dashboard-activity-heatmap"
    table={{ caption: "Exact daily projects-created counts in UTC.", columns: ["Date (UTC)", "Projects created"], rows: rows.map((row) => ({ header: row.id, cells: [row.values[0] === null ? "No observation available" : row.values[0]] })) }}
    footnote={dataset.footnote}
  >
    <div className="dashboard-heatmap-calendar" aria-label="Daily projects created">
      <div className="dashboard-heatmap-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="dashboard-heatmap-days" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {rows.map((row, index) => {
          const value = row.values[0];
          const level = value === null ? "unknown" : value === 0 ? "0" : String(Math.max(1, Math.ceil(value * 4 / maximum)));
          return <button
            key={row.id}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            className="dashboard-heatmap-day"
            data-level={level}
            aria-label={description(index)}
            aria-pressed={selected.id === row.id}
            title={description(index)}
            tabIndex={selected.id === row.id ? 0 : -1}
            onFocus={() => setSelectedId(row.id)}
            onClick={() => setSelectedId(row.id)}
            onKeyDown={(event) => {
              const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
              const target = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : delta === undefined ? null : Math.min(rows.length - 1, Math.max(0, index + delta));
              if (target === null) return;
              event.preventDefault();
              buttons.current[target]?.focus();
            }}
          ><span aria-hidden="true">{new Date(`${row.id}T00:00:00.000Z`).getUTCDate()}</span></button>;
        })}
      </div>
    </div>
    <div className="dashboard-heatmap-scale" aria-label="Activity intensity"><span>Less activity</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} aria-hidden="true" />)}<span>More activity</span>{rows.some((row) => row.values[0] === null) ? <span className="dashboard-heatmap-unknown"><i data-level="unknown" aria-hidden="true" />No observation</span> : null}</div>
    <p className="dashboard-chart-selected-value" role="status"><strong>{chartUtcDate(selected.id)}</strong><span>{selected.values[0] === null ? "No observation available" : `${selected.values[0].toLocaleString("en-IN")} projects created`}</span></p>
  </ChartFigure>;
}
