import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A button-triggered listbox, for the cases where a native <select>'s
 * unstyleable open dropdown (no border-radius, no shadow, OS-rendered) isn't
 * acceptable. Reuses .ui-control for the trigger, so it inherits the same
 * border/radius/focus treatment as every other field in the app.
 */
export function SelectMenu<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  className
}: {
  id: string;
  label: string;
  value: T;
  options: SelectMenuOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const listboxId = `${id}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const select = (option: SelectMenuOption<T>) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={["ui-select-menu", className].filter(Boolean).join(" ")} ref={rootRef}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ui-control ui-select-menu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <span>{selected?.label}</span>
        <ChevronDown aria-hidden="true" className="ui-select-menu__chevron" />
      </button>
      {open ? (
        <div id={listboxId} role="listbox" aria-label={label} className="ui-select-menu__popup">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={
                option.value === value
                  ? "ui-select-menu__option is-selected"
                  : "ui-select-menu__option"
              }
              onClick={() => select(option)}
            >
              <span>{option.label}</span>
              {option.value === value ? (
                <Check aria-hidden="true" className="ui-select-menu__check" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
