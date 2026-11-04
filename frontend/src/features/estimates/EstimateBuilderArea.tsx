import { useLayoutEffect, useRef, type ReactNode } from "react";

export function EstimateBuilderArea({ children, className = "", documentFlow = false }: { children: ReactNode; className?: string; documentFlow?: boolean }) {
  const areaRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const area = areaRef.current;
    const workspace = area?.parentElement;
    if (!area || !workspace || documentFlow) return;
    const shell = workspace.closest<HTMLElement>(".ui-workspace") ?? workspace.parentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const footer = workspace.querySelector<HTMLElement>(".estimate-workspace__footer");
      const gap = Number.parseFloat(getComputedStyle(workspace).rowGap) || 0;
      const workspaceStyle = getComputedStyle(workspace);
      const bottomPadding = (shell ? Number.parseFloat(getComputedStyle(shell).paddingBottom) || 0 : 0) +
        (Number.parseFloat(workspaceStyle.paddingBottom) || 0) + (Number.parseFloat(workspaceStyle.borderBottomWidth) || 0);
      const height = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      // Page scrolling must not enlarge the editor and push following review content away.
      const documentTop = area.getBoundingClientRect().top + window.scrollY;
      const available = height - Math.max(0, documentTop) -
        (footer?.getBoundingClientRect().height ?? 0) - gap - bottomPadding;
      const value = `${Math.max(0, Math.floor(available))}px`;
      if (area.style.getPropertyValue("--estimate-builder-height") !== value) {
        area.style.setProperty("--estimate-builder-height", value);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (let ancestor: HTMLElement | null = workspace; ancestor; ancestor = ancestor.parentElement) {
      observer?.observe(ancestor);
      for (const child of ancestor.children) if (!child.contains(area)) observer?.observe(child);
      if (ancestor === shell) break;
    }
    const topbar = shell?.closest(".ui-common-shell")?.querySelector(".workspace-topbar");
    if (topbar) observer?.observe(topbar);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      area.style.removeProperty("--estimate-builder-height");
    };
  }, [documentFlow]);
  return <div ref={areaRef} className={`${documentFlow ? "" : "estimate-workspace__builder-area"} ${className}`}>{children}</div>;
}

