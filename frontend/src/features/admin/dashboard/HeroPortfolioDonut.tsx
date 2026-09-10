import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { layoutDonutArcs, type DonutRingGeometry } from "./donutPath";

/*
 * The hero's three headline ratios (delivered / budget consumed / weighted
 * execution) as one ring instead of three separate gauges. The ring's slices
 * are sized relative to each other — these are three independent ratios, not
 * parts of a single whole, so the slice comparison is "which of these three
 * currently reads highest," not a percentage of 100. The real value for each
 * always lives in its own callout and in "View details", never only in the
 * slice's angle. Each metric carries its own identity colour rather than a
 * severity colour, so the three slices never blend into each other visually.
 */

export interface HeroPortfolioDonutSegment {
  key: string;
  label: string;
  share: number | null;
  valueText: string;
  detail?: string;
  color: string;
  unavailableReason?: string;
}

const GEOMETRY: DonutRingGeometry = { center: 66, outerRadius: 63, innerRadius: 41, cornerRadius: 4 };
const GAP_RADIANS = (1 * Math.PI) / 180;

export function HeroPortfolioDonut({ segments }: { segments: HeroPortfolioDonutSegment[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const arcs = layoutDonutArcs(GEOMETRY, segments, (segment) => segment.share ?? 0, GAP_RADIANS);

  return (
    <div className={`hero-donut${expanded ? " hero-donut--expanded" : ""}`}>
      {!expanded ? (
        <ul className="hero-donut__legend">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="hero-donut__swatch" style={{ background: segment.color }} aria-hidden="true" />
              {segment.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="hero-donut__row">
      <div className="hero-donut__visual">
        <div className="hero-donut__ring-wrap" onPointerLeave={() => setActive(null)}>
          <svg
            className="hero-donut__ring"
            viewBox="0 0 132 132"
            role="img"
            aria-label={`Organization portfolio ratios: ${segments.map((segment) => `${segment.label} ${segment.valueText}`).join(", ")}`}
          >
            {arcs.map(({ segment, path }, index) => (
              <path
                key={segment.key}
                d={path}
                fill={segment.color}
                className="hero-donut__arc"
                opacity={active === null || active === index ? 1 : 0.4}
                style={{ filter: `drop-shadow(0 0 5px ${segment.color}99)` }}
                tabIndex={0}
                onPointerEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive((current) => (current === index ? null : current))}
              />
            ))}
          </svg>

          {active !== null ? (
            <div className="hero-donut__callout">
              <p className="hero-donut__callout-label">{arcs[active].segment.label}</p>
              <p className="hero-donut__callout-value">{arcs[active].segment.valueText}</p>
              {arcs[active].segment.detail || arcs[active].segment.unavailableReason ? (
                <p className="hero-donut__callout-detail">
                  {arcs[active].segment.detail ?? arcs[active].segment.unavailableReason}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="hero-donut__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? "Hide details" : "View details"}
        </button>
      </div>

      {expanded ? (
        <dl className="hero-donut__details">
          {segments.map((segment) => (
            <div key={segment.key}>
              <span className="hero-donut__details-mark" aria-hidden="true" style={{ background: segment.color }} />
              <div>
                <dt>{segment.label}</dt>
                <dd>{segment.valueText}</dd>
                {segment.detail || segment.unavailableReason ? <p>{segment.detail ?? segment.unavailableReason}</p> : null}
              </div>
            </div>
          ))}
        </dl>
      ) : null}
      </div>
    </div>
  );
}
