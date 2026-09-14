export type SectionPill = {
  id: string;
  label: string;
  subtotal: number;
};

export function SectionJumpNav({
  sections,
  activeSectionId,
  onJump,
  money
}: {
  sections: readonly SectionPill[];
  activeSectionId: string | null;
  onJump: (id: string) => void;
  money: (value: number) => string;
}) {
  return (
    <nav aria-label="Jump to section" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
      {sections.map((section) => {
        const active = section.id === activeSectionId;
        return (
          <button
            type="button"
            key={section.id}
            aria-current={active ? "true" : undefined}
            onClick={() => onJump(section.id)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold shadow-none transition-colors ${
              active ? "bg-[var(--color-primary)]/8 text-[var(--color-primary)]" : "bg-transparent text-[var(--color-text-muted)]"
            }`}
          >
            {section.label} · {money(section.subtotal)}
          </button>
        );
      })}
    </nav>
  );
}
