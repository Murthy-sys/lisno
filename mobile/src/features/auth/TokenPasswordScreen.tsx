import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useScreenBack } from "../../navigation/useScreenBack";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BackButton } from "../../ui/BackButton";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { AuthFrame } from "./AuthFrame";
import { firstIssue, newPasswordSchema } from "./validation";

type TokenFlow = "reset" | "invitation";

const routeByFlow = {
  reset: {
    inspect: "/auth/password-reset/inspect",
    complete: "/auth/password-reset/complete",
    eyebrow: "ACCOUNT RECOVERY",
    title: "Choose a new password",
    success: "Your password has been reset."
  },
  invitation: {
    inspect: "/auth/user-invitations/inspect",
    complete: "/auth/user-invitations/accept",
    eyebrow: "WORKSPACE INVITATION",
    title: "Secure your account",
    success: "Your invitation has been accepted."
  }
} as const;

export function TokenPasswordScreen({ flow }: { readonly flow: TokenFlow }) {
  const context = useConfiguredRuntime();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === "string" ? params.token : "";
  const copy = routeByFlow[flow];
  const [status, setStatus] = useState<"inspecting" | "ready" | "invalid" | "complete">("inspecting");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ password: string | undefined; passwordConfirmation: string | undefined }>({ password: undefined, passwordConfirmation: undefined });
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = useScreenBack({ blocked: busy });

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus("invalid");
      return;
    }
    void context.runtime.api.public.post(copy.inspect, { token }).then(
      () => { if (active) setStatus("ready"); },
      () => { if (active) setStatus("invalid"); }
    );
    return () => { active = false; };
  }, [context.runtime.api.public, copy.inspect, token]);

  const submit = async () => {
    if (busy) return;
    const parsed = newPasswordSchema.safeParse({ password, passwordConfirmation: confirmation });
    if (!parsed.success) {
      setErrors({
        password: firstIssue(parsed, "password"),
        passwordConfirmation: firstIssue(parsed, "passwordConfirmation")
      });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await context.runtime.api.public.post(copy.complete, { token, ...parsed.data });
      setPassword("");
      setConfirmation("");
      setStatus("complete");
    } catch (cause) {
      setBanner(cause instanceof ApiError && [400, 404, 409, 410].includes(cause.status) ? "This secure link is invalid, expired, or already used." : "The account could not be updated. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      eyebrow={copy.eyebrow}
      title={status === "complete" ? "You’re ready" : copy.title}
      subtitle="Use a unique password of at least 12 characters."
      back={back.visible ? <BackButton onPress={back.onBack} disabled={back.disabled} accessibilityLabel="Back to sign in" accessibilityHint="Returns to sign in and closes this secure link." /> : null}
    >
      {status === "inspecting" ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Checking secure link…</Text> : null}
      {status === "invalid" ? (
        <>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>This secure link is invalid, expired, or already used.</Text>
        </>
      ) : null}
      {status === "complete" ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.notice}>{copy.success}</Text>
          <Button label="Continue to sign in" onPress={back.onBack} />
        </>
      ) : null}
      {status === "ready" ? (
        <>
          {banner ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{banner}</Text> : null}
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={errors.password} />
          <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" error={errors.passwordConfirmation} />
          <Button label={flow === "reset" ? "Reset password" : "Accept invitation"} loading={busy} onPress={() => void submit()} />
        </>
      ) : null}
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  notice: { color: colors.info, backgroundColor: colors.infoSoft, borderRadius: radii.control, padding: spacing.md, fontFamily: fonts.regular, fontSize: 13 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.control, padding: spacing.md, fontFamily: fonts.regular, fontSize: 13 }
});
