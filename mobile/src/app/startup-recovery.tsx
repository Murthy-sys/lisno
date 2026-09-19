import { router } from "expo-router";

import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { Button, Heading, Screen } from "../ui/primitives";

export default function StartupRecoveryScreen() {
  const context = useConfiguredRuntime();
  return (
    <Screen>
      <Heading
        eyebrow="Startup"
        title="We couldn’t restore your workspace"
        subtitle="Your credentials remain protected. Retry startup or sign in again."
      />
      <Button label="Retry" onPress={() => void context.retryRestore().then(() => router.replace("/"))} />
      <Button
        label="Sign in again"
        variant="secondary"
        onPress={() => void context.runtime.session.logout().then(() => router.replace("/sign-in"))}
      />
    </Screen>
  );
}
