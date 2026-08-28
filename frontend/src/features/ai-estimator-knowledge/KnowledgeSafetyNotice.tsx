import { NoticeBanner } from "../../components/ui/NoticeBanner";

export function KnowledgeSafetyNotice() {
  return (
    <NoticeBanner tone="info" label="Knowledge base isolation notice">
      Knowledge-base changes do not modify current estimates or the existing
      Estimator/Sales builder.
    </NoticeBanner>
  );
}
