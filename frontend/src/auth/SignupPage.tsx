import { Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import type { ClientSignupInput } from "../api/types";
import { BrandLogo } from "../components/ui/BrandLogo";
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
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const fields = useRef<Partial<Record<keyof SignupFields, HTMLInputElement | HTMLTextAreaElement | null>>>({});
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
    try {
      await auth.signupClient(parsed.data satisfies ClientSignupInput);
      navigate("/client", { replace: true });
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
    <main className="login-page">
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

          <form id="signup-form" onSubmit={submit} noValidate>
            {submitError ? <div className="form-alert" role="alert" aria-label="Signup error">{submitError}</div> : null}
            {validationSummary.length > 0 ? (
              <div className="form-alert form-alert--validation" role="status" aria-live="polite" aria-label="Signup validation summary">
                <strong>Review the highlighted fields:</strong>
                <ul>{validationSummary.map((message) => <li key={message}>{message}</li>)}</ul>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="signup-name">Full name</label>
              <input id="signup-name" autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "signup-name-error" : undefined} {...assignRef("name")} />
              {errors.name ? <p id="signup-name-error" className="field__error">{errors.name.message}</p> : null}
            </div>
            <div className="field">
              <label htmlFor="signup-email">Email address</label>
              <input id="signup-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "signup-email-error" : undefined} {...assignRef("email")} />
              {errors.email ? <p id="signup-email-error" className="field__error">{errors.email.message}</p> : null}
            </div>
            <div className="field">
              <label htmlFor="signup-mobile">Mobile number</label>
              <input id="signup-mobile" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? "signup-mobile-error" : undefined} {...assignRef("mobile")} />
              {errors.mobile ? <p id="signup-mobile-error" className="field__error">{errors.mobile.message}</p> : null}
            </div>
            <div className="field">
              <label htmlFor="signup-address">Address</label>
              <textarea id="signup-address" autoComplete="street-address" rows={3} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? "signup-address-error" : undefined} {...assignRef("address")} />
              {errors.address ? <p id="signup-address-error" className="field__error">{errors.address.message}</p> : null}
            </div>
            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <div className="password-field">
                <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "signup-password-error" : undefined} {...assignRef("password")} />
                <button type="button" className="password-field__toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              </div>
              {errors.password ? <p id="signup-password-error" className="field__error">{errors.password.message}</p> : null}
            </div>
            <div className="field">
              <label htmlFor="signup-password-confirmation">Confirm password</label>
              <div className="password-field">
                <input id="signup-password-confirmation" type={showPasswordConfirmation ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(errors.passwordConfirmation)} aria-describedby={errors.passwordConfirmation ? "signup-password-confirmation-error" : undefined} {...assignRef("passwordConfirmation")} />
                <button type="button" className="password-field__toggle" aria-label={showPasswordConfirmation ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showPasswordConfirmation} onClick={() => setShowPasswordConfirmation((visible) => !visible)}>{showPasswordConfirmation ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              </div>
              {errors.passwordConfirmation ? <p id="signup-password-confirmation-error" className="field__error">{errors.passwordConfirmation.message}</p> : null}
            </div>

            <button type="submit" className="button button--primary button--full" disabled={isSubmitting}>{isSubmitting ? "Creating account…" : "Create client account"}</button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
