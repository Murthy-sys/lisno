import { ArrowLeft, Info, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/client";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { requestPasswordReset } from "./passwordResetApi";

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
    <main className="invitation-page password-reset-page">
      <section
        className="invitation-card password-reset-card"
        aria-label="Lisno password recovery"
      >
        <BrandLogo />
        <div className="invitation-card__heading">
          <p className="eyebrow">Account recovery</p>
          <h1 tabIndex={-1}>Reset your password</h1>
          <p>Enter your account email to receive a secure reset link.</p>
        </div>

        {accepted ? (
          <div
            className="invitation-state password-reset-result"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="password-reset-information-mark" aria-hidden="true">
              <Info />
            </span>
            <h2 ref={acceptedHeadingRef} tabIndex={-1}>
              Request received
            </h2>
            <p>{ACCEPTED_MESSAGE}</p>
            <p className="password-reset-supporting-copy">
              {ACCEPTED_SUPPORTING_COPY}
            </p>
            <div className="password-reset-actions">
              <Link className="invitation-link invitation-link--primary" to="/login">
                <ArrowLeft aria-hidden="true" />
                Back to sign in
              </Link>
              <button
                type="button"
                className="invitation-secondary-action"
                onClick={tryAnotherEmail}
              >
                Try another email
              </button>
            </div>
          </div>
        ) : (
          <form
            className="password-reset-form"
            onSubmit={submit}
            noValidate
            aria-busy={isSubmitting}
          >
            <p
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Password-reset request status"
            >
              {isSubmitting ? "Requesting password reset instructions." : ""}
            </p>

            {requestError ? (
              <p className="invitation-submit-error" role="alert">
                {requestErrorMessage(requestError)}
              </p>
            ) : null}

            <Field
              id="password-reset-email"
              label="Email address"
              error={errors.email?.message}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  {...emailRegistration}
                  ref={(element) => {
                    registerEmail(element);
                    emailRef.current = element;
                  }}
                />
              )}
            </Field>

            <Button
              type="submit"
              fullWidth
              busy={isSubmitting}
              busyLabel="Sending instructions…"
              leadingIcon={<Mail aria-hidden="true" />}
            >
              Send reset instructions
            </Button>
            <Link className="invitation-link password-reset-back-link" to="/login">
              <ArrowLeft aria-hidden="true" />
              Back to sign in
            </Link>
          </form>
        )}
      </section>
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
