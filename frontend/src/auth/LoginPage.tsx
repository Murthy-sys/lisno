import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { IconButton } from "../components/ui/IconButton";
import { NoticeBanner } from "../components/ui/NoticeBanner";
import { safeReturnPath } from "../app/routePaths";
import { useAuth } from "./AuthProvider";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.")
});

type LoginFields = z.infer<typeof loginSchema>;

const DEMO_ACCOUNT: LoginFields = {
  email: "ananya@lisno.example",
  password: "LisnoDemo2026!"
};

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<LoginFields>({
    defaultValues: { email: "", password: "" }
  });
  const { ref: registerEmail, ...emailRegistration } = register("email");
  const { ref: registerPassword, ...passwordRegistration } =
    register("password");

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const messages: Partial<Record<keyof LoginFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          setError(field, { message: issue.message });
          messages[field] ??= issue.message;
        }
      }
      setValidationSummary(
        (["email", "password"] as const).flatMap((field) =>
          messages[field] ? [messages[field]] : []
        )
      );
      if (messages.email) {
        emailRef.current?.focus();
      } else if (messages.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    setValidationSummary([]);
    const locationState = location.state as { from?: unknown } | null;
    const from = typeof locationState?.from === "string" ? locationState.from : null;
    try {
      const user = await auth.login(parsed.data);
      navigate(safeReturnPath(user.role, from), {
        replace: true,
        state: { routeFocus: true }
      });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
          ? "Email or password is incorrect."
          : "We couldn't sign you in. Please try again."
      );
    }
  });

  const fillDemoAccount = () => {
    setValue("email", DEMO_ACCOUNT.email, { shouldValidate: true });
    setValue("password", DEMO_ACCOUNT.password, { shouldValidate: true });
    setSubmitError(null);
    setValidationSummary([]);
  };

  return (
    <main className="login-page login-page--signin">
      <section className="login-story" aria-label="Lisno design operations">
        <a href="#login-form" className="skip-link">
          Skip to sign in
        </a>
        <div className="brand brand--light">
          <BrandLogo light />
        </div>
        <div className="login-story__content">
          <p className="eyebrow">Design operations, in focus</p>
          <h2>From first sketch to final handoff.</h2>
          <p>
            Keep every project, decision, deadline, and approved design moving
            in one shared workspace.
          </p>
        </div>
        <p className="login-story__note">
          Clear ownership. Timely reviews. Beautiful outcomes.
        </p>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="brand brand--mobile">
            <BrandLogo />
          </div>
          <p className="eyebrow">Welcome to Lisno</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-card__intro">
            Sign in to continue to your design workspace.
          </p>

          {auth.sessionExpired ? (
            <NoticeBanner tone="warning" label="Session expired">
              Your session expired. Sign in again.
            </NoticeBanner>
          ) : null}

          <form
            id="login-form"
            onSubmit={submit}
            noValidate
            aria-busy={isSubmitting}
          >
            <p
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Sign-in status"
            >
              {isSubmitting ? "Signing in. Please wait." : ""}
            </p>
            {submitError ? (
              <div className="form-alert" role="alert" aria-label="Sign-in error">
                {submitError}
              </div>
            ) : null}
            {validationSummary.length > 0 ? (
              <div
                className="form-alert form-alert--validation"
                role="status"
                aria-live="polite"
                aria-label="Sign-in validation summary"
              >
                <strong>Review the highlighted fields:</strong>
                <ul>
                  {validationSummary.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Field
              id="email"
              className="field"
              label="Email address"
              error={errors.email?.message}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  autoComplete="username"
                  {...emailRegistration}
                  ref={(element) => {
                    registerEmail(element);
                    emailRef.current = element;
                  }}
                />
              )}
            </Field>

            <Field
              id="password"
              className="field"
              label="Password"
              error={errors.password?.message}
            >
              {(controlProps) => (
                <div className="password-field">
                  <Input
                    {...controlProps}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...passwordRegistration}
                    ref={(element) => {
                      registerPassword(element);
                      passwordRef.current = element;
                    }}
                  />
                  <IconButton
                    type="button"
                    variant="quiet"
                    className="password-field__toggle"
                    label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    icon={
                      showPassword ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )
                    }
                    onClick={() => setShowPassword((visible) => !visible)}
                  />
                </div>
              )}
            </Field>

            <Button
              type="submit"
              className="login-submit"
              fullWidth
              busy={isSubmitting}
              busyLabel="Signing in…"
              trailingIcon={
                <ArrowRight className="login-submit__arrow" aria-hidden="true" />
              }
            >
              Sign in
            </Button>
          </form>

          <div className="demo-helper">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>Reviewing the demo?</strong>
              <p>Fill the seeded designer credentials in one step.</p>
            </div>
            <Button
              type="button"
              variant="quiet"
              className="button--quiet"
              onClick={fillDemoAccount}
            >
              Use designer demo account
            </Button>
          </div>
          <p className="auth-switch">
            New to Lisno? <Link to="/signup">Create a client account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
