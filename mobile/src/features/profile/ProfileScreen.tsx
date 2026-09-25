import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ROLE_LABELS } from "../../contracts/authorization";
import type { AuthenticatedSession, PublicUser } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { ProfileAvatar } from "../../navigation/ProfileAvatar";
import {
  capturePhoto,
  pickImage,
  releaseSelectedAsset,
  type CancellableTransfer,
  type SelectedAsset
} from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, radii, spacing, typography } from "../../ui/tokens";
import {
  PROFILE_PHOTO_POLICY,
  profilePhotoErrorMessage,
  removeProfilePhoto,
  uploadProfilePhoto
} from "./profilePhotoApi";

type Pending = "library" | "camera" | "upload" | "remove";

interface Failure {
  readonly message: string;
  readonly retry: "upload" | "remove" | null;
}

const CAMERA_DENIED = "Camera access is needed to take a photo. You can still choose one from your library.";
const CAMERA_SETTINGS = "Camera access is off for Lisno. Turn it on in Settings, or choose a photo from your library.";

export function ProfileScreen() {
  const context = useConfiguredRuntime();
  const authenticated = context.session.status === "authenticated" ? context.session.session : null;
  if (!authenticated) {
    router.replace("/sign-in");
    return null;
  }

  return (
    <AdaptiveAppScaffold profile>
      <ProfileContent session={authenticated} />
    </AdaptiveAppScaffold>
  );
}

