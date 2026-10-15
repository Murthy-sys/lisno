import { useURL } from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { z } from "zod";
import { ApiError } from "../../core/http/apiClient";
import { useScreenBack } from "../../navigation/useScreenBack";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BackButton } from "../../ui/BackButton";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts } from "../../ui/tokens";
import { AuthFrame } from "./AuthFrame";
import { newPasswordSchema } from "./validation";

const inspectionSchema = z.object({ projectId: z.string().min(1), projectName: z.string(), clientName: z.string(), email: z.string().email(), expiresAt: z.string(), requiresSignIn: z.boolean() });
type Inspection = z.infer<typeof inspectionSchema>;
export function invitationToken(parameter: unknown, url: string | null): string {
  if (typeof parameter === "string" && parameter) return parameter;
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!`${parsed.hostname}${parsed.pathname}`.endsWith("accept-project-invitation")) return "";
    return new URLSearchParams(parsed.hash.slice(1)).get("token") ?? "";
  } catch { return ""; }
}
export function ProjectInvitationScreen() {
  const context = useConfiguredRuntime(); const params = useLocalSearchParams<{ token?: string | string[] }>(); const url = useURL();
  const token = invitationToken(params.token, url); const [inspection, setInspection] = useState<Inspection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading"); const [error, setError] = useState("");
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const back = useScreenBack({ blocked: busy });
  const environmentGeneration = context.environment.generation;
  const currentSession = context.session.status === "authenticated" ? context.session.session : null;
  const matches = currentSession?.user.role === "client" && currentSession.user.email.toLowerCase() === inspection?.email.toLowerCase();
  const wrongAccount = Boolean(currentSession && !matches);
  useEffect(() => {
    let active = true; setInspection(null); setError(""); setStatus("loading"); setPassword(""); setConfirmation("");
    if (!token) { setStatus("error"); setError("Open the secure project invitation from your email."); return; }
    void context.runtime.api.public.post("/auth/project-invitations/inspect", { token }).then((value) => {
      const result = inspectionSchema.safeParse(value);
      if (!active) return;
      if (result.success) { setInspection(result.data); setStatus("ready"); }
      else { setStatus("error"); setError("This invitation could not be verified."); }
    }, () => { if (active) { setStatus("error"); setError("This invitation is unavailable, expired or already used. Request a new invitation from your project team."); } });
    return () => { active = false; };
  }, [context.runtime.api.public, token, environmentGeneration]);
  async function accept() {
    if (lock.current || !inspection || wrongAccount) return;
    if (!matches && !inspection.requiresSignIn) {
      const valid = newPasswordSchema.safeParse({ password, passwordConfirmation: confirmation });
      if (!valid.success) { setError(valid.error.issues[0]?.message ?? "Check both password fields."); return; }
    } else if (!matches && !password) { setError("Enter your existing account password."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      if (!matches && !inspection.requiresSignIn) {
        await context.runtime.session.acceptProjectInvitation({ token, password, passwordConfirmation: confirmation }, inspection.projectId);
      } else {
        if (!matches) await context.runtime.session.login({ email: inspection.email, password });
        const accepted = await context.runtime.api.authenticated.post<{ projectId: string }>("/auth/project-invitations/accept-existing", { token });
        if (accepted.projectId !== inspection.projectId) throw new Error("Invitation project changed");
      }
      setPassword(""); setConfirmation("");
      router.replace({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: inspection.projectId } });
    } catch (cause) {
      setPassword(""); setConfirmation("");
      setError(cause instanceof ApiError && cause.status === 401 ? "Check your account password and try again." : "The invitation could not be completed. Sign in to check your project access or request a fresh link.");
    } finally { lock.current = false; setBusy(false); }
  }
  return <AuthFrame eyebrow="PROJECT INVITATION" title={inspection ? `Join ${inspection.projectName}` : "Join your project"} subtitle="Your secure invitation connects this project to your Client account."
    back={back.visible ? <BackButton onPress={back.onBack} disabled={busy} accessibilityLabel="Back to sign in" /> : null}>
    {status === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.copy}>Checking invitation…</Text> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    {status === "ready" && inspection ? <>
      <Text style={styles.copy}>{inspection.clientName} · {inspection.email}</Text>
      <Text style={styles.copy}>Invitation expires {new Date(inspection.expiresAt).toLocaleString()}.</Text>
      {wrongAccount ? <><Text style={styles.error}>Sign out of the current account to join using the invited email.</Text><Button label="Sign out" variant="secondary" disabled={busy} onPress={() => void context.runtime.session.logout()} /></> : <>
        {!matches ? <Field label={inspection.requiresSignIn ? "Account password" : "New password"} value={password} onChangeText={setPassword} secureTextEntry editable={!busy} autoComplete={inspection.requiresSignIn ? "current-password" : "new-password"} /> : null}
        {!matches && !inspection.requiresSignIn ? <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry editable={!busy} autoComplete="new-password" /> : null}
        <Button label="Accept project invitation" loading={busy} onPress={() => void accept()} />
      </>}
    </> : null}
  </AuthFrame>;
}
const styles = StyleSheet.create({ copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 } });
