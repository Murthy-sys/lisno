import { useEffect, useId, useState, type ReactNode } from "react";

/** Keep the children mounted when collapsed so in-progress reviews retain their inputs. */
export function ClientProjectPhasePanel({ title, enabled, initiallyOpen = false, revealKey, children }: {
  title: string;
  enabled: boolean;
  initiallyOpen?: boolean;
  revealKey?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  useEffect(() => { if (revealKey) setChosenOpen(true); }, [revealKey]);
  const open = chosenOpen ?? initiallyOpen;
  return <section className={enabled ? "client-project-phase" : "client-project-phase--pending"} aria-labelledby={enabled ? `${id}-title` : undefined}>
    <h2 id={`${id}-title`} hidden={!enabled}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-content`} onClick={() => setChosenOpen(!open)}>
        <span>{title}</span><span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
    </h2>
    <div id={`${id}-content`} hidden={enabled && !open}>{children}</div>
  </section>;
}
