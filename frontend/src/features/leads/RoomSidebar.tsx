import type { LucideIcon } from "lucide-react";
import { Pencil } from "lucide-react";

export type RoomSidebarItem = {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
  total: number;
};

export function RoomSidebar({
  rooms,
  activeRoomId,
  onSelect,
  icons,
  money
}: {
  rooms: readonly RoomSidebarItem[];
  activeRoomId: string;
  onSelect: (id: string) => void;
  icons: Record<string, LucideIcon>;
  money: (value: number) => string;
}) {
  return (
    <nav aria-label="Rooms" className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {rooms.map((room) => {
        const active = room.id === activeRoomId;
        const Icon = icons[room.typeId] ?? Pencil;
        return (
          <button
            type="button"
            key={room.id}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(room.id)}
            className={`flex shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-left shadow-none outline-none transition-colors focus:!shadow-none focus:outline-none focus:ring-0 focus-visible:!shadow-none focus-visible:outline-none lg:shrink ${
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]"
                : "border-[var(--color-primary)]/20 bg-[var(--color-bg)] text-[var(--color-primary)]"
            }`}
          >
            <Icon size={18} className={`shrink-0 ${active ? "text-[var(--color-bg)]" : "text-[var(--color-primary)]/50"}`} aria-hidden="true" />
            <span className="min-w-[7rem] flex-1 lg:min-w-0">
              <span className="block truncate font-bold">{room.label}</span>
              <span className={`block truncate text-xs ${active ? "text-[var(--color-bg)]/80" : "text-[var(--color-primary)]/50"}`}>
                {room.sqft} sqft · {money(room.total)}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
