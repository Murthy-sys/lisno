import { useEffect, useRef, useState } from "react";
import { Input } from "../../components/ui/Field";
import type { LucideIcon } from "lucide-react";

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

  const toggleOne = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="room-dimensions__root w-full">
      {rooms.map((room) => {
          const isOpen = expanded.has(room.id);
          const panelId = `room-dimensions-${room.id}`;
          const headingId = `${panelId}-heading`;
          const Icon = room.icon;
          const area = room.length && room.width ? Math.round(room.length * room.width) : null;

          return (
            <section key={room.id} className="room-dimensions__item" aria-labelledby={headingId}>
              <div className="room-dimensions__header flex min-w-0 items-center gap-2 px-4 py-2">
                <h3 id={headingId} className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleOne(room.id)}
                    className="room-dimensions__toggle flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  >
                    <Icon size={16} className="shrink-0 text-[var(--color-primary)]/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-semibold text-[var(--color-primary)] [overflow-wrap:anywhere]">{room.label} dimensions</span>
                    <span className={`room-dimensions__status shrink-0 text-[length:var(--text-text1-size)] [font-weight:var(--text-text2)] ${area !== null ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}>
                      {area !== null ? `${area} sqft` : "Not set"}
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" className={`shrink-0 text-[var(--color-primary)] ${isOpen ? "rotate-180" : ""}`}>
                      <path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </h3>
                <button type="button" className="room-dimensions__remove shrink-0 p-1 text-[var(--color-primary)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]" aria-label={`Remove ${room.label} room`} onClick={() => onRemove(room.id)}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                    <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {isOpen ? (
                <div id={panelId} className="room-dimensions__fields flex flex-wrap items-end gap-3 px-4 pb-4">
                  <label className="flex min-w-[min(100%,10rem)] flex-1 flex-col gap-1">
                    <span className="text-xs text-[var(--color-primary)]/60">Length (ft)</span>
                    <Input
                      type="number"
                      step="any"
                      aria-label={`${room.label} length`}
                      value={room.length ?? ""}
                      onChange={(event) => onDimensionChange(room.id, { length: Number(event.target.value) || null })}
                      placeholder="L ft"
                      className="w-full rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)] px-2.5 py-1.5 text-sm text-[var(--color-primary)] shadow-none focus:border-[var(--color-primary)]"
                    />
                  </label>
                  <span className="room-dimensions__separator pb-1.5 text-[var(--color-primary)]/60" aria-hidden="true">×</span>
                  <label className="flex min-w-[min(100%,10rem)] flex-1 flex-col gap-1">
                    <span className="text-xs text-[var(--color-primary)]/60">Width (ft)</span>
                    <Input
                      type="number"
                      step="any"
                      aria-label={`${room.label} width`}
                      value={room.width ?? ""}
                      onChange={(event) => onDimensionChange(room.id, { width: Number(event.target.value) || null })}
                      placeholder="W ft"
                      className="w-full rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-bg)] px-2.5 py-1.5 text-sm text-[var(--color-primary)] shadow-none focus:border-[var(--color-primary)]"
                    />
                  </label>
                </div>
              ) : null}
            </section>
          );
        })}
    </div>
  );
}
