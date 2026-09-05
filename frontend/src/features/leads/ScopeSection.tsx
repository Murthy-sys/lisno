import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function ScopeSection({
  id,
  label,
  icon: Icon,
  subtotal,
  expanded,
  onToggleExpand,
  money,
  sectionRef,
  children
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  subtotal: number;
  expanded: boolean;
  onToggleExpand: () => void;
  money: (value: number) => string;
  sectionRef: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const panelId = `scope-section-panel-${id}`;

  return (
    <section
      ref={sectionRef as (el: HTMLElement | null) => void}
      data-section-id={id}
      className="overflow-hidden rounded-2xl border border-[var(--color-primary)]/12 bg-[var(--color-bg)]"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        onClick={onToggleExpand}
        className="flex w-full flex-col gap-2 bg-[var(--color-primary)]/6 px-4 py-3 text-left shadow-none outline-none focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <Icon size={18} className={expanded ? "shrink-0 text-[var(--color-primary)]" : "shrink-0 text-[var(--color-primary)]/70"} aria-hidden="true" />
          <span className="truncate font-bold text-[var(--color-primary)]">{label}</span>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className={`shrink-0 text-sm font-semibold ${subtotal > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-primary)]/40"}`}>
            {money(subtotal)}
          </span>
          <ChevronDown size={18} className={`shrink-0 text-[var(--color-primary)] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div id={panelId} aria-hidden={!expanded} className="overflow-hidden">
          {children}
        </div>
      </div>
    </section>
  );
}
