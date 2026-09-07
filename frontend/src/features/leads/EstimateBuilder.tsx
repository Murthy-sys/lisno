import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { RoomSidebar } from "./RoomSidebar";
import { SectionJumpNav } from "./SectionJumpNav";
import { ScopeSection } from "./ScopeSection";
import { LineItemRow } from "./LineItemRow";

export type BuilderRoom = {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
};

export type BuilderLine = {
  id: string;
  catalogueId: string;
  sectionId: string;
  roomName: string;
  description: string;
  specification: string;
  options: readonly string[];
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
};

export type BuilderSection = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export function EstimateBuilder({
  rooms,
  activeRoomId,
  onSelectRoom,
  sections,
  roomIcons,
  lines,
  onUpdateLine,
  roomTotal,
  money,
  editable
}: {
  rooms: readonly BuilderRoom[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  sections: readonly BuilderSection[];
  roomIcons: Record<string, LucideIcon>;
  lines: readonly BuilderLine[];
  onUpdateLine: (id: string, change: { specification?: string; quantity?: number; included?: boolean }) => void;
  roomTotal: (roomName: string) => number;
  money: (value: number) => string;
  editable: boolean;
}) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0];
  const activeLines = useMemo(
    () => (activeRoom ? lines.filter((line) => line.roomName === activeRoom.label) : []),
    [lines, activeRoom]
  );

  const [hiddenLineIds, setHiddenLineIds] = useState<Set<string>>(() => new Set());
  const removeLine = (id: string) => setHiddenLineIds((current) => new Set(current).add(id));
  const visibleLines = useMemo(() => activeLines.filter((line) => !hiddenLineIds.has(line.id)), [activeLines, hiddenLineIds]);

  const defaultExpanded = () =>
    new Set(sections.filter((section) => visibleLines.some((line) => line.sectionId === section.id && line.included)).map((section) => section.id));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(defaultExpanded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setExpandedSections(defaultExpanded()); }, [activeRoomId]);
  const toggleSection = (id: string) => setExpandedSections((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      setActiveSectionId(id);
    }
    return next;
  });
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sections[0]?.id ?? null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSectionId(visible.target.getAttribute("data-section-id"));
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, activeRoomId]);
  const jumpToSection = (id: string) => sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const sectionSubtotal = (sectionId: string) =>
    visibleLines.filter((line) => line.sectionId === sectionId && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate), 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionJumpNav
        sections={sections.map((section) => ({ id: section.id, label: section.label, subtotal: sectionSubtotal(section.id) }))}
        activeSectionId={activeSectionId}
        onJump={jumpToSection}
        money={money}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)] lg:items-start">
        <RoomSidebar
          rooms={rooms.map((room) => ({ id: room.id, typeId: room.typeId, label: room.label, sqft: room.sqft, total: roomTotal(room.label) }))}
          activeRoomId={activeRoomId}
          onSelect={onSelectRoom}
          icons={roomIcons}
          money={money}
        />

        <div className="flex flex-col gap-4">
          {sections.map((section) => {
            const sectionLines = visibleLines.filter((line) => line.sectionId === section.id);
            if (!sectionLines.length) return null;
            return (
              <ScopeSection
                key={section.id}
                id={section.id}
                label={section.label}
                icon={section.icon}
                subtotal={sectionSubtotal(section.id)}
                expanded={expandedSections.has(section.id)}
                onToggleExpand={() => toggleSection(section.id)}
                money={money}
                sectionRef={(el) => {
                  if (el) sectionRefs.current.set(section.id, el);
                  else sectionRefs.current.delete(section.id);
                }}
              >
                {sectionLines.map((line) => (
                  <LineItemRow
                    key={line.id}
                    catalogueId={line.catalogueId}
                    description={line.description}
                    unit={line.unit}
                    rate={line.rate}
                    quantity={line.quantity}
                    included={line.included}
                    specification={line.specification}
                    options={line.options}
                    disabled={!editable}
                    onToggle={() => onUpdateLine(line.id, { included: !line.included })}
                    onSpecChange={(value) => onUpdateLine(line.id, { specification: value })}
                    onQuantityChange={(value) => onUpdateLine(line.id, { quantity: value })}
                    onRemove={() => removeLine(line.id)}
                    money={money}
                  />
                ))}
              </ScopeSection>
            );
          })}
        </div>
      </div>
    </div>
  );
}
