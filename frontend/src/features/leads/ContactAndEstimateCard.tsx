import { Calculator, Clock } from "lucide-react";
import { Button } from "../../components/ui/Button";

export function ContactAndEstimateCard({
  phone,
  email,
  nextAction,
  buttonLabel,
  onContinue,
  buttonDisabled,
  presentation = "default"
}: {
  phone: string;
  email: string;
  nextAction: string;
  buttonLabel: string;
  onContinue: () => void;
  buttonDisabled?: boolean;
  presentation?: "default" | "estimate-progress";
}) {
  if (presentation === "estimate-progress") {
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

  return (
    <div className="lead-contact-card">
      <h2 className="lead-contact-card__heading">
        <Calculator size={14} aria-hidden="true" />
        Estimate
      </h2>
      <p className="text-sm font-normal text-[var(--color-text-strong)]">
        <strong className="font-semibold">{phone}</strong> · {email}
      </p>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
        <Clock size={12} aria-hidden="true" />
        Next action: {nextAction}
      </span>

      <div className="h-px w-full bg-[var(--color-primary)]/12" role="separator" aria-orientation="horizontal" />

      <div className="flex w-fit flex-col items-end gap-2">
        <p className="text-sm font-normal text-[var(--color-text-strong)]">
          Configure rooms, dimensions and scope. Follow-ups remain available independently.
        </p>
        <Button
          type="button"
          onClick={onContinue}
          disabled={buttonDisabled}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
