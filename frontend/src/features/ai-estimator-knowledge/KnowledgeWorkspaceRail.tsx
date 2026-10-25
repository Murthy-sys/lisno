import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { KnowledgeWorkspaceTabKey } from "./knowledgeWorkspaceSections";

export function KnowledgeWorkspaceRail({ children, section }: { readonly children: ReactNode; readonly section: KnowledgeWorkspaceTabKey }) {
  const rail = useRef<HTMLDivElement>(null);
  const [tooTall, setTooTall] = useState(false);
  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    const header = element.querySelector<HTMLElement>(":scope > [data-knowledge-rail-header]");
    let frame = 0;
    const measure = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const fallback = viewportHeight * 0.6;
      const styles = getComputedStyle(element);
      const desktop = styles.getPropertyValue("--knowledge-rail-stacked").trim() !== "1";
      const gap = parseFloat(styles.rowGap) || 16;
      const computedInset = parseFloat(styles.insetBlockStart);
      const inset = Number.isFinite(computedInset) ? Math.max(0, computedInset) : 8;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      // Budget for the sticky position, independent of document scroll or this
      // rail's own height. Measuring the parent top creates a resize/scroll loop.
      // Leave room for workspace bottom padding as well as the viewport edge.
      const bottomSpace = 32;
      const available = viewportHeight - inset - headerHeight - gap - bottomSpace;
      const cap = Math.floor(desktop && available >= Math.min(160, fallback) ? available : fallback);
      const value = `${Math.max(1, cap)}px`;
      if (element.style.getPropertyValue("--knowledge-summary-max-block-size") !== value) {
        element.style.setProperty("--knowledge-summary-max-block-size", value);
      }
      setTooTall(desktop && headerHeight + gap + cap > viewportHeight - inset - bottomSpace);
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    if (header) observer?.observe(header);
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      element.style.removeProperty("--knowledge-summary-max-block-size");
    };
  }, [section]);
  return <div ref={rail} className={`knowledge-workspace-rail${tooTall ? " knowledge-workspace-rail--long" : ""}`}>{children}</div>;
}
