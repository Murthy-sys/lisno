import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  REQUESTABLE_PROJECT_MODULES,
  roleMayRequestModule,
  type RequestableProjectModule,
  type Role
} from "../../api/authorization-contract";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { createAccessRequest, ownAccessRequestKeys } from "./accessRequestsApi";

export const opaqueProjectIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const accessRequestFormSchema = z
  .object({
    projectId: opaqueProjectIdSchema,
    module: z.enum(REQUESTABLE_PROJECT_MODULES),
    reason: z.string().trim().min(1).max(1000)
  })
  .strict();

interface AccessRequestDialogProps {
  role: Role;
  module: RequestableProjectModule;
  initialProjectId?: string;
  onClose(): void;
}

interface FormErrors {
  projectId?: string;
  reason?: string;
  form?: string;
}

export function AccessRequestDialog({
  role,
  module,
  initialProjectId = "",
  onClose
}: AccessRequestDialogProps) {
  const auth = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    feedback.announce("");
  }, [feedback]);

  const mutation = useMutation({
    mutationFn: createAccessRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all });
      feedback.announce("Your access request was accepted for review.");
      onClose();
    },
    onError: () => {
      setErrors({ form: "The request could not be submitted." });
    }
  });

  const submit = () => {
    const parsed = accessRequestFormSchema.safeParse({ projectId, module, reason });
    const nextErrors: FormErrors = {};
    if (!opaqueProjectIdSchema.safeParse(projectId).success) {
      nextErrors.projectId = "Use an opaque project ID without spaces or slashes.";
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      nextErrors.reason = "Explain why access is needed.";
    } else if (trimmedReason.length > 1000) {
      nextErrors.reason = "Keep the reason within 1000 characters.";
    }
    if (
      !parsed.success ||
      !auth.user ||
      auth.user.role !== role ||
      !roleMayRequestModule(role, module) ||
      !hasFrontendPermission(auth.authorization, "access_request.create")
    ) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <Dialog
      title="Request project access"
      eyebrow="Project access"
      description="Submit the opaque project identifier supplied to you."
      busy={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="access-request-dialog"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {errors.form ? (
          <p className="access-request-dialog__error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <Field
          id="access-request-project-id"
          label="Project ID"
          required
          error={errors.projectId ? <span role="alert">{errors.projectId}</span> : undefined}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              data-dialog-initial-focus
              value={projectId}
              disabled={mutation.isPending}
              autoComplete="off"
              onChange={(event) => {
                setProjectId(event.target.value);
                setErrors((current) => ({ ...current, projectId: undefined, form: undefined }));
              }}
            />
          )}
        </Field>
        <Field id="access-request-module" label="Module" required>
          {(controlProps) => (
            <Select {...controlProps} value={module} disabled>
              <option value={module}>{module}</option>
            </Select>
          )}
        </Field>
        <Field
          id="access-request-reason"
          label="Reason"
          required
          error={errors.reason ? <span role="alert">{errors.reason}</span> : undefined}
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              rows={5}
              value={reason}
              disabled={mutation.isPending}
              onChange={(event) => {
                setReason(event.target.value);
                setErrors((current) => ({ ...current, reason: undefined, form: undefined }));
              }}
            />
          )}
        </Field>
        <div className="access-request-dialog__actions">
          <Button variant="quiet" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={mutation.isPending} busyLabel="Submitting…">
            Create request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
