import { router } from "expo-router";

import { Button, Screen, StateView } from "../ui/primitives";

export default function AccessDeniedScreen() {
  return (
    <Screen>
      <StateView
        tone="denied"
        title="This workspace is unavailable"
        message="Your account does not currently have access to this destination. Access is checked by the Lisno service for every action."
      />
      <Button label="Return home" onPress={() => router.replace("/")} />
    </Screen>
  );
}
