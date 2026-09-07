import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X, type LucideIcon } from "lucide-react";

export type RoomDimensionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  length: number | null;
  width: number | null;
};

export function RoomDimensionsAccordion({
  rooms,
  onDimensionChange,
  onRemove
}: {
  rooms: readonly RoomDimensionItem[];
  onDimensionChange: (id: string, change: { length?: number | null; width?: number | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rooms.map((room) => room.id)));
  const knownIds = useRef<Set<string>>(new Set(rooms.map((room) => room.id)));

  useEffect(() => {
    const currentIds = new Set(rooms.map((room) => room.id));
    const added = rooms.filter((room) => !knownIds.current.has(room.id));
    if (added.length) {
      setExpanded((current) => {
        const next = new Set(current);
        added.forEach((room) => next.add(room.id));
        return next;
      });
    }
    knownIds.current = currentIds;
  }, [rooms]);

  if (!rooms.length) return null;

  const allExpanded = rooms.every((room) => expanded.has(room.id));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(rooms.map((room) => room.id)));
  const toggleOne = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={toggleAll} aria-label={allExpanded ? "Collapse all" : "Expand all"} className="text-[var(--color-primary)]">
          {allExpanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
      </div>

      <div className="w-full divide-y divide-[var(--color-primary)]/8 rounded-2xl border border-[var(--color-primary)]/12">
        {rooms.map((room) => {
          const isOpen = expanded.has(room.id);
          const panelId = `room-dimensions-${room.id}`;
          const Icon = room.icon;
          const area = room.length && room.width ? Math.round(room.length * room.width) : null;

          return (
            <div key={room.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleOne(room.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Icon size={16} className="shrink-0 text-[var(--color-primary)]/60" aria-hidden="true" />
                  <span className="truncate font-bold text-[var(--color-primary)]">{room.label}</span>
                </button>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={area !== null ? "text-[length:var(--text-text1-size)] [font-weight:var(--text-text2)] text-[var(--color-primary)]" : "text-[length:var(--text-text1-size)] [font-weight:var(--text-text2)] text-[var(--color-primary)]/40"}>
                    {area !== null ? `${area} sqft` : "Not set"}
                  </span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={isOpen ? `Collapse ${room.label}` : `Expand ${room.label}`}
                    onClick={() => toggleOne(room.id)}
                  >
                    <ChevronDown size={16} className={`text-[var(--color-primary)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <button type="button" aria-label={`Remove ${room.label}`} onClick={() => onRemove(room.id)}>
                    <X size={16} className="text-[var(--color-primary)]/60" />
                  </button>
                </div>
              </div>

              {isOpen ? (
                <div id={panelId} className="flex flex-wrap items-end gap-3 px-4 pb-4">
                  <label className="flex min-w-[6rem] flex-1 flex-col gap-1">
                    <span className="text-xs text-[var(--color-primary)]/60">Length</span>
                    <input
                      type="number"
                      aria-label={`${room.label} length`}
                      value={room.length ?? ""}
                      onChange={(event) => onDimensionChange(room.id, { length: Number(event.target.value) || null })}
                      placeholder="L ft"
                      className="w-full rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)] px-2.5 py-1.5 text-sm text-[var(--color-primary)] shadow-none outline-none focus:border-[var(--color-primary)] focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none"
                    />
                  </label>
                  <span className="pb-1.5 text-[var(--color-primary)]/60">×</span>
                  <label className="flex min-w-[6rem] flex-1 flex-col gap-1">
                    <span className="text-xs text-[var(--color-primary)]/60">Width</span>
                    <input
                      type="number"
                      aria-label={`${room.label} width`}
                      value={room.width ?? ""}
                      onChange={(event) => onDimensionChange(room.id, { width: Number(event.target.value) || null })}
                      placeholder="W ft"
                      className="w-full rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)] px-2.5 py-1.5 text-sm text-[var(--color-primary)] shadow-none outline-none focus:border-[var(--color-primary)] focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
