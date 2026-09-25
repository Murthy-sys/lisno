import type { ReactNode } from "react";

export interface KnowledgeCardHeadingProps {
  /** Decorative glyph for the icon tile. It is hidden from assistive technology. */
  readonly icon: ReactNode;
  readonly titleId: string;
  readonly title: string;
  readonly description: string;
  /** Optional state label pushed to the trailing edge, e.g. "Read-only revision". */
  readonly trailing?: ReactNode;
  readonly className?: string;
}

/*
 * The shared header of the item workspace cards: an icon tile beside the
 * heading and its one-line description. The tile is decoration only, so the
 * heading text, its id and its level carry the card's accessible name.
 */
export function KnowledgeCardHeading({
  icon,
  titleId,
  title,
  description,
  trailing,
  className
}: KnowledgeCardHeadingProps) {
  return (
    <div className={`knowledge-section-heading knowledge-card-heading${className ? ` ${className}` : ""}`}>
      <div className="knowledge-card-heading__identity">
        <span className="knowledge-card-heading__icon" aria-hidden="true">{icon}</span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {trailing}
    </div>
  );
}