function ProfileContent({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const user = session.user;
  const canManagePhoto =
    canPerformOperation(session, "PUT /auth/me/profile-photo") &&
    canPerformOperation(session, "DELETE /auth/me/profile-photo");
  const hasPhoto = user.profilePhotoVersion !== undefined;

  const [pending, setPending] = useState<Pending | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mounted = useRef(true);
  const transfer = useRef<CancellableTransfer<PublicUser> | null>(null);
  const removal = useRef<AbortController | null>(null);
  /** The picked photo is kept until it uploads so Retry resends the same file. */
  const retained = useRef<SelectedAsset | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      transfer.current?.cancel();
      removal.current?.abort();
      const asset = retained.current;
      retained.current = null;
      if (asset) void releaseSelectedAsset(asset).catch(() => undefined);
    };
  }, []);

  const retain = (asset: SelectedAsset | null) => {
    const previous = retained.current;
    retained.current = asset;
    if (previous && previous !== asset) void releaseSelectedAsset(previous).catch(() => undefined);
  };

  const applyUser = (next: PublicUser, message: string) => {
    context.runtime.session.replaceUser(next);
    setNotice(message);
  };

  const upload = async (asset: SelectedAsset) => {
    setPending("upload");
    setProgress(0);
    setFailure(null);
    setNotice(null);
    try {
      const active = uploadProfilePhoto(context.runtime.transfers, asset, {
        onProgress: (value) => {
          if (mounted.current) setProgress(value.fraction);
        }
      });
      transfer.current = active;
      const next = await active.result;
      if (!mounted.current || transfer.current !== active) return;
      retain(null);
      applyUser(next, "Profile photo updated.");
    } catch (cause) {
      if (!mounted.current) return;
      setFailure({
        message: profilePhotoErrorMessage(cause, "Your photo could not be uploaded. Try again."),
        retry: "upload"
      });
    } finally {
      transfer.current = null;
      if (mounted.current) {
        setPending(null);
        setProgress(null);
      }
    }
  };

  const choose = async (source: "library" | "camera") => {
    if (pending) return;
    setChoosing(false);
    setPending(source);
    setFailure(null);
    setNotice(null);
    const scope = {
      environmentId: context.environment.environment.id,
      userId: user.id,
      projectId: "profile",
      sessionGeneration: context.session.generation
    };
    try {
      const result = source === "library"
        ? await pickImage(PROFILE_PHOTO_POLICY, scope, { squareCrop: true })
        : await capturePhoto(PROFILE_PHOTO_POLICY, scope, { squareCrop: true });
      if (!mounted.current) {
        if (result.status === "selected") await releaseSelectedAsset(result.asset).catch(() => undefined);
        return;
      }
      if (result.status === "permission-denied-temporary") {
        setFailure({ message: CAMERA_DENIED, retry: null });
        return;
      }
      if (result.status === "permission-denied-permanent") {
        setFailure({ message: CAMERA_SETTINGS, retry: null });
        return;
      }
      if (result.status === "unavailable") {
        setFailure({ message: "The camera is unavailable right now. You can still choose a photo from your library.", retry: null });
        return;
      }
      if (result.status !== "selected") return;
      retain(result.asset);
      await upload(result.asset);
    } catch (cause) {
      if (mounted.current) {
        setFailure({ message: profilePhotoErrorMessage(cause, "The photo could not be selected."), retry: null });
      }
    } finally {
      if (mounted.current) setPending((current) => (current === source ? null : current));
    }
  };

  const remove = async () => {
    if (pending) return;
    setPending("remove");
    setFailure(null);
    setNotice(null);
    const controller = new AbortController();
    removal.current = controller;
    try {
      const next = await removeProfilePhoto(context.runtime.api, controller.signal);
      if (!mounted.current || removal.current !== controller) return;
      setConfirmingRemove(false);
      applyUser(next, "Profile photo removed.");
    } catch (cause) {
      if (!mounted.current) return;
      setConfirmingRemove(false);
      setFailure({
        message: profilePhotoErrorMessage(cause, "Your photo could not be removed. Try again."),
        retry: "remove"
      });
    } finally {
      if (removal.current === controller) removal.current = null;
      if (mounted.current) setPending(null);
    }
  };

  const retry = () => {
    if (failure?.retry === "upload" && retained.current) void upload(retained.current);
    else if (failure?.retry === "remove") void remove();
  };

  const busy = pending !== null;
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const progressLabel = progress === null ? "Uploading photo…" : `Uploading photo… ${Math.round(progress * 100)}%`;
  const canRetry =
    failure !== null &&
    (failure.retry === "remove" || (failure.retry === "upload" && retained.current !== null));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text accessibilityRole="header" style={styles.title}>Profile</Text>
      </View>

      <View style={styles.identity}>
        <View accessible accessibilityLabel={hasPhoto ? `Profile photo of ${user.name}` : `${user.name} initials`} accessibilityRole="image">
          <ProfileAvatar user={user} size={96} />
        </View>
        <View style={styles.identityText}>
          <Text accessibilityLabel={`Name, ${user.name}`} style={styles.name}>{user.name}</Text>
          <Text accessibilityLabel={`Email, ${user.email}`} style={styles.email}>{user.email}</Text>
          <Text accessibilityLabel={`Role, ${roleLabel}`} style={styles.role}>{roleLabel}</Text>
        </View>
      </View>

      {canManagePhoto ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile photo</Text>
          {pending === "upload" ? (
            <Text accessibilityLiveRegion="polite" style={styles.progress}>{progressLabel}</Text>
          ) : null}
          {failure ? (
            <View style={styles.failure}>
              <Text accessibilityLiveRegion="assertive" style={styles.error}>{failure.message}</Text>
              {canRetry ? <Button label="Retry" variant="secondary" disabled={busy} onPress={retry} /> : null}
            </View>
          ) : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}

          {confirmingRemove ? (
            <View accessibilityLabel="Remove profile photo confirmation" style={styles.confirmation}>
              <Text accessibilityRole="header" style={styles.confirmTitle}>Remove your profile photo?</Text>
              <Text style={styles.copy}>Your initials will be shown instead.</Text>
              <View style={styles.actions}>
                <View style={styles.action}>
                  <Button label="Cancel" variant="quiet" disabled={pending === "remove"} onPress={() => setConfirmingRemove(false)} />
                </View>
                <View style={styles.action}>
                  <Button label="Confirm remove" variant="danger" loading={pending === "remove"} disabled={busy && pending !== "remove"} onPress={() => void remove()} />
                </View>
              </View>
            </View>
          ) : choosing ? (
            <View accessibilityLabel="Choose a photo source" style={styles.chooser}>
              <Button label="Choose from library" variant="secondary" disabled={busy} onPress={() => void choose("library")} />
              <Button label="Take photo" variant="secondary" disabled={busy} onPress={() => void choose("camera")} />
              <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setChoosing(false)} />
            </View>
          ) : (
            <View style={styles.chooser}>
              <Button
                label={hasPhoto ? "Change photo" : "Add photo"}
                loading={busy && pending !== "remove"}
                disabled={busy}
                onPress={() => {
                  setFailure(null);
                  setNotice(null);
                  setChoosing(true);
                }}
              />
              {hasPhoto ? (
                <Button
                  label="Remove photo"
                  variant="danger"
                  disabled={busy}
                  onPress={() => {
                    setFailure(null);
                    setNotice(null);
                    setConfirmingRemove(true);
                  }}
                />
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 860, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.ink, ...typography.pageTitle },
  identity: { alignItems: "center", gap: spacing.md, borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  identityText: { alignItems: "center", gap: spacing.xxs, maxWidth: "100%" },
  name: { color: colors.ink, ...typography.cardTitle, textAlign: "center" },
  email: { color: colors.inkMuted, ...typography.body, textAlign: "center" },
  role: { color: colors.violet, ...typography.metadata, fontFamily: fonts.semibold, textAlign: "center" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  chooser: { gap: spacing.sm },
  progress: { color: colors.inkMuted, ...typography.metadata },
  failure: { gap: spacing.xs },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  confirmation: { gap: spacing.sm, borderWidth: 1, borderColor: colors.danger, borderRadius: radii.surface, backgroundColor: colors.dangerSoft, padding: spacing.md },
  confirmTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});
