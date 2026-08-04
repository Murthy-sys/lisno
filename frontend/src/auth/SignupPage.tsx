import { Eye, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import type { ClientSignupInput } from "../api/types";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { IconButton } from "../components/ui/IconButton";
import { InlineMessage } from "../components/ui/InlineMessage";
import { useAuth } from "./AuthProvider";

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    mobile: z.string().trim().min(1, "Mobile number is required."),
    address: z.string().trim().min(1, "Address is required."),
    password: z
      .string()
      .min(1, "Password is required.")
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must be at most 128 characters."),
    passwordConfirmation: z.string().min(1, "Confirm your password.")
  })
  .superRefine((values, context) => {
    if (values.password && values.passwordConfirmation && values.password !== values.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordConfirmation"],
        message: "Passwords do not match."
      });
    }
  });

type SignupFields = z.infer<typeof signupSchema>;

const fieldOrder: Array<keyof SignupFields> = [
  "name",
  "email",
  "mobile",
  "address",
  "password",
  "passwordConfirmation"
];

export function SignupPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const fields = useRef<Partial<Record<keyof SignupFields, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const resolveSignupIntent = useRef<(() => void) | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<SignupFields>({
    defaultValues: {
      name: "",
      email: "",
      mobile: "",
      address: "",
      password: "",
      passwordConfirmation: ""
    }
  });

  const assignRef = (field: keyof SignupFields) => {
    const { ref, ...registration } = register(field);
    return {
      ...registration,
      ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
        ref(element as HTMLInputElement);
        fields.current[field] = element;
      }
    };
  };

  const setFieldErrors = (messages: Partial<Record<keyof SignupFields, string>>) => {
    for (const field of fieldOrder) {
      const message = messages[field];
      if (message) setError(field, { message });
    }
    const summary = fieldOrder.flatMap((field) => (messages[field] ? [messages[field]!] : []));
    setValidationSummary(summary);
    const firstField = fieldOrder.find((field) => messages[field]);
    if (firstField) fields.current[firstField]?.focus();
  };

  useLayoutEffect(() => {
    const signupState = location.state as { signupRouteFocus?: unknown } | null;
    if (signupState?.signupRouteFocus === true) {
      resolveSignupIntent.current?.();
      resolveSignupIntent.current = null;
    }
  }, [location.key, location.state]);

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      const messages: Partial<Record<keyof SignupFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && fieldOrder.includes(field as keyof SignupFields)) {
          messages[field as keyof SignupFields] ??= issue.message;
        }
      }
      setFieldErrors(messages);
      return;
    }

    setValidationSummary([]);
    await new Promise<void>((resolve) => {
      resolveSignupIntent.current = resolve;
      navigate("/signup", {
        replace: true,
        state: { signupRouteFocus: true }
      });
    });
    try {
      await auth.signupClient(parsed.data satisfies ClientSignupInput);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        const messages: Partial<Record<keyof SignupFields, string>> = {};
        for (const field of fieldOrder) {
          if (error.fields[field]) messages[field] = error.fields[field];
        }
        if (Object.keys(messages).length > 0) {
          setFieldErrors(messages);
          return;
        }
      }
      setSubmitError(
        error instanceof ApiError && error.code === "ACCOUNT_EXISTS"
          ? "An account already exists for this email."
          : "We couldn't create your account. Please try again."
      );
    }
  });

  return (
    <main className="login-page login-page--signup">
      <section className="login-story" aria-label="Lisno client portal">
        <a href="#signup-form" className="skip-link">Skip to account creation</a>
        <div className="brand brand--light"><BrandLogo light /></div>
        <div className="login-story__content">
          <p className="eyebrow">Your project, in view</p>
          <h2>Follow every design decision.</h2>
          <p>Create your client account to see approved plans, progress, and delivery updates in one place.</p>
        </div>
        <p className="login-story__note">Clear updates. Confident approvals. Beautiful outcomes.</p>
      </section>

      <section className="login-panel" aria-labelledby="signup-title">
        <div className="login-card signup-card">
          <div className="brand brand--mobile"><BrandLogo /></div>
          <p className="eyebrow">Client portal</p>
          <h1 id="signup-title">Create your client account</h1>
          <p className="login-card__intro">Use the email associated with your design project.</p>

          <form
            id="signup-form"
            onSubmit={submit}
            noValidate
            aria-busy={isSubmitting}
          >
            <p
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Signup status"
            >
              {isSubmitting ? "Creating account. Please wait." : ""}
            </p>
            {submitError ? (
              <InlineMessage tone="error" role="alert" label="Signup error">
                {submitError}
              </InlineMessage>
            ) : null}
            {validationSummary.length > 0 ? (
              <div className="form-alert form-alert--validation" role="status" aria-live="polite" aria-label="Signup validation summary">
                <strong>Review the highlighted fields:</strong>
                <ul>{validationSummary.map((message) => <li key={message}>{message}</li>)}</ul>
              </div>
            ) : null}

            <Field id="signup-name" className="field" label="Full name" error={errors.name?.message}>
              {(controlProps) => (
                <Input {...controlProps} autoComplete="name" {...assignRef("name")} />
              )}
            </Field>
            <Field id="signup-email" className="field" label="Email address" error={errors.email?.message}>
              {(controlProps) => (
                <Input {...controlProps} type="email" autoComplete="email" {...assignRef("email")} />
              )}
            </Field>
            <Field id="signup-mobile" className="field" label="Mobile number" error={errors.mobile?.message}>
              {(controlProps) => (
                <Input {...controlProps} type="tel" autoComplete="tel" {...assignRef("mobile")} />
              )}
            </Field>
            <Field id="signup-address" className="field" label="Address" error={errors.address?.message}>
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  autoComplete="street-address"
                  rows={3}
                  {...assignRef("address")}
                />
              )}
            </Field>
            <Field id="signup-password" className="field" label="Password" error={errors.password?.message}>
              {(controlProps) => (
                <div className="password-field">
                  <Input
                    {...controlProps}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...assignRef("password")}
                  />
                  <IconButton
                    type="button"
                    variant="quiet"
                    className="password-field__toggle"
                    label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    icon={showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    onClick={() => setShowPassword((visible) => !visible)}
                  />
                </div>
              )}
            </Field>
            <Field
              id="signup-password-confirmation"
              className="field"
              label="Confirm password"
              error={errors.passwordConfirmation?.message}
            >
              {(controlProps) => (
                <div className="password-field">
                  <Input
                    {...controlProps}
                    type={showPasswordConfirmation ? "text" : "password"}
                    autoComplete="new-password"
                    {...assignRef("passwordConfirmation")}
                  />
                  <IconButton
                    type="button"
                    variant="quiet"
                    className="password-field__toggle"
                    label={
                      showPasswordConfirmation
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    aria-pressed={showPasswordConfirmation}
                    icon={showPasswordConfirmation ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                  />
                </div>
              )}
            </Field>

            <Button
              type="submit"
              className="signup-submit"
              fullWidth
              busy={isSubmitting}
              busyLabel="Creating account…"
            >
              Create client account
            </Button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
