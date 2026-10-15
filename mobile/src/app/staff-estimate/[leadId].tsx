import { Redirect, useLocalSearchParams } from "expo-router";
import { StaffEstimateWorkspace } from "../../features/estimate-authoring/StaffEstimateWorkspace";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { parseEstimateRouteId } from "../../navigation/backNavigationPolicy";
import { useRuntime } from "../../runtime/RuntimeProvider";

export default function StaffEstimateRoute() {
  const params = useLocalSearchParams<{ leadId?: string | string[] }>(); const leadId = parseEstimateRouteId(params.leadId); const context = useRuntime();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return <Redirect href="/" />;
  const session = context.session.session;
  if (!leadId || session.user.role === "client" || !canPerformOperation(session, "GET /leads/:leadId") || !canPerformOperation(session, "GET /leads/:leadId/estimate")) return <Redirect href="/access-denied" />;
  return <AdaptiveAppScaffold activeFeature={session.user.role === "estimator_sales" ? "leads" : "projects"}><StaffEstimateWorkspace leadId={leadId} session={session} /></AdaptiveAppScaffold>;
}
