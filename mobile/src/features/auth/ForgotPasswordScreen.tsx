import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useScreenBack } from "../../navigation/useScreenBack";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BackButton } from "../../ui/BackButton";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { AuthFrame } from "./AuthFrame";
import { firstIssue, recoverySchema } from "./validation";

export function ForgotPasswordScreen() {
  const context = useConfiguredRuntime();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const back = useScreenBack({ blocked: busy });

  const submit = async () => {
    if (busy) return;
    const parsed = recoverySchema.safeParse({ email });
    if (!parsed.success) {
      setError(firstIssue(parsed, "email") ?? "Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await context.runtime.api.public.post("/auth/password-reset/request", parsed.data);
      setEmail("");
      setAccepted(true);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 503 || cause.code === "PASSWORD_RESET_DELIVERY_UNAVAILABLE")) {
        setError("Password reset email is temporarily unavailable. Try again later.");
      } else if (cause instanceof ApiError && cause.status === 429) {
        setError("Too many requests. Wait a moment before trying again.");
      } else {
        setError("Reset instructions could not be requested.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="ACCOUNT RECOVERY"
      title={accepted ? "Request received" : "Reset your password"}
      subtitle={accepted ? "If an eligible account exists for that email, reset instructions will be sent." : "Enter your account email to receive a secure reset link."}
      back={back.visible ? <BackButton onPress={back.onBack} disabled={back.disabled} accessibilityLabel="Back to sign in" accessibilityHint="Returns to the sign-in screen." /> : null}
    >
      {accepted ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.notice}>Check your inbox and spam folder. Wait a few minutes before trying again.</Text>
          <Button label="Try another email" variant="quiet" onPress={() => { setAccepted(false); setError(null); }} />
        </>
      ) : (
        <>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            error={error ?? undefined}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={() => void submit()}
          />
          <Button label="Send reset instructions" loading={busy} onPress={() => void submit()} />
        </>
      )}
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  notice: { color: colors.info, backgroundColor: colors.infoSoft, borderRadius: radii.control, padding: spacing.md, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 }
});
