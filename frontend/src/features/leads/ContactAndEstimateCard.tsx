import { Button } from "../../components/ui/Button";

export function ContactAndEstimateCard({
  nextAction,
  buttonLabel,
  onContinue,
  buttonDisabled
}: {
  nextAction: string;
  buttonLabel: string;
  onContinue: () => void;
  buttonDisabled?: boolean;
}) {
  return (
    <section className="estimation-progress__estimate" aria-labelledby="estimate-entry-title">
      <h2 id="estimate-entry-title" className="estimation-progress__estimate-heading">
        <span className="estimation-progress__heading-symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="1" />
            <path d="M8 6h8M8 10h1m3 0h1m3 0h.01M8 14h1m3 0h1m3 0h.01M8 18h1m3 0h1m3-4v4" />
          </svg>
        </span>
        Estimate
      </h2>
      <ol className="estimation-progress__steps" aria-label="Estimate steps">
        <li>
          <span className="estimation-progress__step-number" aria-hidden="true">1</span>
          <svg className="estimation-progress__step-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m2 11 10-9 10 9M5 9v13h5v-7h4v7h5V9" />
          </svg>
          <span>Rooms &amp; Dimensions</span>
        </li>
        <li>
          <span className="estimation-progress__step-number" aria-hidden="true">2</span>
          <svg className="estimation-progress__step-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5" />
          </svg>
          <span>Select Scope</span>
        </li>
        <li>
          <span className="estimation-progress__step-number" aria-hidden="true">3</span>
          <svg className="estimation-progress__step-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2H5v20h14V8l-6-6Zm0 0v6h6M8 12h8M8 16h8M8 19h5" />
          </svg>
          <span>Generate Estimate</span>
        </li>
      </ol>
      <div className="estimation-progress__estimate-actions">
        {nextAction ? <p className="estimation-progress__next-action">Next action: <span>{nextAction}</span></p> : null}
        <Button type="button" onClick={onContinue} disabled={buttonDisabled} trailingIcon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12h16m-6-6 6 6-6 6" />
          </svg>
        }>
          {buttonLabel}
        </Button>
      </div>
    </section>
  );
}
