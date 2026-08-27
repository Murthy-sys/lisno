import { StateContent, type PageStateProps } from "./PageState";

export interface SectionStateProps extends PageStateProps {
  title?: string;
}

export function SectionState({ title, ...stateProps }: SectionStateProps) {
  return (
    <section
      className={`ui-section-state ui-section-state--${stateProps.state}`}
      data-section-state={stateProps.state}
      aria-busy={stateProps.state === "loading" || undefined}
    >
      {title ? <h2 className="ui-section-state__title">{title}</h2> : null}
      <StateContent {...stateProps} />
    </section>
  );
}
