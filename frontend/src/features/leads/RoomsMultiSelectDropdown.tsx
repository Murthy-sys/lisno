import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";

export type RoomGroup = "Common Areas" | "Bedrooms" | "Bathrooms" | "Other";
export type RoomOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: RoomGroup;
};

const GROUP_ORDER: RoomGroup[] = ["Common Areas", "Bedrooms", "Bathrooms", "Other"];

export function RoomsMultiSelectDropdown({
  options,
  selected,
  onChange
}: {
  options: readonly RoomOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query]
  );
  const groups = useMemo(
    () => GROUP_ORDER
      .map((group) => ({ group, items: filtered.filter((option) => option.group === group) }))
      .filter((entry) => entry.items.length),
    [filtered]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  const filteredIds = filtered.map((option) => option.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const toggleFilteredSelection = () => {
    if (allFilteredSelected) {
      onChange(selected.filter((id) => !filteredIds.includes(id)));
    } else {
      onChange(Array.from(new Set([...selected, ...filteredIds])));
    }
  };
  const clearAll = () => onChange([]);

  const onSearchKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(current + 1, filtered.length - 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(current - 1, 0)); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[highlight];
      if (target) toggle(target.id);
    }
  };

  const selectedOptions = options.filter((option) => selected.includes(option.id));

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Select rooms"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-2 rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-sm transition-colors ${open ? "border-[var(--color-primary)]" : "border-[var(--color-primary)]/20"}`}
      >
        <span className="flex-1 text-left">{selectedOptions.length ? `${selectedOptions.length} rooms selected` : "Select rooms"}</span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[var(--color-primary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {selectedOptions.length ? <ul aria-label="Selected rooms" className="mt-2 flex flex-wrap gap-2">{selectedOptions.map((option) => <li key={option.id} className="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2 text-xs text-[var(--color-bg)]">
        {option.label}
        <button type="button" aria-label={`Remove ${option.label}`} onClick={() => toggle(option.id)} className="px-1 text-[var(--color-bg)]"><X size={14} aria-hidden="true" /></button>
      </li>)}</ul> : null}

      {open ? (
        <div className="absolute z-20 mt-1.5 w-full min-w-[16rem] rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-bg)] shadow-lg">
          <div className="flex items-center gap-2 border-b-2 border-[var(--color-primary)] px-3 py-2">
            <Search size={14} className="shrink-0 text-[var(--color-primary)]/60" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
              onKeyDown={onSearchKeyDown}
              aria-label="Search rooms"
              placeholder="Search rooms"
              className="w-full appearance-none border-0 bg-transparent text-sm text-[var(--color-primary)] shadow-none placeholder:text-[var(--color-text-muted)] focus:border-0"
            />
          </div>

          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <button type="button" onClick={toggleFilteredSelection} className="font-semibold text-[var(--color-primary)]" disabled={!filteredIds.length}>
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-[var(--color-text-muted)]">{selected.length} of {options.length} selected</span>
          </div>

          <div role="listbox" aria-label="Rooms" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
            {groups.map(({ group, items }) => (
              <div key={group}>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {group}
                </p>
                {items.map((option) => {
                  const flatIndex = filtered.indexOf(option);
                  const checked = selected.includes(option.id);
                  const isHighlighted = flatIndex === highlight;
                  const Icon = option.icon;
                  return (
                    <button
                      type="button"
                      key={option.id}
                      role="option"
                      aria-selected={checked}
                      onMouseEnter={() => setHighlight(flatIndex)}
                      onClick={() => toggle(option.id)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--color-primary)] ${isHighlighted ? "bg-[var(--color-primary)]/5" : ""}`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-[var(--color-primary)] bg-[var(--color-primary)]" : "border-[var(--color-primary)]/30 bg-[var(--color-bg)]"}`}>
                        {checked ? <Check size={11} className="text-[var(--color-bg)]" /> : null}
                      </span>
                      <Icon size={15} className="shrink-0 text-[var(--color-primary)]/60" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {!filtered.length ? <p className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">No rooms found</p> : null}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-primary)]/15 px-3 py-2">
            <button type="button" onClick={clearAll} className="text-xs font-medium text-[var(--color-primary)]/60">
              Clear all
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)]"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
