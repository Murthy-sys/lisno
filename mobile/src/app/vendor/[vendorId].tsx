import { Redirect, useLocalSearchParams } from "expo-router";

import { VendorKpiStaffScreen } from "../../features/procurement/VendorKpiStaffScreen";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { parseEstimateRouteId } from "../../navigation/backNavigationPolicy";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { useRuntime } from "../../runtime/RuntimeProvider";

export default function VendorKpiRoute() {
  const params = useLocalSearchParams<{ vendorId?: string | string[]; from?: string | string[] }>();
  const vendorId = parseEstimateRouteId(params.vendorId);
  const context = useRuntime();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return <Redirect href="/" />;
  const session = context.session.session;
  const featureId = session.user.role === "procurement" ? "procurement-vendors" : session.user.role === "super_admin" ? "configuration" : null;
  const destination = featureId ? resolveAuthorizedFeature(featureId, session.user.role, session.authorization) : null;
  if (!vendorId || !destination || !session.authorization.permissions.includes("procurement.vendor_kpi.read") || (params.from && params.from !== featureId)) return <Redirect href="/access-denied" />;
  if (!params.from) return <Redirect href={{ pathname: "/vendor/[vendorId]", params: { vendorId, from: featureId! } }} />;
  return <AdaptiveAppScaffold activeFeature={destination.id} backPlacement="content">
    <VendorKpiStaffScreen key={`${session.user.id}:${vendorId}`} session={session} vendorId={vendorId} />
  </AdaptiveAppScaffold>;
}
