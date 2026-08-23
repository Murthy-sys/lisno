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

import { ROLE_LABELS } from "../api/authorization-contract";
import type { UserInvitationInspection } from "../api/types";
import { BrandLogo } from "../components/ui/BrandLogo";
import { acceptUserInvitation, inspectUserInvitation } from "./userInvitationsApi";
import { useAuth } from "./AuthProvider";

const TOKEN_FRAGMENT_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/;
const UNAVAILABLE_MESSAGE =
  "This invitation is unavailable. Ask an administrator to send a new invitation.";

type InspectionState =
  | { status: "checking" }
  | { status: "unavailable" }
  | { status: "ready"; invitation: UserInvitationInspection };

interface PasswordErrors {
  password?: string;
  passwordConfirmation?: string;
}

function tokenFromFragment(fragment: string): string | null {
  return TOKEN_FRAGMENT_PATTERN.exec(fragment)?.[1] ?? null;
}

function passwordErrors(
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

export function InvitationAcceptancePage() {
  const auth = useAuth();
  const capturedFragmentRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  if (!capturedFragmentRef.current) {
    capturedFragmentRef.current = true;
    tokenRef.current = tokenFromFragment(window.location.hash);
  }

  const inspectPromiseRef = useRef<Promise<UserInvitationInspection> | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmationRef = useRef<HTMLInputElement | null>(null);
  const acceptingRef = useRef(false);
  const [urlScrubbed, setUrlScrubbed] = useState(false);
  const [fragmentScrubbed, setFragmentScrubbed] = useState(false);
  const [inspection, setInspection] = useState<InspectionState>({
    status: "checking"
  });
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useLayoutEffect(() => {
    const historyState = window.history.state;
    window.history.replaceState(
      historyState,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    setUrlScrubbed(true);
  }, []);

  useLayoutEffect(() => {
    if (!urlScrubbed) return;
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: window.history.state })
    );
    setFragmentScrubbed(true);
  }, [urlScrubbed]);

  useEffect(() => {
    if (!fragmentScrubbed) return;
    const token = tokenRef.current;
    if (!token) {
      setInspection({ status: "unavailable" });
      return;
    }

    inspectPromiseRef.current ??= inspectUserInvitation(token);
    let current = true;
    void inspectPromiseRef.current.then(
      (invitation) => {
        if (current) setInspection({ status: "ready", invitation });
      },
      () => {
        if (current) setInspection({ status: "unavailable" });
      }
    );
    return () => {
      current = false;
    };
  }, [fragmentScrubbed]);

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
      accepted ||
      acceptingRef.current
    ) {
      return;
    }

    const nextErrors = passwordErrors(password, passwordConfirmation);
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

    acceptingRef.current = true;
    setAccepting(true);
    setAcceptanceError(false);
    try {
      await acceptUserInvitation({ token, password, passwordConfirmation });
      setAccepted(true);
    } catch {
      setAcceptanceError(true);
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  };

  if (inspection.status === "checking") {
    return (
      <InvitationFrame>
        <div className="invitation-state" role="status" aria-live="polite">
          <span className="invitation-spinner" aria-hidden="true" />
          <h1>Checking your invitation</h1>
          <p>Please wait while we verify that this invitation is available.</p>
        </div>
      </InvitationFrame>
    );
  }

  if (inspection.status === "unavailable") {
    return (
      <InvitationFrame>
        <div className="invitation-state" role="alert">
          <h1>Invitation unavailable</h1>
          <p>{UNAVAILABLE_MESSAGE}</p>
          <Link className="invitation-link" to="/login">
            Go to sign in
          </Link>
        </div>
      </InvitationFrame>
    );
  }

  if (accepted) {
    return (
      <InvitationFrame>
        <div className="invitation-state" role="status">
          <span className="invitation-success-mark" aria-hidden="true">✓</span>
          <h1>Invitation accepted</h1>
          <p>Your Lisno account is ready. Sign in with your new password.</p>
          <Link className="invitation-link invitation-link--primary" to="/login">
            Continue to sign in
          </Link>
        </div>
      </InvitationFrame>
    );
  }

  const invitation = inspection.invitation;
  return (
    <InvitationFrame>
      <div className="invitation-card__heading">
        <p className="eyebrow">Staff invitation</p>
        <h1>Accept your invitation</h1>
        <p>Review your invitation and choose a password for your Lisno account.</p>
      </div>

      <dl className="invitation-summary" aria-label="Invitation summary">
        <div>
          <dt>Name</dt>
          <dd aria-label={invitation.name}>{invitation.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{invitation.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{ROLE_LABELS[invitation.role]}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            <time dateTime={invitation.expiresAt}>{invitation.expiresAt}</time>
          </dd>
        </div>
      </dl>

      {sessionBlocked ? (
        <section className="invitation-session-warning" aria-live="polite">
          <strong>Protect your current session</strong>
          <p>{sessionMessage(auth.status, auth.user?.name)}</p>
          <button
            type="button"
            className="invitation-secondary-action"
            onClick={() => void logout()}
            disabled={loggingOut || auth.status === "signing_out"}
          >
            {loggingOut || auth.status === "signing_out"
              ? "Logging out…"
              : "Log out to accept invitation"}
          </button>
        </section>
      ) : null}

      <form className="invitation-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="invitation-field">
          <label htmlFor="invitation-password">Password</label>
          <div className="invitation-password-control">
            <input
              ref={passwordRef}
              id="invitation-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "invitation-password-error" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
            />
            <button
              type="button"
              className="invitation-visibility-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {errors.password ? (
            <p id="invitation-password-error" className="invitation-field__error">
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className="invitation-field">
          <label htmlFor="invitation-password-confirmation">Confirm password</label>
          <div className="invitation-password-control">
            <input
              ref={confirmationRef}
              id="invitation-password-confirmation"
              name="passwordConfirmation"
              type={showPasswordConfirmation ? "text" : "password"}
              autoComplete="new-password"
              value={passwordConfirmation}
              aria-invalid={errors.passwordConfirmation ? true : undefined}
              aria-describedby={
                errors.passwordConfirmation
                  ? "invitation-password-confirmation-error"
                  : undefined
              }
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
              className="invitation-visibility-toggle"
              aria-label={
                showPasswordConfirmation
                  ? "Hide confirmation password"
                  : "Show confirmation password"
              }
              aria-pressed={showPasswordConfirmation}
              onClick={() => setShowPasswordConfirmation((current) => !current)}
            >
              {showPasswordConfirmation ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.passwordConfirmation ? (
            <p
              id="invitation-password-confirmation-error"
              className="invitation-field__error"
            >
              {errors.passwordConfirmation}
            </p>
          ) : null}
        </div>

        <p className="invitation-password-hint">
          Use 12 to 128 characters. Both password fields must match.
        </p>
        {acceptanceError ? (
          <p className="invitation-submit-error" role="alert">
            We couldn't accept this invitation. Please try again.
          </p>
        ) : null}
        <button
          type="submit"
          className="invitation-primary-action"
          disabled={sessionBlocked || accepting}
          aria-busy={accepting}
        >
          {accepting ? "Accepting invitation…" : "Accept invitation"}
        </button>
      </form>
    </InvitationFrame>
  );
}

function InvitationFrame({ children }: { children: ReactNode }) {
  return (
    <main className="invitation-page">
      <section className="invitation-card" aria-label="Lisno invitation acceptance">
        <BrandLogo />
        {children}
      </section>
    </main>
  );
}

function sessionMessage(status: ReturnType<typeof useAuth>["status"], name?: string) {
  if (status === "authenticated") {
    return `You are signed in as ${name ?? "another user"}. Log out before accepting this invitation.`;
  }
  if (status === "restoring") {
    return "We’re checking your current session. Acceptance stays blocked until you explicitly log out.";
  }
  if (status === "error") {
    return "We couldn't safely verify your current session. Log out before accepting this invitation.";
  }
  return "Your current session is being closed before this invitation can be accepted.";
}
