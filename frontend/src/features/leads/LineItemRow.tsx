import { Trash2 } from "lucide-react";

export function LineItemRow({
  catalogueId,
  description,
  unit,
  rate,
  quantity,
  included,
  specification,
  options,
  disabled,
  onToggle,
  onSpecChange,
  onQuantityChange,
  onRemove,
  money
}: {
  catalogueId: string;
  description: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
  specification: string;
  options: readonly string[];
  disabled?: boolean;
  onToggle: () => void;
  onSpecChange: (value: string) => void;
  onQuantityChange: (value: number) => void;
  onRemove: () => void;
  money: (value: number) => string;
}) {
  const active = included && !disabled;

  return (
    <div className={`flex flex-col gap-2 border-b border-[var(--color-primary)]/8 px-4 py-3 last:border-b-0 md:flex-row md:flex-wrap md:items-center md:gap-3 ${included ? "" : "opacity-50"}`}>
      <div className="flex items-start gap-3 md:contents">
        <input
          type="checkbox"
          checked={included}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`Include ${description}`}
          className="mt-1 h-4 w-4 shrink-0 shadow-none outline-none accent-[var(--color-primary)] focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none md:mt-0"
        />
        <div className="min-w-0 flex-1 md:min-w-[10rem]">
          <p className="font-bold text-[var(--color-primary)]">
            {description} <span className="text-xs font-normal text-[var(--color-primary)]/40">{catalogueId}</span>
          </p>
          <p className="text-xs text-[var(--color-primary)]/50">{money(rate)} per {unit}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7 md:contents md:pl-0">
        <select
          disabled={!active}
          value={specification}
          title={specification}
          onChange={(event) => onSpecChange(event.target.value)}
          className={`min-w-0 max-w-[10rem] flex-1 truncate rounded-md border px-2 py-1.5 text-sm shadow-none outline-none focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none md:flex-none ${
            active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/3 text-[var(--color-primary)]/40"
          }`}
        >
          {options.map((option) => (
            <option key={option} value={option} title={option}>{option}</option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            disabled={!active}
            value={quantity}
            onChange={(event) => onQuantityChange(Number(event.target.value) || 0)}
            aria-label={`${description} quantity`}
            className={`w-16 rounded-md border px-2 py-1.5 text-sm shadow-none outline-none focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none ${
              active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/3 text-[var(--color-primary)]/40"
            }`}
          />
          <span className="text-xs text-[var(--color-primary)]/50">{unit}</span>
        </div>
        <strong className="ml-auto shrink-0 text-[var(--color-primary)]">{included ? money(Math.round(quantity * rate)) : "—"}</strong>
        <button
          type="button"
          aria-label={`Remove ${description}`}
          onClick={onRemove}
          className="shrink-0 text-[var(--color-primary)]/50 shadow-none outline-none hover:text-[var(--color-primary)] focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
