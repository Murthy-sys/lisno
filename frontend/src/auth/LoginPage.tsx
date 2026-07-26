import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import { roleHomePath } from "./ProtectedRoute";
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<LoginFields>({
    defaultValues: { email: "", password: "" }
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    try {
      const user = await auth.login(parsed.data);
      navigate(roleHomePath(user.role), { replace: true });
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
  };

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Lisno design operations">
        <a href="#login-form" className="skip-link">
          Skip to sign in
        </a>
        <div className="brand brand--light">
          <span className="brand__mark" aria-hidden="true">L</span>
          <span>LISNO</span>
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
            <span className="brand__mark" aria-hidden="true">L</span>
            <span>LISNO</span>
          </div>
          <p className="eyebrow">Welcome to Lisno</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-card__intro">
            Sign in to continue to your design workspace.
          </p>

          <form id="login-form" onSubmit={submit} noValidate>
            {submitError ? (
              <div className="form-alert" role="alert" aria-label="Sign-in error">
                {submitError}
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email ? (
                <p id="email-error" className="field__error">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                />
                <button
                  type="button"
                  className="password-field__toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password ? (
                <p id="password-error" className="field__error">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              className="button button--primary button--full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="demo-helper">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>Reviewing the demo?</strong>
              <p>Fill the seeded designer credentials in one step.</p>
            </div>
            <button
              type="button"
              className="button button--quiet"
              onClick={fillDemoAccount}
            >
              Use designer demo account
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
