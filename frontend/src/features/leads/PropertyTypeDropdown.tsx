import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function PropertyTypeDropdown({
  options,
  value,
  onChange,
  placeholder = "Select property type"
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(options.indexOf(value), 0));
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, options, value]);

  const select = (option: string) => {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(current + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(current - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); select(options[highlight]); }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--color-bg)] px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${open ? "border-[var(--color-primary)]" : "border-[var(--color-primary)]/20"}`}
      >
        <span className={value ? "font-medium text-[var(--color-primary)]" : "text-[var(--color-primary)]/40"}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-[var(--color-primary)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-bg)] py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const active = option === value;
            const isHighlighted = index === highlight;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(option)}
                  className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm text-[var(--color-primary)] ${active ? "bg-[var(--color-primary)]/8" : isHighlighted ? "bg-[var(--color-primary)]/5" : ""}`}
                >
                  <span>{option}</span>
                  {active ? <Check size={15} className="text-[var(--color-primary)]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
