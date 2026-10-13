import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import loginBackground from "../assets/login_screen.png";
import { clientKeys } from "../features/client/clientApi";
import { ProjectInvitationSessionError, useAuth } from "./AuthProvider";
import {
  acceptExistingProjectInvitation,
  inspectProjectInvitation,
  type ProjectInvitationInspection
} from "./projectClientInvitationsApi";
import "./login-page.css";

type Inspection =
  | { status: "checking" | "unavailable" | "error" }
  | { status: "ready"; invitation: ProjectInvitationInspection };

const unavailable = (error: unknown) => error instanceof ApiError &&
  (error.code === "INVITATION_UNAVAILABLE" || error.code === "PROJECT_INVITATION_UNAVAILABLE");

export function ProjectInvitationAcceptancePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = useRef<string | null>(null);
  const captured = useRef(false);
  if (!captured.current) {
    captured.current = true;
    token.current = /^#token=([A-Za-z0-9_-]{43})$/.exec(window.location.hash)?.[1] ?? null;
  }
  const inspectPromise = useRef<Promise<ProjectInvitationInspection> | null>(null);
  const submitting = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [scrubbed, setScrubbed] = useState(false);
  const [inspection, setInspection] = useState<Inspection>({ status: "checking" });
  const [inspectAttempt, setInspectAttempt] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<{ projectId: string; needsSignIn: boolean } | null>(null);

  useLayoutEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setScrubbed(true);
  }, []);

  useEffect(() => {
    if (!scrubbed) return;
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    if (!token.current) {
      setInspection({ status: "unavailable" });
      return;
    }
    let current = true;
    inspectPromise.current ??= inspectProjectInvitation(token.current);
    void inspectPromise.current.then(
      (invitation) => { if (current) setInspection({ status: "ready", invitation }); },
      (error: unknown) => {
        if (current) setInspection({ status: unavailable(error) ? "unavailable" : "error" });
      }
    );
    return () => { current = false; };
  }, [scrubbed, inspectAttempt]);

  useEffect(() => {
    if (accepted || inspection.status === "unavailable") resultHeading.current?.focus();
  }, [accepted, inspection.status]);

  const retryInspection = () => {
    inspectPromise.current = null;
    setInspection({ status: "checking" });
    setInspectAttempt((attempt) => attempt + 1);
  };

  const invitation = inspection.status === "ready" ? inspection.invitation : null;
  const matchingAccount = auth.status === "authenticated" && auth.user?.role === "client" &&
    auth.user.email.trim().toLowerCase() === invitation?.email.trim().toLowerCase();
  const sessionBlocked = auth.status !== "unauthenticated" && !matchingAccount;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitation || !token.current || submitting.current || sessionBlocked || accepted) return;
    setErrorMessage(null);
    setPasswordError(null);
    setConfirmationError(null);
    if (!matchingAccount) {
      const message = invitation.requiresSignIn
        ? (!password ? "Enter your password." : null)
        : password.length < 12 ? "Password must be at least 12 characters."
          : password.length > 128 ? "Password must be at most 128 characters." : null;
      if (message) {
        setPasswordError(message);
        passwordInput.current?.focus();
        return;
      }
      if (!invitation.requiresSignIn && password !== confirmation) {
        setConfirmationError("Passwords do not match.");
        confirmationInput.current?.focus();
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (invitation.requiresSignIn && !matchingAccount) {
        await auth.login({ email: invitation.email, password });
        setPassword("");
        return;
      }
      const projectId = matchingAccount
        ? (await acceptExistingProjectInvitation(token.current)).projectId
        : await auth.acceptProjectInvitation({ token: token.current, password, passwordConfirmation: confirmation });
      token.current = null;
      setPassword("");
      setConfirmation("");
      setAccepted({ projectId, needsSignIn: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: clientKeys.latestVersions })
      ]);
      if (matchingAccount) await auth.restore();
    } catch (error) {
      if (error instanceof ProjectInvitationSessionError ||
        (error instanceof ApiError && error.code === "PROJECT_INVITATION_ACCEPTED_SIGN_IN_REQUIRED")) {
        token.current = null;
        setPassword("");
        setConfirmation("");
        setAccepted({ projectId: invitation.projectId, needsSignIn: true });
      } else if (unavailable(error)) {
        token.current = null;
        setInspection({ status: "unavailable" });
      } else if (error instanceof ApiError && error.code === "CLIENT_SIGN_IN_REQUIRED") {
        setInspection({ status: "ready", invitation: { ...invitation, requiresSignIn: true } });
        setPassword("");
        setConfirmation("");
        setErrorMessage("An account is already available for this email. Sign in to accept your project invitation.");
        passwordInput.current?.focus();
      } else {
        setErrorMessage(invitation.requiresSignIn && !matchingAccount
          ? "We couldn't sign you in. Check your password and try again."
          : "We couldn't accept your invitation. Please try again.");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  let content: ReactNode;
  if (accepted) {
    content = <div className="login-state" role="status">
      <h1 ref={resultHeading} tabIndex={-1}>Project invitation accepted</h1>
      <p>{accepted.needsSignIn ? "Your account is ready. Sign in to continue to your project." : "You can now share requirements and review estimates for your project."}</p>
      <Link className="login-submit" to={accepted.needsSignIn ? "/login" : `/client/projects/${encodeURIComponent(accepted.projectId)}`}>
        {accepted.needsSignIn ? "Continue to sign in" : "Open project"}
      </Link>
    </div>;
  } else if (inspection.status === "checking") {
    content = <div className="login-state" role="status"><h1>Checking your invitation</h1><p>Please wait while we verify your project invitation.</p></div>;
  } else if (inspection.status === "unavailable") {
    content = <div className="login-state" role="alert">
      <h1 ref={resultHeading} tabIndex={-1}>Invitation unavailable</h1>
      <p>This invitation is unavailable. Ask your Lisno contact to send a new project invitation.</p>
      <Link className="login-submit" to="/login">Go to sign in</Link>
    </div>;
  } else if (inspection.status === "error") {
    content = <div className="login-state" role="alert"><h1>Unable to check invitation</h1><p>Please try again when your connection is available.</p>
      <button className="login-submit" onClick={retryInspection}>Try again</button></div>;
  } else if (invitation) {
    content = <>
      <h1 className="login-card__title">Join your project</h1>
      <p className="login-card__subtitle">{invitation.requiresSignIn ? "Sign in with your existing client account, then accept this invitation." : "Choose a password to create your client account and join your project."}</p>
      <dl className="login-summary" aria-label="Project invitation summary">
        <div><dt>Project</dt><dd>{invitation.projectName}</dd></div>
        <div><dt>Name</dt><dd>{invitation.clientName}</dd></div>
        <div><dt>Email</dt><dd>{invitation.email}</dd></div>
      </dl>
      {sessionBlocked ? <section className="login-session-warning" aria-live="polite">
        <strong>{auth.status === "authenticated" ? "Use the invited client account" : "Check your current session"}</strong>
        <p>{auth.status === "authenticated" ? "You are signed in to a different account. Sign out to continue with the invited email." : "Your current session must be verified or signed out before accepting."}</p>
        <button type="button" disabled={auth.status === "signing_out" || busy} onClick={() => void auth.logout()}>Sign out</button>
      </section> : null}
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy}>
        {matchingAccount ? <p>You are signed in with the invited email. Accept to add this project to your account.</p> : <>
          <div className="login-field">
            <label htmlFor="project-invitation-password" className="login-field__label">Password</label>
            <div className="login-password-wrap">
              <input ref={passwordInput} id="project-invitation-password" name="password" className="login-input login-input--password"
                type={showPassword ? "text" : "password"} autoComplete={invitation.requiresSignIn ? "current-password" : "new-password"}
                disabled={busy || sessionBlocked} value={password} aria-invalid={Boolean(passwordError)} aria-describedby="project-invitation-password-hint"
                onChange={(event) => { setPassword(event.target.value); setPasswordError(null); }} />
              <button className="login-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword} disabled={busy || sessionBlocked} onClick={() => setShowPassword((show) => !show)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
            <p id="project-invitation-password-hint" className={`login-field__message${passwordError ? " login-field__message--error" : ""}`}>{passwordError ?? (invitation.requiresSignIn ? "Use your existing account password." : "Use 12 to 128 characters.")}</p>
          </div>
          {!invitation.requiresSignIn ? <div className="login-field">
            <label htmlFor="project-invitation-confirmation" className="login-field__label">Confirm password</label>
            <input ref={confirmationInput} id="project-invitation-confirmation" name="passwordConfirmation" className="login-input"
              type={showPassword ? "text" : "password"} autoComplete="new-password" disabled={busy || sessionBlocked} value={confirmation}
              aria-invalid={Boolean(confirmationError)} aria-describedby="project-invitation-confirmation-error"
              onChange={(event) => { setConfirmation(event.target.value); setConfirmationError(null); }} />
            <p id="project-invitation-confirmation-error" className="login-field__message login-field__message--error">{confirmationError}</p>
          </div> : null}
        </>}
        {errorMessage ? <p role="alert" className="login-field__message login-field__message--error">{errorMessage}</p> : null}
        <button className="login-submit" disabled={busy || sessionBlocked} type="submit" aria-busy={busy}>
          {busy ? "Please wait…" : invitation.requiresSignIn && !matchingAccount ? "Sign in to continue" : "Accept project invitation"}
        </button>
        {invitation.requiresSignIn && !matchingAccount ? <p className="login-footer-text">If you need to reset your password, <Link to="/forgot-password" target="_blank" rel="noreferrer">reset it in a new tab</Link>, then return here.</p> : null}
      </form>
    </>;
  }

  return <main className="login-screen login-screen--sage">
    <span className="login-logo" role="img" aria-label="Lisno" />
    <img className="login-bg" src={loginBackground} alt="" loading="eager" fetchPriority="high" />
    <div className="login-scrim" aria-hidden="true" />
    <div className="login-grid">
      <section className="login-hero" aria-label="Lisno client portal">
        <h2 className="login-hero__title">Shape your home, together.</h2>
        <p className="login-hero__body">Share your requirements, review estimates, and follow your project's progress.</p>
      </section>
      <div className="login-card-wrap"><div className="login-card">{content}</div></div>
    </div>
  </main>;
}
