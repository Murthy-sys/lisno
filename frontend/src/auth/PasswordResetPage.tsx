import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "./AuthProvider";
import "./login-page.css";
import {
  completePasswordReset,
  inspectPasswordReset,
  type PasswordResetInspection
} from "./passwordResetApi";
import {
  consumePasswordResetToken,
  releasePasswordResetToken
} from "./passwordResetTokenVault";

const UNAVAILABLE_MESSAGE =
  "Reset link unavailable. This link is invalid, expired, or has already been used.";
const RESET_PAGE_TOKEN_CLAIMANT = Symbol("password-reset-page");

type InspectionState =
  | { status: "checking" }
  | { status: "unavailable" }
  | { status: "ready" };

interface PasswordErrors {
  password?: string;
  passwordConfirmation?: string;
}

function validatePasswords(
  password: string,
  passwordConfirmation: string
): PasswordErrors {
  if (password.length < 12) {
    return { password: "Password must be at least 12 characters." };
  }
  if (password.length > 128) {
    return { password: "Password must be at most 128 characters." };
  }
  if (password !== passwordConfirmation) {
    return { passwordConfirmation: "Passwords do not match." };
  }
  return {};
}

export function PasswordResetPage() {
  const auth = useAuth();
  const tokenClaimedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  if (!tokenClaimedRef.current) {
    tokenClaimedRef.current = true;
    tokenRef.current = consumePasswordResetToken(RESET_PAGE_TOKEN_CLAIMANT);
  }

  const inspectPromiseRef = useRef<Promise<PasswordResetInspection> | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmationRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const completingRef = useRef(false);
  const [inspection, setInspection] = useState<InspectionState>({
    status: "checking"
  });
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionError, setCompletionError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useLayoutEffect(() => {
    releasePasswordResetToken(RESET_PAGE_TOKEN_CLAIMANT);
  }, []);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token) {
      setInspection({ status: "unavailable" });
      return;
    }

    inspectPromiseRef.current ??= inspectPasswordReset(token);
    let current = true;
    void inspectPromiseRef.current.then(
      () => {
        if (current) setInspection({ status: "ready" });
      },
      () => {
        if (current) {
          tokenRef.current = null;
          setInspection({ status: "unavailable" });
        }
      }
    );
    return () => {
      current = false;
    };
  }, []);

  const sessionBlocked = auth.status !== "unauthenticated";

  const logout = async () => {
    if (loggingOut || auth.status === "signing_out") return;
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      sessionBlocked ||
      inspection.status !== "ready" ||
      completed ||
      completingRef.current
    ) {
      return;
    }

    const nextErrors = validatePasswords(password, passwordConfirmation);
    setErrors(nextErrors);
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }
    if (nextErrors.passwordConfirmation) {
      confirmationRef.current?.focus();
      return;
    }

    const token = tokenRef.current;
    if (!token) {
      setInspection({ status: "unavailable" });
      return;
    }

    completingRef.current = true;
    setCompleting(true);
    setCompletionError(false);
    try {
      await completePasswordReset({ token, password, passwordConfirmation });
      setPassword("");
      setPasswordConfirmation("");
      tokenRef.current = null;
      setCompleted(true);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 410 || error.code === "PASSWORD_RESET_UNAVAILABLE")
      ) {
        tokenRef.current = null;
        setInspection({ status: "unavailable" });
      } else {
        setCompletionError(true);
      }
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  };

  return (
    <PasswordResetFrame>
      {inspection.status === "checking" ? (
        <div className="login-state" role="status" aria-live="polite">
          <span className="login-spinner" aria-hidden="true" />
          <h1 tabIndex={-1}>Checking your reset link</h1>
          <p>Please wait while we verify that this reset link is available.</p>
        </div>
      ) : inspection.status === "unavailable" ? (
        <div className="login-state" role="alert">
          <h1 tabIndex={-1} autoFocus>
            Reset link unavailable
          </h1>
          <p>{UNAVAILABLE_MESSAGE}</p>
          <Link to="/forgot-password" className="login-submit">
            Request a new reset link
          </Link>
        </div>
      ) : completed ? (
        <div className="login-state" role="status" aria-live="polite" aria-atomic="true">
          <h1 tabIndex={-1} autoFocus>
            Password updated
          </h1>
          <p>Sign in with your new password.</p>
          <Link to="/login" className="login-submit">
            Sign in with your new password
          </Link>
        </div>
      ) : (
        <>
          <div className="login-card__eyebrow">
            <span className="login-rule login-rule--card" aria-hidden="true" />
            <span>ACCOUNT RECOVERY</span>
          </div>
          <h1 tabIndex={-1} autoFocus className="login-card__title">
            Choose a new password
          </h1>
          <p className="login-card__subtitle">
            Use a unique password you have not used for this account before.
          </p>

          {sessionBlocked ? (
            <section className="login-session-warning" aria-live="polite">
              <strong>Protect your current session</strong>
              <p>{sessionMessage(auth.status)}</p>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={loggingOut || auth.status === "signing_out"}
              >
                {loggingOut || auth.status === "signing_out"
                  ? "Logging out…"
                  : "Log out to reset password"}
              </button>
            </section>
          ) : null}

          <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate aria-busy={completing}>
            <p
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Password update status"
            >
              {completing ? "Updating your password." : ""}
            </p>

            <div className="login-field">
              <label htmlFor="reset-password" className="login-field__label">
                New password
              </label>
              <div className="login-password-wrap">
                <input
                  ref={passwordRef}
                  id="reset-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby="reset-password-message"
                  className="login-input login-input--password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errors.password) {
                      setErrors((current) => ({ ...current, password: undefined }));
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide new password" : "Show new password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
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
                id="reset-password-message"
                className={
                  errors.password
                    ? "login-field__message login-field__message--error"
                    : "login-field__message login-field__message--hint"
                }
              >
                {errors.password ?? "Use 12 to 128 characters."}
              </p>
            </div>

            <div className="login-field">
              <label htmlFor="reset-password-confirmation" className="login-field__label">
                Confirm new password
              </label>
              <div className="login-password-wrap">
                <input
                  ref={confirmationRef}
                  id="reset-password-confirmation"
                  name="passwordConfirmation"
                  type={showPasswordConfirmation ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  aria-invalid={errors.passwordConfirmation ? true : undefined}
                  aria-describedby="reset-password-confirmation-message"
                  className="login-input login-input--password"
                  onChange={(event) => {
                    setPasswordConfirmation(event.target.value);
                    if (errors.passwordConfirmation) {
                      setErrors((current) => ({
                        ...current,
                        passwordConfirmation: undefined
                      }));
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={
                    showPasswordConfirmation
                      ? "Hide confirmation password"
                      : "Show confirmation password"
                  }
                  aria-pressed={showPasswordConfirmation}
                  onClick={() => setShowPasswordConfirmation((current) => !current)}
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
                id="reset-password-confirmation-message"
                className={
                  errors.passwordConfirmation
                    ? "login-field__message login-field__message--error"
                    : "login-field__message"
                }
              >
                {errors.passwordConfirmation ?? ""}
              </p>
            </div>

            {completionError ? (
              <div role="alert" className="login-banner login-banner--error">
                <span className="login-banner__dot" aria-hidden="true" />
                <div className="login-banner__content">
                  <p className="login-banner__message">
                    We couldn't update your password. Please try again.
                  </p>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="login-submit"
              disabled={sessionBlocked || completing}
              aria-busy={completing}
              data-busy={completing || undefined}
            >
              {completing ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Updating password…
                </>
              ) : (
                "Update password"
              )}
            </button>

            <hr className="login-hairline" />

            <p className="login-footer-text">
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        </>
      )}
    </PasswordResetFrame>
  );
}

function PasswordResetFrame({ children }: { children: ReactNode }) {
  return (
    <main className="login-screen">
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
        <section className="login-hero" aria-label="Lisno password recovery">
          <div className="login-hero__brand">
            <span className="login-hero__logo" role="img" aria-label="LISNO" />
            <span className="login-hero__wordmark">LISNO</span>
          </div>

          <div className="login-hero__eyebrow">
            <span className="login-rule login-rule--hero" aria-hidden="true" />
            <span>ACCOUNT RECOVERY</span>
          </div>

          <h2 className="login-hero__title">Choose a strong new password.</h2>

          <p className="login-hero__body">
            Set a password you haven&rsquo;t used before to keep your Lisno workspace secure.
          </p>

          <div className="login-hero__footer">
            <p>Secure by design. Fast to recover. Back to work in minutes.</p>
          </div>
        </section>

        <div className="login-card-wrap">
          <div className="login-card">{children}</div>
        </div>
      </div>
    </main>
  );
}

function sessionMessage(status: ReturnType<typeof useAuth>["status"]): string {
  if (status === "authenticated") {
    return "You are already signed in. Log out before resetting a password.";
  }
  if (status === "restoring") {
    return "We're checking your current session. Reset stays blocked until you explicitly log out.";
  }
  if (status === "error") {
    return "We couldn't safely verify your current session. Log out before resetting a password.";
  }
  return "Your current session is being closed before the password can be reset.";
}
