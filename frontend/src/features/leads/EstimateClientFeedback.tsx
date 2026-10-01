import type { EstimateDraft } from "./leadsApi";
import "./estimateClientFeedback.css";

const requestedAtFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function EstimateClientFeedback({
  feedback,
  editable,
  refreshing,
  refreshFailed,
  onRefresh
}: {
  feedback: NonNullable<EstimateDraft["clientFeedback"]>;
  editable: boolean;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}) {
  const requestedAt = new Date(feedback.occurredAt);
  const hasDate = !Number.isNaN(requestedAt.getTime());

  return (
    <section className="estimate-client-feedback" aria-labelledby="estimate-client-feedback-title">
      <header className="estimate-client-feedback__header">
        <div>
          <p className="eyebrow">Client estimate feedback</p>
          <h2 id="estimate-client-feedback-title">Changes requested</h2>
        </div>
        {hasDate ? (
          <time dateTime={feedback.occurredAt}>
            Requested {requestedAtFormatter.format(requestedAt)}
          </time>
        ) : null}
      </header>
      <p className="estimate-client-feedback__note">
        {feedback.note.trim() || "The client requested changes without an explanation. Confirm the required updates with the client before resubmitting."}
      </p>
      {refreshing ? <p className="estimate-client-feedback__next-step" role="status">Refreshing Client feedback…</p> : refreshFailed ? (
        <div className="estimate-client-feedback__recovery">
          <p className="estimate-client-feedback__next-step" role="alert">The latest feedback could not be loaded. Refresh before using this request.</p>
          <button type="button" className="button button--secondary" onClick={onRefresh}>Refresh feedback</button>
        </div>
      ) : <p className="estimate-client-feedback__next-step">
        {editable
          ? "Update the estimate using this feedback, then submit it for review."
          : "This feedback stays available until the revised estimate is sent to the client."}
      </p>}
    </section>
  );
}
