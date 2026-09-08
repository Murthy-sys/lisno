import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import { requestPasswordReset } from "./passwordResetApi";
import "./login-page.css";

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.")
});

type RequestFields = z.infer<typeof requestSchema>;

const ACCEPTED_MESSAGE =
  "If an eligible account exists for that email, reset instructions will be sent.";
const ACCEPTED_SUPPORTING_COPY =
  "Check your inbox and spam folder. Wait a few minutes before trying again.";

type RequestError = "unavailable" | "rate_limited" | "other" | null;

export function ForgotPasswordPage() {
  const [accepted, setAccepted] = useState(false);
  const [requestError, setRequestError] = useState<RequestError>(null);
  const submittingRef = useRef(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const acceptedHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<RequestFields>({ defaultValues: { email: "" } });
  const { ref: registerEmail, ...emailRegistration } = register("email");

  useEffect(() => {
    if (!accepted) return;

    const focusFrame = requestAnimationFrame(() => {
      acceptedHeadingRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [accepted]);

  const submit = handleSubmit(async (values) => {
    if (submittingRef.current) return;

    const parsed = requestSchema.safeParse(values);
    if (!parsed.success) {
      setError("email", { message: parsed.error.issues[0]?.message });
      emailRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setRequestError(null);
    try {
      await requestPasswordReset(parsed.data.email);
      reset({ email: "" });
      setAccepted(true);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 503 ||
          error.code === "PASSWORD_RESET_DELIVERY_UNAVAILABLE")
      ) {
        setRequestError("unavailable");
      } else if (error instanceof ApiError && error.status === 429) {
        setRequestError("rate_limited");
      } else {
        setRequestError("other");
      }
    } finally {
      submittingRef.current = false;
    }
  });

  const tryAnotherEmail = () => {
    reset({ email: "" });
    setAccepted(false);
    setRequestError(null);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

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

          <h2 className="login-hero__title">Back into your workspace in minutes.</h2>

          <p className="login-hero__body">
            We&rsquo;ll email you a secure link to choose a new password, no back-and-forth
            required.
          </p>

          <div className="login-hero__footer">
            <p>Secure by design. Fast to recover. Back to work in minutes.</p>
          </div>
        </section>

        <div className="login-card-wrap">
          <div className="login-card">
            <div className="login-card__eyebrow">
              <span className="login-rule login-rule--card" aria-hidden="true" />
              <span>ACCOUNT RECOVERY</span>
            </div>

            {accepted ? (
              <div className="login-state" role="status" aria-live="polite" aria-atomic="true">
                <h2 ref={acceptedHeadingRef} tabIndex={-1}>
                  Request received
                </h2>
                <p>{ACCEPTED_MESSAGE}</p>
                <p>{ACCEPTED_SUPPORTING_COPY}</p>

                <Link to="/login" className="login-submit">
                  Back to sign in
                </Link>
                <button type="button" className="login-text-action" onClick={tryAnotherEmail}>
                  Try another email
                </button>
              </div>
            ) : (
              <>
                <h1 id="forgot-password-title" tabIndex={-1} className="login-card__title">
                  Reset your password
                </h1>
                <p className="login-card__subtitle">
                  Enter your account email to receive a secure reset link.
                </p>

                <form onSubmit={submit} noValidate aria-busy={isSubmitting}>
                  <p
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    aria-label="Password-reset request status"
                    className="sr-only"
                  >
                    {isSubmitting ? "Requesting password reset instructions." : ""}
                  </p>

                  {requestError ? (
                    <div role="alert" className="login-banner login-banner--error">
                      <span className="login-banner__dot" aria-hidden="true" />
                      <div className="login-banner__content">
                        <p className="login-banner__message">{requestErrorMessage(requestError)}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="login-field">
                    <label htmlFor="password-reset-email" className="login-field__label">
                      Email address
                    </label>
                    <input
                      id="password-reset-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby="password-reset-email-error"
                      className="login-input"
                      {...emailRegistration}
                      ref={(element) => {
                        registerEmail(element);
                        emailRef.current = element;
                      }}
                    />
                    <p
                      id="password-reset-email-error"
                      className={
                        errors.email
                          ? "login-field__message login-field__message--error"
                          : "login-field__message"
                      }
                    >
                      {errors.email?.message ?? ""}
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
                        Sending instructions…
                      </>
                    ) : (
                      <>
                        Send reset instructions
                        <span className="login-submit__arrow" aria-hidden="true">
                          &rarr;
                        </span>
                      </>
                    )}
                  </button>

                  <hr className="login-hairline" />

                  <p className="login-footer-text">
                    <Link to="/login">Back to sign in</Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function requestErrorMessage(error: Exclude<RequestError, null>): string {
  if (error === "unavailable") {
    return "Password reset is temporarily unavailable. Please try again later.";
  }
  if (error === "rate_limited") {
    return "Too many attempts. Please wait and try again later.";
  }
  return "We couldn't request password reset instructions. Please try again.";
}
