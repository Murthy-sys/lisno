import { Redirect, useLocalSearchParams } from "expo-router";

import { RecordDetailScreen } from "../../../features/workspace/RecordDetailScreen";
import { AdaptiveAppScaffold } from "../../../navigation/AdaptiveAppScaffold";
import { resolveAuthorizedFeature } from "../../../navigation/registry";
import { useRuntime } from "../../../runtime/RuntimeProvider";

export default function RecordRoute() {
  const params = useLocalSearchParams<{ featureId?: string | string[]; recordId?: string | string[] }>();
  const featureId = typeof params.featureId === "string" ? params.featureId : "";
  const recordId = typeof params.recordId === "string" ? params.recordId : "";
  const context = useRuntime();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session || !recordId) return <Redirect href="/" />;
  const { user, authorization } = context.session.session;
  const destination = resolveAuthorizedFeature(featureId, user.role, authorization);
  if (!destination) return <Redirect href="/access-denied" />;
  return (
    <AdaptiveAppScaffold
      activeFeature={destination.id}
      {...(destination.id === "messages"
        ? { immersiveBelowWidth: 600, navigationRailBreakpoint: 840 }
        : {})}
    >
      <RecordDetailScreen destination={destination} recordId={recordId} session={context.session.session} />
    </AdaptiveAppScaffold>
  );
}
