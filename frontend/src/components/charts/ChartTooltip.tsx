import type { ReactNode } from "react";

/*
 * The hover/focus readout. Values lead and series names follow — the legend's
 * hierarchy inverted, because by the time a reader is here they already know
 * which series they want and are after the number. Series are keyed with a
 * short stroke of their colour rather than a filled box: at this density a box
 * is data-weight ink doing a label's job.
 *
 * Nothing here gates a value. Everything the tooltip shows is also in the
 * table view the figure always carries.
 */

export interface ChartTooltipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
  status?: ReactNode;
}

export function ChartTooltip({
  title,
  rows,
  x,
  y,
  align = "start",
  note
}: {
  title: string;
  rows: ChartTooltipRow[];
  x: number;
  y: number;
  align?: "start" | "end";
  note?: string;
}) {
  return (
    <div
      className="chart-tooltip"
      data-align={align}
      style={{ left: `${x}px`, top: `${y}px` }}
      role="presentation"
    >
      <p className="chart-tooltip__title">{title}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            {row.color ? (
              <span className="chart-tooltip__key" style={{ background: row.color }} aria-hidden="true" />
            ) : (
              <span className="chart-tooltip__key chart-tooltip__key--none" aria-hidden="true" />
            )}
            <span className="chart-tooltip__value">{row.value}</span>
            <span className="chart-tooltip__label">{row.label}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="chart-tooltip__note">{note}</p> : null}
    </div>
  );
}
