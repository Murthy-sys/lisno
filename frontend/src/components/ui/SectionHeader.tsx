import type { ReactNode } from "react";

export interface SectionHeaderProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}

export function SectionHeader({
  id,
  title,
  description,
  actions,
  headingLevel = 2
}: SectionHeaderProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <header className="ui-section-header" aria-labelledby={id}>
      <div className="ui-section-header__content">
        <Heading className="ui-section-header__title" id={id}>{title}</Heading>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-section-header__actions" role="group" aria-label="Section actions">{actions}</div> : null}
    </header>
  );
}
