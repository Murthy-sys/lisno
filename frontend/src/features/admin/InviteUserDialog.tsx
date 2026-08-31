import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ROLE_LABELS } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  CreateUserInvitationInput,
  InvitableRole,
  UserInvitationItem
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { createUserInvitation, userInvitationKeys } from "./userInvitationsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";

interface InviteUserDialogProps {
  roles: readonly InvitableRole[];
  onClose(): void;
}

type InvitationField = keyof CreateUserInvitationInput;
type FieldErrors = Partial<Record<InvitationField, string>>;

const fieldOrder: InvitationField[] = ["name", "email", "role", "mobile"];
const controlCharacters = /[\u0000-\u001F\u007F-\u009F]/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const mobilePattern = /^\+?[0-9 ()-]+$/u;

function normalizeMobile(value: string): string {
  return value.trim().replace(/ +/gu, " ");
}

function validate(
  values: Record<InvitationField, string>,
  roles: readonly InvitableRole[]
): { input?: CreateUserInvitationInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const mobile = normalizeMobile(values.mobile);
  const digitCount = mobile.replace(/[^0-9]/gu, "").length;

  if (!name) errors.name = "Name is required.";
  else if (name.length > 120 || controlCharacters.test(values.name)) {
    errors.name = "Enter a valid name of 120 characters or fewer.";
  }
  if (!email) errors.email = "Email is required.";
  else if (
    email.length > 254 ||
    controlCharacters.test(values.email) ||
    !emailPattern.test(email)
  ) {
    errors.email = "Enter a valid email address.";
  }
  if (!roles.includes(values.role as InvitableRole)) {
    errors.role = "Choose an available role.";
  }
  if (!mobile) errors.mobile = "Mobile is required.";
  else if (
    mobile.length > 30 ||
    controlCharacters.test(values.mobile) ||
    !mobilePattern.test(mobile) ||
    digitCount < 7 ||
    digitCount > 15
  ) {
    errors.mobile = "Mobile must contain 7 to 15 ASCII digits.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      name,
      email,
      role: values.role as InvitableRole,
      mobile
    }
  };
}

function deliveryMessage(invitation: UserInvitationItem): string {
  if (invitation.deliveryStatus === "sent") return "Email sent.";
  if (invitation.deliveryStatus === "queued") return "Email queued.";
  return "Email delivery failed. You can resend from the invitation list.";
}

export function InviteUserDialog({ roles, onClose }: InviteUserDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [values, setValues] = useState<Record<InvitationField, string>>({
    name: "",
    email: "",
    role: roles[0] ?? "",
    mobile: ""
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState("");
  const controls = useRef<Partial<Record<InvitationField, HTMLElement | null>>>({});

  const mutation = useMutation({
    mutationFn: createUserInvitation,
    retry: false,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userInvitationKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      feedback.success({
        title: "Invitation created.",
        message: deliveryMessage(result)
      });
      onClose();
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.fields) {
        const nextErrors: FieldErrors = {};
        for (const field of fieldOrder) {
          if (failure.fields[field]) nextErrors[field] = failure.fields[field];
        }
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          controls.current[fieldOrder.find((field) => nextErrors[field])!]?.focus();
          return;
        }
      }
      setRequestError(
        failure instanceof ApiError &&
          failure.code === "INVITATION_DELIVERY_UNAVAILABLE"
          ? "Invitation delivery is unavailable. Your entries are preserved; try again later."
          : "The invitation could not be created. Review the details and try again."
      );
    }
  });

  useEffect(() => {
    if (roles.includes(values.role as InvitableRole)) return;
    setValues((current) => ({ ...current, role: roles[0] ?? "" }));
  }, [roles, values.role]);

  const update = (field: InvitationField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const result = validate(values, roles);
    setErrors(result.errors);
    setRequestError("");
    if (!result.input) {
      controls.current[fieldOrder.find((field) => result.errors[field])!]?.focus();
      return;
    }
    mutation.mutate(result.input);
  };

  return (
    <Dialog
      title="Invite user"
      eyebrow="User administration"
      description="Send a secure invitation to a staff member."
      busy={mutation.isPending}
      onClose={onClose}
    >
      <form className="user-invitation-dialog" onSubmit={submit} noValidate>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {mutation.isPending ? "Sending invitation. Please wait." : ""}
        </p>
        {requestError ? (
          <p className="user-invitation-dialog__error" role="alert">
            {requestError}
          </p>
        ) : null}

        <Field id="invitation-name" label="Name" required error={errors.name}>
          {(controlProps) => (
            <Input
              {...controlProps}
              data-dialog-initial-focus
              autoComplete="name"
              value={values.name}
              disabled={mutation.isPending}
              ref={(element) => { controls.current.name = element; }}
              onChange={(event) => update("name", event.target.value)}
            />
          )}
        </Field>
        <Field id="invitation-email" label="Email" required error={errors.email}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="email"
              autoComplete="email"
              value={values.email}
              disabled={mutation.isPending}
              ref={(element) => { controls.current.email = element; }}
              onChange={(event) => update("email", event.target.value)}
            />
          )}
        </Field>
        <Field id="invitation-role" label="Role" required error={errors.role}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={values.role}
              disabled={mutation.isPending}
              ref={(element) => { controls.current.role = element; }}
              onChange={(event) => update("role", event.target.value)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="invitation-mobile" label="Mobile" required error={errors.mobile}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="tel"
              autoComplete="tel"
              value={values.mobile}
              disabled={mutation.isPending}
              ref={(element) => { controls.current.mobile = element; }}
              onChange={(event) => update("mobile", event.target.value)}
            />
          )}
        </Field>

        <div className="user-invitation-dialog__actions">
          <Button
            variant="quiet"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            busy={mutation.isPending}
            busyLabel="Sending…"
          >
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
