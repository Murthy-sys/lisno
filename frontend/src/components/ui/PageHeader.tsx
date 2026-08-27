import type { ReactNode, Ref } from "react";

export interface PageHeaderProps {
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
}

export function PageHeader({
  id,
  title,
  eyebrow,
  description,
  breadcrumb,
  metadata,
  actions,
  headingRef,
  headingTabIndex
}: PageHeaderProps) {
  return (
    <header className="ui-page-header" aria-labelledby={id}>
      {breadcrumb ? <div className="ui-page-header__breadcrumb">{breadcrumb}</div> : null}
      <div className="ui-page-header__content">
        {eyebrow ? <div className="ui-page-header__eyebrow">{eyebrow}</div> : null}
        <h1
          ref={headingRef}
          className="ui-page-header__title"
          id={id}
          tabIndex={headingTabIndex}
        >
          {title}
        </h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
        {metadata ? <div className="ui-page-header__metadata">{metadata}</div> : null}
      </div>
      {actions ? <div className="ui-page-header__actions" role="group" aria-label="Page actions">{actions}</div> : null}
    </header>
  );
}
