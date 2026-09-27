import { Redirect, useLocalSearchParams } from "expo-router";

import { canPerformOperation } from "../../core/session/operationCapabilities";
import { ClientEstimateReviewScreen } from "../../features/estimates/ClientEstimateReviewScreen";
import { ClientDrawingReview } from "../../features/estimates/ClientDrawingReview";
import { ClientPlanReview } from "../../features/estimates/ClientPlanReview";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { parseEstimateRouteId } from "../../navigation/backNavigationPolicy";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { useRuntime } from "../../runtime/RuntimeProvider";

export default function ClientEstimateRoute() {
  const params = useLocalSearchParams<{ estimateId?: string | string[] }>();
  const estimateId = parseEstimateRouteId(params.estimateId);
  const context = useRuntime();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return <Redirect href="/" />;
  if (!estimateId) return <Redirect href="/access-denied" />;
  const session = context.session.session;
  const destination = resolveAuthorizedFeature("estimates", session.user.role, session.authorization);
  if (session.user.role !== "client" || !destination || !canPerformOperation(session, "GET /client/estimates")) return <Redirect href="/access-denied" />;
  const canReadPlans = canPerformOperation(session, "GET /client/estimates/:estimateId/plan-review");
  const canReadDrawings = canPerformOperation(session, "GET /client/estimates/:estimateId/design-drawings");
  return (
    <AdaptiveAppScaffold activeFeature={destination.id} backPlacement="content">
      <ClientEstimateReviewScreen key={estimateId} estimateId={estimateId} session={session} reviewContent={(estimate) => <>
        {canReadPlans ? <ClientPlanReview estimate={estimate} session={session} /> : null}
        {canReadDrawings ? <ClientDrawingReview estimate={estimate} session={session} /> : null}
      </>} />
    </AdaptiveAppScaffold>
  );
}
