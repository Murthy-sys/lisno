import { useId, type ReactNode } from "react";

export interface PanelSectionProps {
  /** Decorative only: rendered inside an `aria-hidden` tile, never part of the accessible name. */
  icon: ReactNode;
  title: string;
  description?: string;
  headingLevel?: 3 | 4;
  className?: string;
  children: ReactNode;
}

/** A titled card for side-panel content: tinted header band with an icon tile, then a body grid. */
export function PanelSection({
  icon,
  title,
  description,
  headingLevel = 3,
  className,
  children
}: PanelSectionProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const classes = ["ui-panel-section", className].filter(Boolean).join(" ");

  return (
    <section
      className={classes}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="ui-panel-section__header">
        <span className="ui-panel-section__icon" aria-hidden="true">{icon}</span>
        <div className="ui-panel-section__heading">
          <Heading id={titleId} className="ui-panel-section__title">{title}</Heading>
          {description ? (
            <p id={descriptionId} className="ui-panel-section__description">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="ui-panel-section__body">{children}</div>
    </section>
  );
}
