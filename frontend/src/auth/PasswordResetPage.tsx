import { ArrowLeft, Eye, EyeOff } from "lucide-react";
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
import { BrandLogo } from "../components/ui/BrandLogo";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { IconButton } from "../components/ui/IconButton";
import { useAuth } from "./AuthProvider";
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

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(
      form.get("passwordConfirmation") ?? ""
    );
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
      formRef.current?.reset();
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

  if (inspection.status === "checking") {
    return (
      <PasswordResetFrame>
        <div className="invitation-state" role="status" aria-live="polite">
          <span className="invitation-spinner" aria-hidden="true" />
          <h1 tabIndex={-1}>Checking your reset link</h1>
          <p>Please wait while we verify that this reset link is available.</p>
        </div>
      </PasswordResetFrame>
    );
  }

  if (inspection.status === "unavailable") {
    return (
      <PasswordResetFrame>
        <div className="invitation-state" role="alert">
          <h1 tabIndex={-1} autoFocus>Reset link unavailable</h1>
          <p>{UNAVAILABLE_MESSAGE}</p>
          <Link className="invitation-link" to="/forgot-password">
            Request a new reset link
          </Link>
        </div>
      </PasswordResetFrame>
    );
  }

  if (completed) {
    return (
      <PasswordResetFrame>
        <div
          className="invitation-state"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="invitation-success-mark" aria-hidden="true">✓</span>
          <h1 tabIndex={-1} autoFocus>Password updated</h1>
          <p>Sign in with your new password.</p>
          <Link className="invitation-link invitation-link--primary" to="/login">
            Sign in with your new password
          </Link>
        </div>
      </PasswordResetFrame>
    );
  }

  return (
    <PasswordResetFrame>
      <div className="invitation-card__heading">
        <p className="eyebrow">Account recovery</p>
        <h1 tabIndex={-1} autoFocus>Choose a new password</h1>
        <p>Use a unique password you have not used for this account before.</p>
      </div>

      {sessionBlocked ? (
        <section className="invitation-session-warning" aria-live="polite">
          <strong>Protect your current session</strong>
          <p>{sessionMessage(auth.status)}</p>
          <button
            type="button"
            className="invitation-secondary-action"
            onClick={() => void logout()}
            disabled={loggingOut || auth.status === "signing_out"}
          >
            {loggingOut || auth.status === "signing_out"
              ? "Logging out…"
              : "Log out to reset password"}
          </button>
        </section>
      ) : null}

      <form
        ref={formRef}
        className="password-reset-form"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={completing}
      >
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Password update status"
        >
          {completing ? "Updating your password." : ""}
        </p>

        <Field
          id="reset-password"
          label="New password"
          hint="Use 12 to 128 characters."
          error={errors.password}
        >
          {(controlProps) => (
            <div className="password-field">
              <Input
                ref={passwordRef}
                {...controlProps}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                onChange={() => {
                  if (errors.password) {
                    setErrors((current) => ({ ...current, password: undefined }));
                  }
                }}
              />
              <IconButton
                type="button"
                variant="quiet"
                className="password-field__toggle"
                label={showPassword ? "Hide new password" : "Show new password"}
                aria-pressed={showPassword}
                icon={showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                onClick={() => setShowPassword((current) => !current)}
              />
            </div>
          )}
        </Field>

        <Field
          id="reset-password-confirmation"
          label="Confirm new password"
          error={errors.passwordConfirmation}
        >
          {(controlProps) => (
            <div className="password-field">
              <Input
                ref={confirmationRef}
                {...controlProps}
                name="passwordConfirmation"
                type={showPasswordConfirmation ? "text" : "password"}
                autoComplete="new-password"
                onChange={() => {
                  if (errors.passwordConfirmation) {
                    setErrors((current) => ({
                      ...current,
                      passwordConfirmation: undefined
                    }));
                  }
                }}
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
                icon={
                  showPasswordConfirmation ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )
                }
                onClick={() => setShowPasswordConfirmation((current) => !current)}
              />
            </div>
          )}
        </Field>

        {completionError ? (
          <p className="invitation-submit-error" role="alert">
            We couldn't update your password. Please try again.
          </p>
        ) : null}

        <Button
          type="submit"
          fullWidth
          busy={completing}
          busyLabel="Updating password…"
          disabled={sessionBlocked}
        >
          Update password
        </Button>
        <Link className="invitation-link password-reset-back-link" to="/login">
          <ArrowLeft aria-hidden="true" />
          Back to sign in
        </Link>
      </form>
    </PasswordResetFrame>
  );
}

function PasswordResetFrame({ children }: { children: ReactNode }) {
  return (
    <main className="invitation-page password-reset-page">
      <section
        className="invitation-card password-reset-card"
        aria-label="Lisno password reset"
      >
        <BrandLogo />
        {children}
      </section>
    </main>
  );
}

function sessionMessage(status: ReturnType<typeof useAuth>["status"]): string {
  if (status === "authenticated") {
    return "You are already signed in. Log out before resetting a password.";
  }
  if (status === "restoring") {
    return "We’re checking your current session. Reset stays blocked until you explicitly log out.";
  }
  if (status === "error") {
    return "We couldn't safely verify your current session. Log out before resetting a password.";
  }
  return "Your current session is being closed before the password can be reset.";
}
