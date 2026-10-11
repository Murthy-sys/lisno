import { useEffect, useRef, useState } from "react";

const PROMPTS = [
  { label: "Show my projects", message: "Show my projects", icon: "projects" },
  { label: "Project progress", message: "Project progress", icon: "progress" },
  { label: "Timeline", message: "Expected timeline", icon: "timeline" },
  { label: "Add to estimate", message: "Add something to my estimate", icon: "estimate" }
] as const;

function PromptIcon({ kind }: { kind: typeof PROMPTS[number]["icon"] }) {
  return <svg className="ask-lisno-quick-prompts__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "projects" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M8 8.5l2.5-2 2.5 2" /></> : null}
    {kind === "progress" ? <path d="M5 20v-6m5 6V9m5 11V4m5 16V11" /> : null}
    {kind === "timeline" ? <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></> : null}
    {kind === "estimate" ? <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h4m-4 4h2m6-4v6m-3-3h6" /></> : null}
  </svg>;
}

export function AskLisnoQuickPrompts({ disabled, onSelect }: { disabled: boolean; onSelect: (message: string) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hasNext, setHasNext] = useState(false);

  const measure = () => {
    const viewport = viewportRef.current;
    setHasNext(Boolean(viewport && viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(list);
    viewport.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      viewport.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const reveal = (button: HTMLButtonElement) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const chip = button.getBoundingClientRect();
    const distance = chip.left < bounds.left ? chip.left - bounds.left
      : chip.right > bounds.right ? chip.right - bounds.right : 0;
    if (distance) viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + distance));
    measure();
  };

  const showNext = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const end = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollLeft = Math.min(end, viewport.scrollLeft + Math.max(44, viewport.clientWidth * 0.8));
    if (end - viewport.scrollLeft <= 1) {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[buttons.length - 1]?.focus({ preventScroll: true });
    }
    measure();
  };

  return <div className="ask-lisno-quick-prompts" role="group" aria-label="Suggested questions">
    <div className="ask-lisno-quick-prompts__viewport" ref={viewportRef}>
      <div className="ask-lisno-quick-prompts__list" ref={listRef}>
        {PROMPTS.map(prompt => <button className="ask-lisno-quick-prompts__chip" key={prompt.message} type="button" disabled={disabled} onClick={() => onSelect(prompt.message)} onFocus={event => reveal(event.currentTarget)}>
          <PromptIcon kind={prompt.icon} /><span>{prompt.label}</span>
        </button>)}
      </div>
    </div>
    {hasNext ? <button className="ask-lisno-quick-prompts__next" type="button" aria-label="Show more suggested questions" disabled={disabled} onClick={showNext}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
    </button> : null}
  </div>;
}
