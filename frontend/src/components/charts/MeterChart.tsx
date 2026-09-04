import { useId } from "react";

import { clamp } from "./chartScale";
import { statusColor, type ChartStatus } from "./chartTokens";

/*
 * One ratio against a limit.
 *
 * The fill carries severity and the unfilled track is a lighter step of the
 * same ramp, so the state reads across the whole bar rather than only where the
 * fill stops. An optional marker shows a target or threshold on the same scale;
 * a value past the limit is drawn at full width with the overflow named in
 * text, never by a bar that runs off its track.
 *
 * This is a figure, not a plot: the value is written out beside it, so it needs
 * no tooltip and no table twin.
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
}

export function MeterChart({
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

  return (
    <div className={`chart-meter chart-meter--${size}`} data-status={status}>
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
            width: `${share * 100}%`,
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
