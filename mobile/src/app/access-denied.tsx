import { useNavigation } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { useState } from "react";
import { Text } from "react-native";

import { useScreenBack } from "../navigation/useScreenBack";
import { useRuntime } from "../runtime/RuntimeProvider";
import { BackButton } from "../ui/BackButton";
import { Button, Screen, StateView } from "../ui/primitives";

export default function AccessDeniedScreen() {
  const runtime = useRuntime();
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const back = useScreenBack({ blocked: busy });
  const signOut = async () => {
    if (!runtime.configured || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await runtime.runtime.session.logout();
      const reset = CommonActions.reset({ index: 0, routes: [{ name: "sign-in" }] });
      if (reset.payload) navigation.dispatch({ type: reset.type, payload: reset.payload });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      {back.visible ? <BackButton onPress={back.onBack} disabled={back.disabled} /> : null}
      <StateView
        tone="denied"
        title="This workspace is unavailable"
        message="Your account does not currently have access to this destination. Access is checked by the Lisno service for every action."
      />
      {runtime.configured && runtime.session.status === "authenticated" ? <Button label="Sign out" variant="secondary" loading={busy} onPress={() => void signOut()} /> : null}
      {failed ? <Text accessibilityLiveRegion="assertive">Could not sign out. Try again.</Text> : null}
    </Screen>
  );
}
