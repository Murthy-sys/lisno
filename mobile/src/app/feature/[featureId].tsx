import { Redirect, router, useLocalSearchParams } from "expo-router";

import { FeatureWorkspace } from "../../features/workspace/FeatureWorkspace";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { destinationsForAuthorization, landingDestination, resolveAuthorizedFeature } from "../../navigation/registry";
import { useScreenBack } from "../../navigation/useScreenBack";
import { useRuntime } from "../../runtime/RuntimeProvider";
import { FeatureErrorBoundary } from "../../ui/FeatureErrorBoundary";

export default function FeatureRoute() {
  const params = useLocalSearchParams<{ featureId?: string | string[]; projectId?: string | string[] }>();
  const featureId = typeof params.featureId === "string" ? params.featureId : "";
  const context = useRuntime();
  const back = useScreenBack();
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return <Redirect href="/" />;
  const { user, authorization } = context.session.session;
  const destination = resolveAuthorizedFeature(featureId, user.role, authorization);
  if (!destination) return <Redirect href="/access-denied" />;
  const projectId = typeof params.projectId === "string" ? params.projectId.trim() : "";
  const recoveryScope = JSON.stringify([
    context.environment.environment.id, context.environment.generation,
    context.session.generation, user.id, user.role, destination.id, projectId
  ]);
  const leaveFailedFeature = () => {
    if (back.onBack()) return;
    const landing = landingDestination(user.role, authorization);
    const fallback = landing && landing.id !== destination.id ? landing
      : destinationsForAuthorization(user.role, authorization).find(candidate => candidate.id !== destination.id);
    router.replace((fallback?.path ?? "/access-denied") as never);
  };
  return (
    <AdaptiveAppScaffold
      activeFeature={destination.id}
      presentation={destination.id === "ask-lisno" ? "conversation" : "standard"}
      backPlacement={(destination.id === "projects" || destination.id === "configuration") ? "content" : "scaffold"}
      {...(destination.id === "messages" ? { navigationRailBreakpoint: 840 } : {})}
    >
      <FeatureErrorBoundary key={recoveryScope} onLeave={leaveFailedFeature}>
        <FeatureWorkspace destination={destination} session={context.session.session} {...(projectId ? { initialProjectId: projectId } : {})} />
      </FeatureErrorBoundary>
    </AdaptiveAppScaffold>
  );
}
