import { Eye, EyeOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import type { ClientSignupInput } from "../api/types";
import { useAuth } from "./AuthProvider";
import "./login-page.css";

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    mobile: z.string().trim().min(1, "Mobile number is required."),
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
  const fields = useRef<Partial<Record<keyof SignupFields, HTMLInputElement | null>>>({});
  const resolveSignupIntent = useRef<(() => void) | null>(null);
  const signupIntentActive = useRef(false);
  const mounted = useRef(true);
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
      password: "",
      passwordConfirmation: ""
    }
  });

  const assignRef = (field: keyof SignupFields) => {
    const { ref, ...registration } = register(field);
    return {
      ...registration,
      ref: (element: HTMLInputElement | null) => {
        ref(element);
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const signupState = location.state as { signupRouteFocus?: unknown } | null;
    if (signupState?.signupRouteFocus === true) {
      if (resolveSignupIntent.current) {
        resolveSignupIntent.current();
        resolveSignupIntent.current = null;
      } else if (!signupIntentActive.current) {
        navigate("/signup", { replace: true, state: null });
      }
    }
  }, [location.key, location.state, navigate]);

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
      signupIntentActive.current = true;
      resolveSignupIntent.current = resolve;
      navigate("/signup", {
        replace: true,
        state: { signupRouteFocus: true }
      });
    });
    try {
      await auth.signupClient(parsed.data satisfies ClientSignupInput);
    } catch (error) {
      signupIntentActive.current = false;
      if (mounted.current) {
        navigate("/signup", { replace: true, state: null });
      }
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
    <main className="login-screen">
      <a href="#signup-form" className="login-skip-link">
        Skip to account creation
      </a>
      <img
        className="login-bg"
        src="/login-hero.png"
        alt=""
        loading="eager"
        fetchPriority="high"
      />
      <div className="login-scrim login-scrim--diagonal" aria-hidden="true" />
      <div className="login-scrim login-scrim--base" aria-hidden="true" />

      <div className="login-grid">
        <section className="login-hero" aria-label="Lisno client portal">
          <div className="login-hero__brand">
            <span className="login-hero__logo" role="img" aria-label="LISNO" />
            <span className="login-hero__wordmark">LISNO</span>
          </div>

          <div className="login-hero__eyebrow">
            <span className="login-rule login-rule--hero" aria-hidden="true" />
            <span>YOUR PROJECT, IN VIEW</span>
          </div>

          <h2 className="login-hero__title">Follow every design decision.</h2>

          <p className="login-hero__body">
            Create your client account to see approved plans, progress, and delivery updates in
            one place.
          </p>

          <div className="login-hero__footer">
            <p>Clear updates. Confident approvals. Beautiful outcomes.</p>
          </div>
        </section>

        <div className="login-card-wrap">
          <form
            id="signup-form"
            className="login-card"
            onSubmit={submit}
            noValidate
            aria-busy={isSubmitting}
          >
            <div className="login-card__eyebrow">
              <span className="login-rule login-rule--card" aria-hidden="true" />
              <span>CLIENT PORTAL</span>
            </div>
            <h1 id="signup-title" className="login-card__title">
              Create your client account
            </h1>
            <p className="login-card__subtitle">Use the email associated with your design project.</p>

            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Signup status"
              className="sr-only"
            >
              {isSubmitting ? "Creating account. Please wait." : ""}
            </p>

            {submitError ? (
              <div role="alert" aria-label="Signup error" className="login-banner login-banner--error">
                <span className="login-banner__dot" aria-hidden="true" />
                <div className="login-banner__content">
                  <p className="login-banner__message">{submitError}</p>
                </div>
              </div>
            ) : null}

            {validationSummary.length > 0 ? (
              <div
                role="status"
                aria-live="polite"
                aria-label="Signup validation summary"
                className="login-banner login-banner--error"
              >
                <span className="login-banner__dot" aria-hidden="true" />
                <div className="login-banner__content">
                  <p className="login-banner__message">
                    <strong>Review the highlighted fields:</strong>
                  </p>
                  <ul className="login-banner__list">
                    {validationSummary.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="login-field">
              <label htmlFor="signup-name" className="login-field__label">
                Full name
              </label>
              <input
                id="signup-name"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby="signup-name-error"
                className="login-input"
                {...assignRef("name")}
              />
              <p
                id="signup-name-error"
                className={errors.name ? "login-field__message login-field__message--error" : "login-field__message"}
              >
                {errors.name?.message ?? ""}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="signup-email" className="login-field__label">
                Email address
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby="signup-email-error"
                className="login-input"
                {...assignRef("email")}
              />
              <p
                id="signup-email-error"
                className={errors.email ? "login-field__message login-field__message--error" : "login-field__message"}
              >
                {errors.email?.message ?? ""}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="signup-mobile" className="login-field__label">
                Mobile number
              </label>
              <input
                id="signup-mobile"
                type="tel"
                autoComplete="tel"
                aria-invalid={errors.mobile ? true : undefined}
                aria-describedby="signup-mobile-error"
                className="login-input"
                {...assignRef("mobile")}
              />
              <p
                id="signup-mobile-error"
                className={errors.mobile ? "login-field__message login-field__message--error" : "login-field__message"}
              >
                {errors.mobile?.message ?? ""}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="signup-password" className="login-field__label">
                Password
              </label>
              <div className="login-password-wrap">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby="signup-password-error"
                  className="login-input login-input--password"
                  {...assignRef("password")}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="login-password-toggle"
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p
                id="signup-password-error"
                className={errors.password ? "login-field__message login-field__message--error" : "login-field__message"}
              >
                {errors.password?.message ?? ""}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="signup-password-confirmation" className="login-field__label">
                Confirm password
              </label>
              <div className="login-password-wrap">
                <input
                  id="signup-password-confirmation"
                  type={showPasswordConfirmation ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={errors.passwordConfirmation ? true : undefined}
                  aria-describedby="signup-password-confirmation-error"
                  className="login-input login-input--password"
                  {...assignRef("passwordConfirmation")}
                />
                <button
                  type="button"
                  aria-label={
                    showPasswordConfirmation ? "Hide confirmation password" : "Show confirmation password"
                  }
                  aria-pressed={showPasswordConfirmation}
                  onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                  className="login-password-toggle"
                >
                  {showPasswordConfirmation ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p
                id="signup-password-confirmation-error"
                className={
                  errors.passwordConfirmation
                    ? "login-field__message login-field__message--error"
                    : "login-field__message"
                }
              >
                {errors.passwordConfirmation?.message ?? ""}
              </p>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              data-busy={isSubmitting || undefined}
            >
              {isSubmitting ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                "Create client account"
              )}
            </button>

            <hr className="login-hairline" />

            <p className="login-footer-text">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
