import type { LucideIcon } from "lucide-react";

export type ScopeSectionOption = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function ScopeSectionsToggleList({
  options,
  enabled,
  onToggle,
  onSelectAll,
  onDeselectAll
}: {
  options: readonly ScopeSectionOption[];
  enabled: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const allEnabled = options.length > 0 && options.every((option) => enabled.has(option.id));

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={allEnabled ? onDeselectAll : onSelectAll} className="text-xs font-semibold text-[var(--color-primary)]">
          {allEnabled ? "Deselect all" : "Select all"}
        </button>
        <span className="text-xs text-[var(--color-primary)]/50">{enabled.size} of {options.length} included</span>
      </div>

      <div className="w-full divide-y divide-[var(--color-primary)]/8 rounded-2xl border border-[var(--color-primary)]/12">
        {options.map((option) => {
          const checked = enabled.has(option.id);
          const Icon = option.icon;
          return (
            <button
              type="button"
              key={option.id}
              role="switch"
              aria-checked={checked}
              onClick={() => onToggle(option.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left ${checked ? "" : "bg-[var(--color-primary)]/2"}`}
            >
              <Icon size={18} className={checked ? "shrink-0 text-[var(--color-primary)]" : "shrink-0 text-[var(--color-primary)]/35"} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={`block font-bold ${checked ? "text-[var(--color-primary)]" : "text-[var(--color-primary)]/40"}`}>
                  {option.label}
                </span>
                <span className={`block text-sm ${checked ? "text-[var(--color-primary)]/60" : "text-[var(--color-primary)]/35"}`}>
                  {option.description}{checked ? "" : " · excluded from scope"}
                </span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-primary)]/15"}`}>
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-bg)] transition-transform ${checked ? "translate-x-[1.15rem]" : "translate-x-0.5"}`}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
