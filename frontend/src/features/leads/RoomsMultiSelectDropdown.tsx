import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { Input } from "../../components/ui/Field";

export type RoomGroup = "Common Areas" | "Bedrooms" | "Bathrooms" | "Other" | "Previously selected";
export type RoomOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: RoomGroup;
};

export type RoomDimensionValue = {
  id: string;
  selectionKey: string;
  label: string;
  length: number | null;
  width: number | null;
};

const GROUP_ORDER: RoomGroup[] = ["Common Areas", "Bedrooms", "Bathrooms", "Other", "Previously selected"];
const areaFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function formatRoomArea({ length, width }: RoomDimensionValue) {
  if (length == null || width == null || length <= 0 || width <= 0 || !Number.isFinite(length) || !Number.isFinite(width)) return "Not set";
  const area = length * width;
  return Number.isFinite(area) ? `${areaFormatter.format(area)} sq ft` : "Not set";
}

export function RoomsMultiSelectDropdown({
  options,
  selected,
  onChange,
  dimensions = [],
  onDimensionChange,
  onRemoveRoom,
  disabled = false
}: {
  options: readonly RoomOption[];
  selected: readonly string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
  dimensions?: readonly RoomDimensionValue[];
  onDimensionChange?: (id: string, change: { length?: number | null; width?: number | null }) => void;
  onRemoveRoom?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusedRowKey = useRef<string | null>(null);
  const popoverId = useId();
  const listId = useId();
  const selectionCountId = useId();

  const dimensionsBySelectionKey = useMemo(() => {
    const byKey = new Map<string, RoomDimensionValue[]>();
    dimensions.forEach((room) => {
      const existing = byKey.get(room.selectionKey) ?? [];
      existing.push(room);
      byKey.set(room.selectionKey, existing);
    });
    return byKey;
  }, [dimensions]);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: options.filter((option) => option.group === group).flatMap((option) => {
      const checked = selected.includes(option.id);
      const savedRooms = checked ? dimensionsBySelectionKey.get(option.id) ?? [] : [];
      const rows = savedRooms.length ? savedRooms : [undefined];
      return rows.map((dimension, index) => ({
        option,
        dimension,
        checked,
        key: dimension ? `saved:${dimension.id}` : `option:${option.id}`,
        label: dimension?.label ?? option.label,
        context: savedRooms.length > 1 ? ` (${index + 1} of ${savedRooms.length})` : ""
      })).filter((row) => `${option.label} ${row.label}`.toLowerCase().includes(query.trim().toLowerCase()));
    })
  })).filter((entry) => entry.items.length);
  const displayedRows = groups.flatMap((group) => group.items);
  const displayedRowKeys = JSON.stringify(displayedRows.map((row) => row.key));
  const hasSelectedDimensions = dimensions.some((room) => selected.includes(room.selectionKey));
  const triggerDisabled = disabled && !hasSelectedDimensions;

  useEffect(() => { if (triggerDisabled) setOpen(false); }, [triggerDisabled]);
  useEffect(() => {
    if (open && focusedRowKey.current && !displayedRows.some((row) => row.key === focusedRowKey.current)) {
      focusedRowKey.current = null;
      if (document.activeElement === document.body) searchRef.current?.focus();
    }
  }, [open, displayedRowKeys]);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (!rootRef.current?.closest("[inert]")) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      // A parent confirmation owns interaction while the picker is inert.
      if (rootRef.current?.closest("[inert]")) return;
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const toggle = (id: string) => {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  const toggleRow = (selectionKey: string, room?: RoomDimensionValue) => {
    if (disabled) return;
    if (room && onRemoveRoom) onRemoveRoom(room.id);
    else toggle(selectionKey);
  };

  const filteredIds = Array.from(new Set(displayedRows.map((row) => row.option.id)));
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const toggleFilteredSelection = () => {
    if (disabled) return;
    if (allFilteredSelected) onChange(selected.filter((id) => !filteredIds.includes(id)));
    else onChange(Array.from(new Set([...selected, ...filteredIds])));
  };

  const moveChoiceFocus = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const choices = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)') ?? []);
    const current = choices.indexOf(event.currentTarget);
    const next = current < 0
      ? event.key === "ArrowDown" ? 0 : choices.length - 1
      : Math.max(0, Math.min(choices.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    choices[next]?.focus();
    choices[next]?.scrollIntoView?.({ block: "nearest" });
  };
  const selectedOptions = options.filter((option) => selected.includes(option.id));

  return (
    <div ref={rootRef} className="rooms-select__root relative w-full min-w-0" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
    }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={triggerDisabled}
        aria-label="Select rooms"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={selectedOptions.length ? selectionCountId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`rooms-select__trigger flex w-full min-w-0 items-center gap-2 rounded-md border bg-[var(--color-bg)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${open ? "border-[var(--color-primary)]" : "border-[var(--color-primary)]/20"}`}
      >
        <span id={selectionCountId} className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">{selectedOptions.length ? `${selectedOptions.length} ${selectedOptions.length === 1 ? "room" : "rooms"} selected` : "Select rooms"}</span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[var(--color-primary)] ${open ? "rotate-180" : ""}`} />
      </button>
      {selectedOptions.length ? <ul aria-label="Selected rooms" className="rooms-select__chips mt-2 flex min-w-0 flex-wrap gap-2">{selectedOptions.map((option) => <li key={option.id} className="flex max-w-full min-w-0 items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 text-xs text-[var(--color-bg)]">
        <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
        <button type="button" aria-label={`Remove ${option.label} from selected rooms`} disabled={disabled} onClick={() => toggle(option.id)} className="shrink-0 px-1 text-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bg)]"><X size={14} aria-hidden="true" /></button>
      </li>)}</ul> : null}

      {open ? (
        <div id={popoverId} role="dialog" aria-label="Rooms" aria-modal="false" className="rooms-select__menu absolute z-20 mt-1.5 w-full min-w-0 rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)]">
          <div className="flex items-center gap-2 border-b-2 border-[var(--color-primary)] px-3 py-2">
            <Search size={14} aria-hidden="true" className="shrink-0 text-[var(--color-primary)]/60" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={moveChoiceFocus}
              aria-label="Search rooms"
              aria-controls={listId}
              placeholder="Search rooms"
              className="w-full appearance-none border-0 bg-transparent text-sm text-[var(--color-primary)] shadow-none placeholder:text-[var(--color-text-muted)] focus:border-0"
            />
          </div>

          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <button type="button" onClick={toggleFilteredSelection} className="font-semibold text-[var(--color-primary)]" disabled={disabled || !filteredIds.length}>
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-[var(--color-text-muted)]">{selectedOptions.length} of {options.length} selected</span>
          </div>

          <div ref={listRef} id={listId} role="group" aria-label="Room choices" tabIndex={0} className="rooms-select__list max-h-64 overflow-y-auto py-1">
            {groups.map(({ group, items }) => (
              <div key={group} role="group" aria-label={group}>
                <p aria-hidden="true" className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{group}</p>
                {items.map(({ option, dimension, checked, key, label, context }) => {
                  const Icon = option.icon;
                  return (
                    <div key={key} data-room-id={dimension?.id} role="group" aria-label={`${label} room${context}`} onFocus={() => { focusedRowKey.current = key; }} className={`rooms-select__row ${checked ? "rooms-select__row--selected" : ""}`}>
                      <label className="rooms-select__choice">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleRow(option.id, dimension)}
                          onKeyDown={(event) => {
                            moveChoiceFocus(event);
                            if (event.key === "Enter") {
                              event.preventDefault();
                              toggleRow(option.id, dimension);
                            }
                          }}
                        />
                        <Icon size={15} aria-hidden="true" className="shrink-0 text-[var(--color-primary)]/60" />
                        <span className="rooms-select__name">{label}</span>
                      </label>
                      {dimension ? (["length", "width"] as const).map((axis) => (
                        <label key={axis} className="rooms-select__dimension">
                          <span>{axis === "length" ? "Length" : "Width"} (ft)</span>
                          <Input
                            disabled={disabled || !onDimensionChange}
                            type="number"
                            step="any"
                            aria-label={`${label} ${axis}`}
                            value={dimension[axis] ?? ""}
                            onChange={(event) => { if (!disabled) onDimensionChange?.(dimension.id, { [axis]: Number(event.target.value) || null }); }}
                            placeholder={axis === "length" ? "L ft" : "W ft"}
                            className="w-full rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)] px-2.5 py-1.5 text-sm text-[var(--color-primary)] shadow-none focus:border-[var(--color-primary)]"
                          />
                        </label>
                      )) : null}
                      {dimension ? (
                        <div className="rooms-select__area">
                          <span>Area (sq ft)</span>
                          <output aria-label={`${label} area (sq ft)${context}`}>{formatRoomArea(dimension)}</output>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {!displayedRows.length ? <p role="status" className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">No rooms found</p> : null}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-primary)]/15 px-3 py-2">
            <button type="button" disabled={disabled} onClick={() => { if (!disabled) onChange([]); }} className="text-xs font-medium text-[var(--color-primary)]">Clear all</button>
            <button type="button" onClick={close} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)]">Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
