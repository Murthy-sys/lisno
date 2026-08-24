import type { EstimateClientReviewSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";

interface EstimateDeliveryStatusProps {
  review: EstimateClientReviewSummary;
  retrying: boolean;
  onRetry(): void;
}

const deliveredAt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

const presentation: Record<
  EstimateClientReviewSummary["deliveryStatus"],
  { label: string; role: "status" | "alert"; tone: StatusTone }
> = {
  queued: { label: "Email queued", role: "status", tone: "info" },
  sent: { label: "Email sent", role: "status", tone: "success" },
  failed: { label: "Email delivery failed", role: "alert", tone: "danger" },
  disabled: { label: "Email unavailable", role: "alert", tone: "warning" }
};

export function EstimateDeliveryStatus({
  review,
  retrying,
  onRetry
}: EstimateDeliveryStatusProps) {
  const state = presentation[review.deliveryStatus];
  const retryable = review.status === "pending" &&
    (review.deliveryStatus === "failed" || review.deliveryStatus === "disabled");

  return (
    <section className="estimate-delivery" aria-label="Estimate email delivery">
      <div className="estimate-delivery__state" role={state.role}>
        <StatusBadge label={state.label} tone={state.tone} />
        {review.deliveryStatus === "sent" && review.deliveredAt ? (
          <span className="estimate-delivery__timestamp">
            {deliveredAt.format(new Date(review.deliveredAt))}
          </span>
        ) : null}
      </div>
      {retryable ? (
        <Button
          variant="secondary"
          size="compact"
          busy={retrying}
          busyLabel="Retrying email…"
          onClick={onRetry}
        >
          Retry email
        </Button>
      ) : null}
    </section>
  );
}
