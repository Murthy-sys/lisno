import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import {
  InvalidAuthorizationSnapshotError,
  InvalidSessionPayloadError
} from "../../core/session/authorization";
import { useRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { AuthFrame } from "./AuthFrame";
import { firstIssue, loginSchema } from "./validation";

function signInError(error: unknown): string {
  if (
    error instanceof InvalidAuthorizationSnapshotError ||
    error instanceof InvalidSessionPayloadError
  ) {
    return "This app is out of sync with the Lisno service. Update or reload the app and try again.";
  }
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === "TOO_MANY_ATTEMPTS") return "Too many attempts. Wait a moment before trying again.";
    if (["ACCOUNT_LOCKED", "SECURITY_LOCKED"].includes(error.code)) return "This account has been locked for security.";
    if (["ACCOUNT_DEACTIVATED", "DEACTIVATED"].includes(error.code)) return "This account has been deactivated.";
    if (error.code === "SSO_REQUIRED") return "This account requires company SSO, which is not available from the current mobile backend.";
  }
  return "Email or password is incorrect.";
}

export function SignInScreen() {
  const context = useRuntime();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email: string | undefined; password: string | undefined }>({ email: undefined, password: undefined });
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!context.configured) {
    router.replace("/");
    return null;
  }

  const submit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors({
        email: firstIssue(parsed, "email"),
        password: firstIssue(parsed, "password")
      });
      return;
    }
    setErrors({ email: undefined, password: undefined });
    setBanner(null);
    setBusy(true);
    try {
      await context.runtime.session.login(parsed.data);
      setPassword("");
      router.replace("/");
    } catch (error) {
      setPassword("");
      setBanner(signInError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="SECURE ACCESS"
      title="Welcome back"
      subtitle="Sign in to the workspace assigned to your Lisno account."
    >
      {banner ? <Text accessibilityLiveRegion="assertive" style={styles.banner}>{banner}</Text> : null}
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="next"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button label="Sign in" loading={busy} onPress={() => void submit()} />
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => router.push("/forgot-password")}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  banner: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.sm, borderRadius: 8, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.md, paddingTop: spacing.xs },
  link: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 13, minHeight: 48, textAlignVertical: "center" }
});
