import { Calculator, Clock } from "lucide-react";
import { Button } from "../../components/ui/Button";

export function ContactAndEstimateCard({
  phone,
  email,
  budgetMin,
  budgetMax,
  nextAction,
  buttonLabel,
  onContinue,
  buttonDisabled
}: {
  phone: string;
  email: string;
  budgetMin: number | null | undefined;
  budgetMax: number | null | undefined;
  nextAction: string;
  buttonLabel: string;
  onContinue: () => void;
  buttonDisabled?: boolean;
}) {
  return (
    <div className="lead-contact-card">
      <h2 className="lead-contact-card__heading">
        <Calculator size={14} aria-hidden="true" />
        Estimate
      </h2>
      <p className="text-sm font-normal text-[var(--color-text-strong)]">
        <strong className="font-semibold">{phone}</strong> · {email}
      </p>
      <p className="text-sm font-normal text-[var(--color-text-strong)]">
        Budget: ₹{budgetMin?.toLocaleString() ?? "—"} – ₹{budgetMax?.toLocaleString() ?? "—"}
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
