import type { ReactNode } from "react";

export type PMDashboardIconName = "search" | "refresh" | "performance" | "projects" | "warning" | "setup" | "check" | "bell" | "chevron" | "list" | "grid" | "location";

const paths: Record<PMDashboardIconName, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></>,
  performance: <><path d="M5 19v-5m7 5V9m7 10V4" /></>,
  projects: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3v.1" /></>,
  setup: <><circle cx="12" cy="12" r="3" /><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.8 1.8v2.6L1.7 16l2 3.5 2.5-.7 2.2 1.3L9 22h6l.6-1.9 2.2-1.3 2.5.7 2-3.5-1.8-2v-2.6l1.8-1.8-2-3.5-2.5.7-2.2-1.3L15 3H9Z" transform="translate(1 0) scale(.92)" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m7.5 12 3 3 6-6" /></>,
  bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4M12 2v2" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  list: <><path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" /></>,
  grid: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></>,
  location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
};

export function PMDashboardIcon({ name, className = "" }: { name: PMDashboardIconName; className?: string }) {
  return <svg className={`pm-dashboard__icon ${className}`.trim()} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
