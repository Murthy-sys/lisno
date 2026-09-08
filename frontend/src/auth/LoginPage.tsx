import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z, type ZodString } from "zod";

import { ApiError, apiClient } from "../api/client";
import { safeReturnPath } from "../app/routePaths";
import { useAuth } from "./AuthProvider";
import "./login-page.css";

const EMAIL_EMPTY_MESSAGE = "Enter the email address on your Lisno account.";
const EMAIL_INVALID_MESSAGE = "That email address doesn’t look right.";
const PASSWORD_EMPTY_MESSAGE = "Enter your password.";
const PASSWORD_SHORT_MESSAGE = "Passwords are at least 8 characters.";

const emailSchema = z
  .string()
  .trim()
  .min(1, EMAIL_EMPTY_MESSAGE)
  .email(EMAIL_INVALID_MESSAGE);
const passwordSchema = z
  .string()
  .min(1, PASSWORD_EMPTY_MESSAGE)
  .min(8, PASSWORD_SHORT_MESSAGE);

function firstError(schema: ZodString, value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

const MAX_ATTEMPTS_BEFORE_PAUSE = 5;
const DEFAULT_PAUSE_SECONDS = 30;

interface FieldErrors {
  email?: string;
  password?: string;
}

type BannerTone = "error" | "neutral";

interface BannerAction {
  label: string;
  busy?: boolean;
  onAction: () => void;
}

interface BannerState {
  tone: BannerTone;
  message: string;
  action?: BannerAction;
}

/**
 * The current ApiError class only carries status/code/message/fields — it
 * does not surface response headers. This reads a retryAfterSeconds field
 * that nothing in this codebase populates yet, so it safely no-ops until a
 * backend response actually provides one; the local 30s pause is what
 * drives the countdown until then.
 */
function serverRetryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null;
  const raw = (error as unknown as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : null;
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [bannerActionBusy, setBannerActionBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (pauseEndsAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [pauseEndsAt]);

  const secondsRemaining =
    pauseEndsAt === null ? 0 : Math.max(0, Math.ceil((pauseEndsAt - now) / 1000));
  const isPaused = pauseEndsAt !== null && secondsRemaining > 0;

  useEffect(() => {
    if (pauseEndsAt !== null && secondsRemaining === 0) {
      setPauseEndsAt(null);
      setFailedAttempts(0);
      setBanner(null);
    }
  }, [secondsRemaining, pauseEndsAt]);

  const disabled = isSubmitting || isPaused;

  function startPause(seconds: number) {
    setPauseEndsAt(Date.now() + seconds * 1000);
  }

  async function resendVerificationEmail() {
    setBannerActionBusy(true);
    try {
      await apiClient.postPublic("/auth/resend-verification", { email: email.trim() });
      setBanner({
        tone: "neutral",
        message: "Verification email sent. It can take a minute to arrive."
      });
    } catch {
      setBanner({
        tone: "error",
        message: "We couldn’t resend the verification email. Try again shortly.",
        action: { label: "Resend verification email", onAction: () => void resendVerificationEmail() }
      });
    } finally {
      setBannerActionBusy(false);
    }
  }

  function continueWithCompanySso() {
    window.location.assign("/api/v1/auth/sso");
  }

  function contactWorkspaceOwner() {
    window.location.href = "mailto:support@lisno.app?subject=Locked%20Lisno%20account";
  }

  function bannerForError(error: unknown, attemptNumber: number): BannerState {
    if (error instanceof ApiError) {
      switch (error.code) {
        case "INVALID_CREDENTIALS": {
          const remaining = MAX_ATTEMPTS_BEFORE_PAUSE - attemptNumber;
          const suffix =
            remaining > 0 && remaining <= 2
              ? ` ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before sign-in pauses.`
              : "";
          return { tone: "error", message: `Email or password is incorrect.${suffix}` };
        }
        case "EMAIL_NOT_VERIFIED":
        case "UNVERIFIED_EMAIL":
          return {
            tone: "error",
            message: "Verify your email address before signing in.",
            action: {
              label: "Resend verification email",
              busy: bannerActionBusy,
              onAction: () => void resendVerificationEmail()
            }
          };
        case "SSO_REQUIRED":
          return {
            tone: "error",
            message: "This account signs in through your company’s SSO.",
            action: { label: "Continue with company SSO", onAction: continueWithCompanySso }
          };
        case "ACCOUNT_LOCKED":
        case "SECURITY_LOCKED":
          return {
            tone: "error",
            message: "This account has been locked for security.",
            action: { label: "Contact your workspace owner", onAction: contactWorkspaceOwner }
          };
        case "ACCOUNT_DEACTIVATED":
        case "DEACTIVATED":
          return { tone: "error", message: "This account has been deactivated." };
        case "TOO_MANY_ATTEMPTS":
          return {
            tone: "error",
            message: "Too many attempts. Sign-in is paused for a short while."
          };
        default:
          return { tone: "error", message: "Email or password is incorrect." };
      }
    }
    return { tone: "error", message: "We couldn’t sign you in. Please try again." };
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (hasSubmitted) {
      setErrors((previous) => ({ ...previous, email: firstError(emailSchema, value) }));
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (hasSubmitted) {
      setErrors((previous) => ({ ...previous, password: firstError(passwordSchema, value) }));
    }
    if (value === "") setCapsLockOn(false);
  }

  function handlePasswordKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    if (typeof event.getModifierState === "function") {
      setCapsLockOn(event.getModifierState("CapsLock"));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    setHasSubmitted(true);
    const emailError = firstError(emailSchema, email);
    const passwordError = firstError(passwordSchema, password);
    setErrors({ email: emailError, password: passwordError });

    if (emailError || passwordError) {
      setBanner(null);
      window.setTimeout(() => {
        if (emailError) emailRef.current?.focus({ preventScroll: true });
        else passwordRef.current?.focus({ preventScroll: true });
      }, 0);
      return;
    }

    setBanner(null);
    setIsSubmitting(true);
    const locationState = location.state as { from?: unknown } | null;
    const from = typeof locationState?.from === "string" ? locationState.from : null;
    try {
      const user = await auth.login({ email: email.trim(), password });
      setBanner({ tone: "neutral", message: "Signed in. Taking you to your workspace…" });
      navigate(safeReturnPath(user.role, from), {
        replace: true,
        state: { routeFocus: true }
      });
    } catch (error) {
      const isRateLimited = error instanceof ApiError && error.code === "TOO_MANY_ATTEMPTS";
      const attemptNumber = failedAttempts + 1;
      if (!isRateLimited) setFailedAttempts(attemptNumber);
      setBanner(bannerForError(error, attemptNumber));
      if (isRateLimited || attemptNumber >= MAX_ATTEMPTS_BEFORE_PAUSE) {
        startPause(serverRetryAfterSeconds(error) ?? DEFAULT_PAUSE_SECONDS);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const passwordIsError = Boolean(errors.password);
  const passwordHint = errors.password ?? (capsLockOn && !showPassword ? "Caps Lock is on." : undefined);
  const passwordMessageClass = passwordIsError
    ? "login-field__message login-field__message--error"
    : passwordHint
      ? "login-field__message login-field__message--hint"
      : "login-field__message";

  return (
    <main className="login-screen">
      <a href="#login-form" className="login-skip-link">
        Skip to sign in
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
        <section className="login-hero" aria-label="Lisno design operations">
          <div className="login-hero__brand">
            <span className="login-hero__logo" role="img" aria-label="LISNO" />
            <span className="login-hero__wordmark">LISNO</span>
          </div>

          <div className="login-hero__eyebrow">
            <span className="login-rule login-rule--hero" aria-hidden="true" />
            <span>DESIGN OPERATIONS, IN FOCUS</span>
          </div>

          <h1 className="login-hero__title">
            From first sketch{" "}
            <br />
            to final handoff.
          </h1>

          <p className="login-hero__body">
            Keep every project, decision, deadline, and approved design moving in one shared
            workspace.
          </p>

          <div className="login-hero__footer">
            <p>Clear ownership. Timely reviews. Beautiful outcomes.</p>
          </div>
        </section>

        <div className="login-card-wrap">
          <form
            id="login-form"
            className="login-card"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={isSubmitting}
          >
            <div className="login-card__eyebrow">
              <span className="login-rule login-rule--card" aria-hidden="true" />
              <span>WELCOME TO LISNO</span>
            </div>
            <h2 className="login-card__title">Sign in</h2>
            <p className="login-card__subtitle">Continue to your design workspace.</p>

            {auth.sessionExpired ? (
              <div
                role="region"
                aria-label="Session expired"
                className="login-banner login-banner--neutral"
              >
                <span className="login-banner__dot" aria-hidden="true" />
                <div className="login-banner__content">
                  <p className="login-banner__message">Your session expired. Sign in again.</p>
                </div>
              </div>
            ) : null}

            <div
              className="login-banner-region"
              aria-live="assertive"
              aria-atomic="true"
            >
              {banner ? (
                <div
                  role="alert"
                  aria-label="Sign-in message"
                  className={`login-banner login-banner--${banner.tone}`}
                >
                  <span className="login-banner__dot" aria-hidden="true" />
                  <div className="login-banner__content">
                    <p className="login-banner__message">{banner.message}</p>
                    {banner.action ? (
                      <button
                        type="button"
                        className="login-banner__action"
                        disabled={banner.action.busy}
                        onClick={banner.action.onAction}
                      >
                        {banner.action.busy ? "Sending…" : banner.action.label}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="login-field">
              <label htmlFor="login-email" className="login-field__label">
                Email address
              </label>
              <input
                id="login-email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => handleEmailChange(event.target.value)}
                disabled={disabled}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby="login-email-message"
                className="login-input"
              />
              <p
                id="login-email-message"
                className={
                  errors.email
                    ? "login-field__message login-field__message--error"
                    : "login-field__message"
                }
              >
                {errors.email ?? ""}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="login-password" className="login-field__label">
                Password
              </label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => handlePasswordChange(event.target.value)}
                  onKeyUp={handlePasswordKeyUp}
                  disabled={disabled}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby="login-password-message"
                  className="login-input login-input--password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={disabled}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p id="login-password-message" className={passwordMessageClass}>
                {passwordHint ?? ""}
              </p>
            </div>

            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  disabled={disabled}
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                />
                Keep me signed in
              </label>
              <Link
                to="/forgot-password"
                className={isPaused ? "login-forgot login-forgot--urgent" : "login-forgot"}
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={disabled}
              aria-busy={isSubmitting || undefined}
              data-busy={isSubmitting || undefined}
            >
              {isPaused ? (
                `Try again in ${secondsRemaining}s`
              ) : isSubmitting ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in
                </>
              ) : (
                <>
                  Sign in
                  <span className="login-submit__arrow" aria-hidden="true">
                    &rarr;
                  </span>
                </>
              )}
            </button>

            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Sign-in status"
              className="sr-only"
            >
              {isSubmitting ? "Signing in. Please wait." : ""}
            </p>

            <hr className="login-hairline" />

            <p className="login-footer-text">
              New to Lisno? <Link to="/signup">Create a client account</Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
