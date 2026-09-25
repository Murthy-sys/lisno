import { Redirect, useLocalSearchParams } from "expo-router";

import { FeatureWorkspace } from "../../features/workspace/FeatureWorkspace";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { useRuntime } from "../../runtime/RuntimeProvider";

export default function FeatureRoute() {
  const params = useLocalSearchParams<{ featureId?: string | string[] }>();
  const featureId = typeof params.featureId === "string" ? params.featureId : "";
  const context = useRuntime();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return <Redirect href="/" />;
  const { user, authorization } = context.session.session;
  const destination = resolveAuthorizedFeature(featureId, user.role, authorization);
  if (!destination) return <Redirect href="/access-denied" />;
  return (
    <AdaptiveAppScaffold
      activeFeature={destination.id}
      backPlacement={destination.id === "projects" ? "content" : "scaffold"}
      {...(destination.id === "messages" ? { navigationRailBreakpoint: 840 } : {})}
    >
      <FeatureWorkspace destination={destination} session={context.session.session} />
    </AdaptiveAppScaffold>
  );
}
