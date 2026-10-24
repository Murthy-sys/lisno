import { Component, lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { BudgetLiquidLayout, BudgetLiquidMetric, BudgetLiquidTone } from "./budgetLiquidMetrics";
import { formatPaise } from "./financeFormat";
import "./BudgetLiquidStage.css";

const percent = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const VISUAL_HEIGHT = 300;
const MIN_ROW_HEIGHT = 430;

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function StaticVessel({ metric }: { metric: BudgetLiquidMetric }) {
  const top = 264 - metric.fill * 224;
  return <svg className="budget-liquid-stage__vessel" viewBox="0 0 190 300" aria-hidden="true" focusable="false" data-fill={metric.fill}>
    <path className="budget-liquid-stage__vessel-wall" d="M32 32 A63 17 0 0 1 158 32 V264 A63 17 0 0 1 32 264 Z" />
    <ellipse className="budget-liquid-stage__vessel-base" cx="95" cy="264" rx="63" ry="17" />
    {metric.fill > 0 ? <g className="budget-liquid-stage__static-liquid">
      <path d={`M36 ${top} A59 15 0 0 1 154 ${top} V263 A59 15 0 0 1 36 263 Z`} />
      <ellipse className="budget-liquid-stage__liquid-top" cx="95" cy={top} rx="59" ry="15" />
    </g> : null}
    <path className="budget-liquid-stage__vessel-outline" d="M32 32 V264 A63 17 0 0 0 158 264 V32" />
    <path className="budget-liquid-stage__vessel-highlight" d="M39 43 V255 M149 43 V255" />
    <ellipse className="budget-liquid-stage__vessel-rim" cx="95" cy="32" rx="63" ry="17" />
    <ellipse className="budget-liquid-stage__vessel-rim-inner" cx="95" cy="32" rx="59" ry="13" />
  </svg>;
}

function BudgetMetricIcon({ tone }: { tone: BudgetLiquidTone }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {tone === "total" ? <><path d="M4 7.5h15v12H4a1.5 1.5 0 0 1-1.5-1.5V7A2 2 0 0 1 4 5l12-2v4.5" /><path d="M19 11h-5v5h5" /><circle cx="15.8" cy="13.5" r=".6" /></> : null}
    {tone === "usable" ? <><path d="m6 18 12-12" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></> : null}
    {tone === "expense" ? <><path d="M5 3.5 7 5l2-1.5L12 5l3-1.5L17 5l2-1.5v17L17 19l-2 1.5-3-1.5-3 1.5L7 19l-2 1.5Z" /><path d="M8 9h8M8 13h8M8 16.5h4" /></> : null}
    {tone === "overhead" ? <><path d="m10 3-.5 2-2 .8-1.8-.9-2 3.4 1.6 1.4-.2 2.2-1.6 1.3 2 3.5 2-.7 1.9 1L10 20h4l.5-2 1.9-1 2 .7 2-3.5-1.6-1.3-.2-2.2 1.6-1.4-2-3.4-1.8.9-2-.8L14 3Z" /><circle cx="12" cy="11.5" r="3" /></> : null}
    {tone === "reserve" ? <><path d="m3 7 5 4 4-6 4 6 5-4-2 11H5Z" /><path d="M5 21h14" /></> : null}
  </svg>;
}

/** DOM owns the financial presentation; the lazy canvas is entirely decorative. */
export function BudgetLiquidStage({ metrics }: { metrics: readonly BudgetLiquidMetric[] }) {
  const gridRef = useRef<HTMLOListElement>(null);
  const explanationId = useId();
  const [width, setWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(MIN_ROW_HEIGHT);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const LiquidScene = useMemo(() => lazy(() => import("./BudgetLiquidScene")), [attempt]);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [inView, setInView] = useState(true);
  const [supportsWebGL] = useState(() => typeof window !== "undefined" && (typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined"));
  const columns: BudgetLiquidLayout["columns"] = width >= 950 ? 5 : width >= 480 ? 2 : 1;
  const rows = Math.ceil(metrics.length / columns);
  const canRender = supportsWebGL && !failed;
  const animationActive = !reducedMotion && pageVisible && inView;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const bounds = grid.getBoundingClientRect();
      if (bounds.width > 0) setWidth(bounds.width);
      // Equal-height grid rows grow with captions and text zoom, keeping the scene aligned.
      if (bounds.height > 0 && rows > 0) setRowHeight(Math.max(MIN_ROW_HEIGHT, bounds.height / rows));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(grid);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [rows]);

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(!!preference?.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    updatePreference();
    updateVisibility();
    preference?.addEventListener?.("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
      if (entries[0]) setInView(entries[0].isIntersecting);
    }) : null;
    if (gridRef.current) observer?.observe(gridRef.current);
    return () => {
      preference?.removeEventListener?.("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  const handleReady = useCallback(() => setReady(true), []);
  const handleFailure = useCallback(() => { setFailed(true); setReady(false); }, []);
  const retry = () => { setReady(false); setFailed(false); setAttempt((current) => current + 1); };
  const layout: BudgetLiquidLayout = { width, columns, rowHeight, visualHeight: VISUAL_HEIGHT };
  const style = { "--budget-columns": columns, "--budget-visual-height": `${VISUAL_HEIGHT}px`, "--budget-row-height": `${MIN_ROW_HEIGHT}px` } as CSSProperties;

  return <div className="budget-liquid-stage" data-render-state={!canRender ? "static" : ready ? "ready" : "loading"}>
    <div className="budget-liquid-stage__toolbar">
      <p id={explanationId}>Liquid levels show each amount as a share of total budget.<small>Overheads are included in expenses. Reserved profit is the 20% margin.</small></p>
      <div className="budget-liquid-stage__controls">
        {reducedMotion && canRender ? <small>Reduced motion is on.</small> : null}
        {failed && supportsWebGL ? <button className="budget-liquid-stage__retry" type="button" onClick={retry}>Retry 3D view</button> : null}
      </div>
    </div>
    <div className="budget-liquid-stage__composition" style={style}>
      <ol ref={gridRef} className="budget-liquid-stage__metrics" aria-label="Budget buckets" aria-describedby={explanationId}>
        {metrics.map((metric) => <li key={metric.id} className="budget-liquid-stage__metric" data-tone={metric.id} data-budget-metric={metric.id} aria-label={metric.label}>
          <div className="budget-liquid-stage__graphic">
            <div className="budget-liquid-stage__illustration" aria-hidden="true" style={{ visibility: ready && canRender ? "hidden" : "visible" }}><StaticVessel metric={metric} /></div>
          </div>
          <div className="budget-liquid-stage__caption">
            <div className="budget-liquid-stage__footer">
              <span className="budget-liquid-stage__icon"><BudgetMetricIcon tone={metric.id} /></span>
              <div><h4>{metric.label}</h4><strong className="budget-liquid-stage__amount">{formatPaise(metric.amountPaise)}</strong></div>
            </div>
            <p className="budget-liquid-stage__ratio">{metric.ratio === null ? "Percentage not defined for a zero total budget" : `${percent.format(metric.ratio * 100)}% of total budget`}</p>
            <p className="budget-liquid-stage__note">{metric.note}</p>
            {metric.excessPaise > 0 ? <p className="budget-liquid-stage__excess">{formatPaise(metric.excessPaise)} above total budget. {metric.ratio === null ? "No budget capacity is defined." : "Vessel shown at capacity."}</p> : null}
          </div>
        </li>)}
      </ol>
      {canRender && width > 0 ? <div className="budget-liquid-stage__canvas" aria-hidden="true" style={{ height: rows * rowHeight }}>
        <SceneBoundary key={attempt} onFailure={handleFailure}>
          <Suspense fallback={null}><LiquidScene metrics={metrics} layout={layout} animationActive={animationActive} onReady={handleReady} onFailure={handleFailure} /></Suspense>
        </SceneBoundary>
      </div> : null}
    </div>
  </div>;
}
