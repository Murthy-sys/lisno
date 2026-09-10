import { useEffect, useId, useRef, useState } from "react";

import { clamp } from "./chartScale";
import { statusColor, type ChartStatus } from "./chartTokens";

/*
 * One ratio against a limit.
 *
 * The linear form carries severity along its whole length, not just where the
 * fill stops: the unfilled track is a faint version of the same surface, and
 * an optional marker shows a target on the same scale. A value past the limit
 * draws at full width with the overflow named in text, never a bar running
 * off its own track.
 *
 * The radial form is reserved for the ratio (or ratios) a panel is built to
 * answer — a ring with the number living in its own centre, the same visual
 * weight the page gives its biggest figures. Everywhere a panel has one
 * headline ratio, every other meter on it stays linear. The one deliberate
 * exception is the dashboard's hero band, where three coordinated rings
 * (delivery, budget, execution) together are the headline.
 *
 * Either way this is a figure, not a plot: the value is written out beside
 * it, so it needs no tooltip and no table twin.
 */

export interface MeterChartProps {
  label: string;
  /** 0–1. Pass null when the ratio could not be verified. */
  value: number | null;
  valueText: string;
  detail?: string;
  status?: ChartStatus;
  /** 0–1 target on the same scale, drawn as a hairline marker. */
  marker?: number | null;
  markerLabel?: string;
  unavailableReason?: string;
  size?: "default" | "compact";
  /** "radial" reserves this meter as the panel's one headline ratio. */
  shape?: "linear" | "radial";
}

export function MeterChart(props: MeterChartProps) {
  return props.shape === "radial" ? <RadialMeter {...props} /> : <LinearMeter {...props} />;
}

function LinearMeter({
  label,
  value,
  valueText,
  detail,
  status = "good",
  marker = null,
  markerLabel,
  unavailableReason,
  size = "default"
}: MeterChartProps) {
  const labelId = useId();
  const unavailable = value === null;
  const share = unavailable ? 0 : clamp(value, 0, 1);
  const overflow = !unavailable && value > 1;

  const rootRef = useRef<HTMLDivElement>(null);
  /*
   * The fill grows in once the meter first scrolls into view, rather than on
   * mount, matching the trend charts and metric-card progress bars
   * elsewhere in the dashboard. IntersectionObserver is absent in jsdom, so
   * tests (and any engine without it) fall back to already-visible.
   */
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

  return (
    <div ref={rootRef} className={`chart-meter chart-meter--${size}`} data-status={status}>
      <div className="chart-meter__head">
        <p id={labelId} className="chart-meter__label">
          {label}
        </p>
        <strong className="chart-meter__value">{unavailable ? "Not available" : valueText}</strong>
      </div>
      <div
        className="chart-meter__track"
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(unavailable ? {} : { "aria-valuenow": Math.round(share * 100) })}
        aria-valuetext={unavailable ? "Not available" : valueText}
      >
        <span
          className="chart-meter__fill"
          style={{
            width: `${inView ? share * 100 : 0}%`,
            background: statusColor(overflow ? "critical" : status)
          }}
        />
        {marker !== null && marker !== undefined && !unavailable ? (
          <span
            className="chart-meter__marker"
            style={{ left: `${clamp(marker, 0, 1) * 100}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {unavailable ? (
        <p className="chart-meter__detail">
          <strong>Not available.</strong>{" "}
          {unavailableReason ?? "Authoritative data is unavailable for this metric."}
        </p>
      ) : (
        <p className="chart-meter__detail">
          {overflow ? <strong>Over the limit. </strong> : null}
          {detail}
          {marker !== null && marker !== undefined && markerLabel ? (
            <span className="chart-meter__marker-label"> · {markerLabel}</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

function RadialMeter({
  label,
  value,
  valueText,
  detail,
  status = "good",
  marker = null,
  markerLabel,
  unavailableReason,
  size = "default"
}: MeterChartProps) {
  const labelId = useId();
  const gradientId = useId();
  const unavailable = value === null;
  const share = unavailable ? 0 : clamp(value, 0, 1);
  const overflow = !unavailable && value > 1;
  const tone = statusColor(overflow ? "critical" : status);

  /* A 270° sweep starting at 135°: the classic dashboard dial, with the gap
     at the bottom reading as "empty" the way a fuel gauge does. */
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.75; // 270° of the circle is the usable arc
  const arcLength = circumference * sweep;
  const filled = arcLength * share;

  return (
    <div className={`chart-meter chart-meter--radial chart-meter--${size}`} data-status={status}>
      <div className="chart-meter__radial-figure">
        <svg viewBox="0 0 132 132" role="img" aria-labelledby={labelId}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.72} />
              <stop offset="100%" stopColor={tone} />
            </linearGradient>
          </defs>
          <g transform="rotate(135 66 66)">
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke="var(--chart-track)"
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
            />
            {!unavailable ? (
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference}`}
              />
            ) : null}
            {marker !== null && marker !== undefined && !unavailable ? (
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke="var(--chart-axis)"
                strokeWidth={2}
                strokeDasharray={`1 ${circumference - 1}`}
                strokeDashoffset={-arcLength * clamp(marker, 0, 1) + 0.5}
                opacity={0.7}
              />
            ) : null}
          </g>
          <text x="66" y="72" textAnchor="middle" className="chart-meter__radial-value">
            {unavailable ? "—" : valueText}
          </text>
        </svg>
      </div>
      <p id={labelId} className="chart-meter__radial-label">
        {label}
      </p>
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(unavailable ? {} : { "aria-valuenow": Math.round(share * 100) })}
        aria-valuetext={unavailable ? "Not available" : valueText}
        className="sr-only"
      />
      {unavailable ? (
        <p className="chart-meter__detail chart-meter__detail--radial">
          <strong>Not available.</strong> {unavailableReason ?? "Authoritative data is unavailable for this metric."}
        </p>
      ) : (
        <p className="chart-meter__detail chart-meter__detail--radial">
          {overflow ? <strong>Over the limit. </strong> : null}
          {detail}
          {marker !== null && marker !== undefined && markerLabel ? (
            <span className="chart-meter__marker-label"> · {markerLabel}</span>
          ) : null}
        </p>
      )}
    </div>
  );
}
