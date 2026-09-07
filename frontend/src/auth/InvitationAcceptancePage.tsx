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
import { ApiError } from "../api/client";
import type { UserInvitationInspection } from "../api/types";
import { acceptUserInvitation, inspectUserInvitation } from "./userInvitationsApi";
import { useAuth } from "./AuthProvider";
import "./login-page.css";

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
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "INVITATION_UNAVAILABLE"
      ) {
        setInspection({ status: "unavailable" });
      } else {
        setAcceptanceError(true);
      }
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  };

  if (inspection.status === "checking") {
    return (
      <InvitationFrame>
        <div className="login-state" role="status" aria-live="polite">
          <span className="login-spinner" aria-hidden="true" />
          <h1>Checking your invitation</h1>
          <p>Please wait while we verify that this invitation is available.</p>
        </div>
      </InvitationFrame>
    );
  }

  if (inspection.status === "unavailable") {
    return (
      <InvitationFrame>
        <div className="login-state" role="alert">
          <h1>Invitation unavailable</h1>
          <p>{UNAVAILABLE_MESSAGE}</p>
          <Link to="/login" className="login-submit">
            Go to sign in
          </Link>
        </div>
      </InvitationFrame>
    );
  }

  if (accepted) {
    return (
      <InvitationFrame>
        <div className="login-state" role="status">
          <h1>Invitation accepted</h1>
          <p>Your Lisno account is ready. Sign in with your new password.</p>
          <Link to="/login" className="login-submit">
            Continue to sign in
          </Link>
        </div>
      </InvitationFrame>
    );
  }

  const invitation = inspection.invitation;
  return (
    <InvitationFrame>
      <div className="login-card__eyebrow">
        <span className="login-rule login-rule--card" aria-hidden="true" />
        <span>STAFF INVITATION</span>
      </div>
      <h1 className="login-card__title">
        Accept your invitation
      </h1>
      <p className="login-card__subtitle">
        Review your invitation and choose a password for your Lisno account.
      </p>

      <dl className="login-summary" aria-label="Invitation summary">
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
        <section className="login-session-warning" aria-live="polite">
          <strong>Protect your current session</strong>
          <p>{sessionMessage(auth.status, auth.user?.name)}</p>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut || auth.status === "signing_out"}
          >
            {loggingOut || auth.status === "signing_out"
              ? "Logging out…"
              : "Log out to accept invitation"}
          </button>
        </section>
      ) : null}

      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="login-field">
          <label htmlFor="invitation-password" className="login-field__label">
            Password
          </label>
          <div className="login-password-wrap">
            <input
              ref={passwordRef}
              id="invitation-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby="invitation-password-error"
              className="login-input login-input--password"
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
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
            id="invitation-password-error"
            className={errors.password ? "login-field__message login-field__message--error" : "login-field__message"}
          >
            {errors.password ?? ""}
          </p>
        </div>

        <div className="login-field">
          <label htmlFor="invitation-password-confirmation" className="login-field__label">
            Confirm password
          </label>
          <div className="login-password-wrap">
            <input
              ref={confirmationRef}
              id="invitation-password-confirmation"
              name="passwordConfirmation"
              type={showPasswordConfirmation ? "text" : "password"}
              autoComplete="new-password"
              value={passwordConfirmation}
              aria-invalid={errors.passwordConfirmation ? true : undefined}
              aria-describedby="invitation-password-confirmation-error"
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
                showPasswordConfirmation ? "Hide confirmation password" : "Show confirmation password"
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
            id="invitation-password-confirmation-error"
            className={
              errors.passwordConfirmation
                ? "login-field__message login-field__message--error"
                : "login-field__message login-field__message--hint"
            }
          >
            {errors.passwordConfirmation ?? "Use 12 to 128 characters. Both password fields must match."}
          </p>
        </div>

        {acceptanceError ? (
          <div role="alert" className="login-banner login-banner--error">
            <span className="login-banner__dot" aria-hidden="true" />
            <div className="login-banner__content">
              <p className="login-banner__message">
                We couldn't accept this invitation. Please try again.
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          className="login-submit"
          disabled={sessionBlocked || accepting}
          aria-busy={accepting}
          data-busy={accepting || undefined}
        >
          {accepting ? (
            <>
              <span className="login-spinner" aria-hidden="true" />
              Accepting invitation…
            </>
          ) : (
            "Accept invitation"
          )}
        </button>
      </form>
    </InvitationFrame>
  );
}

function InvitationFrame({ children }: { children: ReactNode }) {
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
        <section className="login-hero" aria-label="Lisno team invitation">
          <div className="login-hero__brand">
            <span className="login-hero__logo" role="img" aria-label="LISNO" />
            <span className="login-hero__wordmark">LISNO</span>
          </div>

          <div className="login-hero__eyebrow">
            <span className="login-rule login-rule--hero" aria-hidden="true" />
            <span>STAFF INVITATION</span>
          </div>

          <h2 className="login-hero__title">Join your team on Lisno.</h2>

          <p className="login-hero__body">
            Set a password to activate your account and start collaborating on projects with
            your team.
          </p>

          <div className="login-hero__footer">
            <p>Clear ownership. Timely reviews. Beautiful outcomes.</p>
          </div>
        </section>

        <div className="login-card-wrap">
          <div className="login-card">{children}</div>
        </div>
      </div>
    </main>
  );
}

function sessionMessage(status: ReturnType<typeof useAuth>["status"], name?: string) {
  if (status === "authenticated") {
    return `You are signed in as ${name ?? "another user"}. Log out before accepting this invitation.`;
  }
  if (status === "restoring") {
    return "We're checking your current session. Acceptance stays blocked until you explicitly log out.";
  }
  if (status === "error") {
    return "We couldn't safely verify your current session. Log out before accepting this invitation.";
  }
  return "Your current session is being closed before this invitation can be accepted.";
}
