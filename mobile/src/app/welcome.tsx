import { Redirect, router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { onboardingCompletion, useOnboardingCompletion } from "../core/onboarding";
import { OnboardingScreen } from "../features/onboarding";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupBrand } from "../ui/brand";
import { colors } from "../ui/tokens";

export default function WelcomeRoute() {
  const context = useRuntime();
  const shouldResolveCompletion =
    context.configured &&
    context.booted &&
    !context.initializationError &&
    context.session.status === "unauthenticated";
  const completion = useOnboardingCompletion(shouldResolveCompletion);

  const handleComplete = useCallback(async () => {
    try {
      await onboardingCompletion.complete();
    } finally {
      router.replace("/sign-in");
    }
  }, []);

  if (!context.configured) return <Redirect href="/" />;
  if (
    !context.booted ||
    context.session.status === "booting" ||
    context.session.status === "restoring" ||
    context.session.status === "signing_out"
  ) {
    return (
      <View style={styles.loading}>
        <StartupBrand message="Preparing your workspace" />
      </View>
    );
  }
  if (context.session.status === "transient_error" || context.initializationError) {
    return <Redirect href="/startup-recovery" />;
  }
  if (context.session.status === "authenticated") return <Redirect href="/" />;
  if (completion === null) {
    return (
      <View style={styles.loading}>
        <StartupBrand message="Preparing your introduction" />
      </View>
    );
  }
  if (completion) return <Redirect href="/sign-in" />;
  return <OnboardingScreen onComplete={handleComplete} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.midnight
  }
});
