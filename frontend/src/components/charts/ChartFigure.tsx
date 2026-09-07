import { useId, useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";

/*
 * The frame every chart is mounted in.
 *
 * It owns the parts that are the same for all of them: the heading block, the
 * legend, the table-view twin, and the two states a chart can be in without
 * being wrong — unavailable (the metric could not be verified) and empty (there
 * is nothing to plot yet). Those states are distinct on purpose: an empty chart
 * and a suppressed chart must never look alike.
 *
 * The table view is not an extra. It is the relief channel that makes the
 * lighter categorical slots legal, and the WCAG-clean equivalent of every mark
 * on the canvas, so it is always rendered — collapsed, never omitted.
 */

export interface ChartLegendEntry {
  label: string;
  color: string;
  /** Mirrors the mark: a rule for line series, a swatch for filled ones. */
  mark?: "line" | "swatch";
  value?: string;
}

export interface ChartTableView {
  caption: string;
  columns: string[];
  rows: Array<{ header: string; cells: ReactNode[] }>;
}

export interface ChartFigureProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  legend?: ChartLegendEntry[];
  table: ChartTableView;
  footnote?: ReactNode;
  /** Verified-unavailable: shown instead of the plot, never as a zero. */
  unavailableReason?: string;
  /** Nothing to plot yet — a real, verified empty. */
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  className?: string;
}

export function ChartFigure({
  title,
  eyebrow,
  subtitle,
  actions,
  legend,
  table,
  footnote,
  unavailableReason,
  empty = false,
  emptyMessage = "No values are tracked for this period yet.",
  children,
  className
}: ChartFigureProps) {
  const headingId = useId();
  const tableId = useId();
  const [showTable, setShowTable] = useState(false);
  const suppressed = Boolean(unavailableReason);

  return (
    <figure
      className={["chart-figure", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className="chart-figure__head">
        <div className="chart-figure__title">
          {eyebrow ? <p className="chart-figure__eyebrow">{eyebrow}</p> : null}
          <h4 id={headingId}>{title}</h4>
          {subtitle ? <p className="chart-figure__subtitle">{subtitle}</p> : null}
        </div>
        <div className="chart-figure__actions">
          {actions}
          {suppressed ? null : (
            <button
              type="button"
              className="chart-figure__table-toggle"
              aria-expanded={showTable}
              aria-controls={tableId}
              onClick={() => setShowTable((open) => !open)}
            >
              <Table2 aria-hidden="true" />
              {showTable ? "Hide values" : "Show values"}
            </button>
          )}
        </div>
      </div>

      {legend && legend.length > 1 && !suppressed ? (
        <ul className="chart-legend">
          {legend.map((entry) => (
            <li key={entry.label}>
              <span
                aria-hidden="true"
                className={`chart-legend__mark chart-legend__mark--${entry.mark ?? "swatch"}`}
                style={{ background: entry.color }}
              />
              <span className="chart-legend__label">{entry.label}</span>
              {entry.value ? <span className="chart-legend__value">{entry.value}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {suppressed ? (
        <p className="chart-figure__unavailable">
          <strong>Not available.</strong> {unavailableReason}
        </p>
      ) : empty ? (
        <p className="chart-figure__empty">{emptyMessage}</p>
      ) : (
        <div className="chart-figure__plot">{children}</div>
      )}

      {footnote && !suppressed ? (
        <figcaption className="chart-figure__footnote">{footnote}</figcaption>
      ) : null}

      {suppressed ? null : (
        <div id={tableId} className="chart-figure__table" hidden={!showTable}>
          <table>
            <caption>{table.caption}</caption>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.header}>
                  <th scope="row">{row.header}</th>
                  {row.cells.map((cell, index) => (
                    <td key={table.columns[index + 1] ?? index}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
