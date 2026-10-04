import type { MouseEventHandler } from "react";

export function KnowledgeRenamePenButton({ label, onClick }: {
  readonly label: string;
  readonly onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return <button type="button" className="knowledge-rename-pen" aria-label={label} onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 19 3.5-.8L19 7.7a2 2 0 0 0-2.8-2.8L5.7 15.4 5 19Z" />
      <path d="m13.9 7.2 2.9 2.9" />
      <path d="M4 21h16" />
    </svg>
  </button>;
}
