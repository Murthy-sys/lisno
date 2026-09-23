import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

import { useOnboardingCompletion } from "../core/onboarding";
import { landingDestination } from "../navigation/registry";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupBrand } from "../ui/brand";
import { colors, fonts, spacing } from "../ui/tokens";

export default function StartupRouter() {
  const context = useRuntime();
  const shouldResolveOnboarding =
    context.configured &&
    context.booted &&
    !context.initializationError &&
    context.session.status === "unauthenticated";
  const onboardingComplete = useOnboardingCompletion(shouldResolveOnboarding);

  if (!context.configured) {
    return (
      <View style={styles.configurationError}>
        <StatusBar style="light" />
        <Text accessibilityRole="header" style={styles.errorTitle}>Backend setup required</Text>
        <Text style={styles.errorMessage}>{context.message}</Text>
        <Text style={styles.errorHint}>
          Update the selected backend in the app environment, then rebuild and reinstall the app.
        </Text>
      </View>
    );
  }

  if (
    !context.booted ||
    context.session.status === "booting" ||
    context.session.status === "restoring" ||
    context.session.status === "signing_out"
  ) {
    return (
      <View style={styles.screen}>
        <StartupBrand message="Preparing your workspace" />
      </View>
    );
  }

  if (context.session.status === "transient_error" || context.initializationError) {
    return <Redirect href="/startup-recovery" />;
  }
  if (context.session.status !== "authenticated" || !context.session.session) {
    if (onboardingComplete === null) {
      return (
        <View style={styles.screen}>
          <StartupBrand message="Preparing your workspace" />
        </View>
      );
    }
    return <Redirect href={(onboardingComplete ? "/sign-in" : "/welcome") as never} />;
  }

  const { user, authorization } = context.session.session;
  const landing = landingDestination(user.role, authorization);
  if (!landing) return <Redirect href="/access-denied" />;
  return <Redirect href={`/feature/${landing.id}` as never} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.midnight
  },
  configurationError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.midnight
  },
  errorTitle: {
    color: colors.surface,
    fontFamily: fonts.semibold,
    fontSize: 24,
    textAlign: "center"
  },
  errorMessage: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center"
  },
  errorHint: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  }
});
