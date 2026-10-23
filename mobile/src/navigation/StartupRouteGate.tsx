import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useStartupPresentation } from "../core/startup/StartupPresentation";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupBrand } from "../ui/StartupBrand";
import { startupTheme } from "../ui/startupTheme";

/** Retain the current deep-link entry until its existing route guards can decide. */
export function StartupRouteGate({ children }: { readonly children: ReactNode }) {
  const context = useRuntime();
  const { readyForNavigation } = useStartupPresentation();

  if (!context.configured) return <Redirect href="/" />;
  if (context.initializationError || context.session.status === "transient_error") {
    return <Redirect href="/startup-recovery" />;
  }
  if (!context.booted || context.session.status === "booting" || context.session.status === "restoring" || !readyForNavigation) {
    return <View style={styles.pending}><StartupBrand /></View>;
  }
  return children;
}

const styles = StyleSheet.create({
  pending: { flex: 1, backgroundColor: startupTheme.background }
});
