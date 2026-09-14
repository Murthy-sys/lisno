import { Input, Select } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
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
    <div className={`estimate-line-row flex flex-col gap-2 border-b border-[var(--color-primary)]/8 px-4 py-2 last:border-b-0 md:flex-row md:flex-wrap md:items-center md:gap-3 ${included ? "" : "opacity-50"}`}>
      <label className="estimate-line-row__include flex items-start gap-3 md:contents">
        <input
          type="checkbox"
          checked={included}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`Include ${description} (${catalogueId})`}
          className="mt-1 h-4 w-4 shrink-0 shadow-none accent-[var(--color-primary)] md:mt-0"
        />
        <span className="min-w-0 flex-1 md:min-w-[10rem]">
          <span className="block font-semibold text-[var(--color-primary)]">
            {description} <span className="text-xs font-normal text-[var(--color-text-muted)]">{catalogueId}</span>
          </span>
          <span className="block text-xs text-[var(--color-text-muted)]">{money(rate)} per {unit}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 pl-7 md:contents md:pl-0">
        <Select
          disabled={!active}
          value={specification}
          aria-label={`${description} specification`}
          title={specification}
          onChange={(event) => onSpecChange(event.target.value)}
          className={`min-w-0 max-w-[10rem] flex-1 truncate rounded-md border px-2 py-1.5 text-sm shadow-none md:flex-none ${
            active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/3 text-[var(--color-text-muted)]"
          }`}
        >
          {options.map((option) => (
            <option key={option} value={option} title={option}>{option}</option>
          ))}
        </Select>
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            type="number"
            disabled={!active}
            value={quantity}
            onChange={(event) => onQuantityChange(Number(event.target.value) || 0)}
            aria-label={`${description} quantity`}
            className={`w-16 rounded-md border px-2 py-1.5 text-sm shadow-none ${
              active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/3 text-[var(--color-text-muted)]"
            }`}
          />
          <span className="text-xs text-[var(--color-text-muted)]">{unit}</span>
        </div>
        <strong className="ml-auto shrink-0 text-[var(--color-primary)]">{included ? money(Math.round(quantity * rate)) : "—"}</strong>
        <IconButton
          label={`Remove ${description}`}
          disabled={disabled}
          variant="quiet"
          icon={<Trash2 size={16} aria-hidden="true" />}
          onClick={onRemove}
          className="shrink-0 text-[var(--color-text-muted)] shadow-none hover:text-[var(--color-primary)]"
        />
      </div>
    </div>
  );
}
