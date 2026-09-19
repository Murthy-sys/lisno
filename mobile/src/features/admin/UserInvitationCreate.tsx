import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ROLE_LABELS } from "../../contracts/authorization";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  invitationDeliveryMessage,
  validateInvitationDraft,
  type CreateUserInvitationInput,
  type InvitationField,
  type InvitationFieldErrors,
  type InvitableRole,
  type UserInvitationDraft,
  type UserInvitationSummary
} from "./adminIdentityModel";

const emptyDraft = (roles: readonly InvitableRole[]): UserInvitationDraft => ({
  name: "",
  email: "",
  role: roles[0] ?? "",
  mobile: ""
});

function createFailureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "INVITATION_DELIVERY_UNAVAILABLE") {
    return "Invitation delivery is unavailable. Your entries are preserved; try again later.";
  }
  return "The invitation could not be created. Review the details and try again.";
}

export interface UserInvitationCreateProps {
  readonly roles: readonly InvitableRole[];
  readonly canCreate: boolean;
  readonly onCreated?: ((invitation: UserInvitationSummary) => void) | undefined;
}

export function UserInvitationCreate({
  roles,
  canCreate,
  onCreated
}: UserInvitationCreateProps) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserInvitationDraft>(() => emptyDraft(roles));
  const [errors, setErrors] = useState<InvitationFieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (roles.includes(draft.role as InvitableRole)) return;
    setDraft((current) => ({ ...current, role: roles[0] ?? "" }));
  }, [draft.role, roles]);

  const mutation = useMutation({
    mutationFn: (input: CreateUserInvitationInput) =>
      context.runtime.api.authenticated.post<UserInvitationSummary>(
        "/admin/user-invitations",
        {
          name: input.name,
          email: input.email,
          role: input.role,
          mobile: input.mobile
        }
      ),
    retry: false,
    onSuccess: async (invitation) => {
      setDraft(emptyDraft(roles));
      setErrors({});
      setRequestError(null);
      setOpen(false);
      setNotice(`Invitation created. ${invitationDeliveryMessage(invitation.deliveryStatus)}`);
      onCreated?.(invitation);
      await invalidate("user-changed");
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.fields) {
        const fieldErrors: InvitationFieldErrors = {};
        for (const field of ["name", "email", "role", "mobile"] as const) {
          const message = cause.fields[field];
          if (message) fieldErrors[field] = message;
        }
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      }
      setRequestError(createFailureMessage(cause));
    }
  });

  if (!canCreate) return null;

  const update = (field: InvitationField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setRequestError(null);
    setNotice(null);
  };

  const submit = () => {
    if (mutation.isPending) return;
    const result = validateInvitationDraft(draft, roles);
    setErrors(result.errors);
    setRequestError(null);
    if (result.value) mutation.mutate(result.value);
  };

  if (!open) {
    return (
      <View style={styles.closed}>
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
        <Button
          label="Invite user"
          disabled={roles.length === 0}
          {...(roles.length === 0
            ? { accessibilityHint: "No roles are currently available to invite." }
            : {})}
          onPress={() => {
            setNotice(null);
            setOpen(true);
          }}
        />
      </View>
    );
  }

  return (
    <View accessibilityLabel="Invite user" style={styles.form}>
      <Text accessibilityRole="header" style={styles.title}>Invite user</Text>
      <Text style={styles.copy}>Send a secure account invitation to a staff member.</Text>
      {requestError ? (
        <Text accessibilityLiveRegion="assertive" style={styles.error}>{requestError}</Text>
      ) : null}
      <Field
        label="Name"
        value={draft.name}
        error={errors.name}
        editable={!mutation.isPending}
        autoCapitalize="words"
        autoComplete="name"
        onChangeText={(value) => update("name", value)}
      />
      <Field
        label="Email"
        value={draft.email}
        error={errors.email}
        editable={!mutation.isPending}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        onChangeText={(value) => update("email", value)}
      />
      <View style={styles.group}>
        <Text style={styles.label}>Role</Text>
        <View accessibilityRole="radiogroup" style={styles.roles}>
          {roles.map((role) => {
            const selected = role === draft.role;
            return (
              <Pressable
                key={role}
                accessibilityLabel={ROLE_LABELS[role]}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: mutation.isPending }}
                disabled={mutation.isPending}
                onPress={() => update("role", role)}
                style={[styles.role, selected ? styles.roleSelected : null]}
              >
                <Text style={[styles.roleText, selected ? styles.roleTextSelected : null]}>
                  {ROLE_LABELS[role]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.role ? <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.role}</Text> : null}
      </View>
      <Field
        label="Mobile"
        value={draft.mobile}
        error={errors.mobile}
        editable={!mutation.isPending}
        keyboardType="phone-pad"
        autoComplete="tel"
        onChangeText={(value) => update("mobile", value)}
      />
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label="Cancel"
            variant="quiet"
            disabled={mutation.isPending}
            onPress={() => {
              setOpen(false);
              setErrors({});
              setRequestError(null);
            }}
          />
        </View>
        <View style={styles.action}>
          <Button label="Send invitation" loading={mutation.isPending} onPress={submit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  closed: { gap: spacing.sm },
  form: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.surface,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  group: { gap: 6 },
  label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  role: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md
  },
  roleSelected: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
  roleText: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 13 },
  roleTextSelected: { color: colors.violet },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});
