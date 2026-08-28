import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mailState = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn()
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mailState.createTransport
  }
}));

const smtpConfig = {
  kind: "smtp" as const,
  publicFrontendUrl: "https://app.lisno.example",
  host: "smtp.lisno.example",
  port: 587,
  tlsMode: "starttls" as const,
  username: "mailer-user",
  password: "mailer-password",
  from: "Lisno Security <security@lisno.example>",
  deliveryTimeoutMs: 120_000
};

beforeEach(() => {
  mailState.sendMail.mockResolvedValue({ messageId: "provider-message" });
  mailState.createTransport.mockReturnValue({ sendMail: mailState.sendMail });
});

afterEach(() => {
  mailState.createTransport.mockReset();
  mailState.sendMail.mockReset();
});

describe("SMTP password-reset mailer", () => {
  it.each([
    {
      label: "authentication",
      structured: { code: "EAUTH", responseCode: 550, command: "AUTH PLAIN" },
      expected: "SMTP_AUTH_FAILED"
    },
    {
      label: "TLS negotiation",
      structured: { code: "ETLS", responseCode: 550, command: "STARTTLS" },
      expected: "SMTP_TLS_FAILED"
    },
    {
      label: "required TLS",
      structured: {
        code: "EREQUIRETLS",
        responseCode: 550,
        command: "MAIL FROM"
      },
      expected: "SMTP_TLS_FAILED"
    },
    {
      label: "connection",
      structured: { code: "ECONNREFUSED" },
      expected: "SMTP_CONNECTION_FAILED"
    },
    {
      label: "wall-clock timeout",
      safeFailureCode: "SMTP_TIMEOUT",
      expected: "SMTP_TIMEOUT"
    },
    {
      label: "sender rejection",
      structured: {
        code: "EENVELOPE",
        responseCode: 550,
        command: "MAIL FROM"
      },
      expected: "SMTP_SENDER_REJECTED"
    },
    {
      label: "recipient rejection",
      structured: {
        code: "EENVELOPE",
        responseCode: 550,
        command: "RCPT TO"
      },
      expected: "SMTP_RECIPIENT_REJECTED"
    },
    {
      label: "permanent DATA rejection",
      structured: { code: "EMESSAGE", responseCode: 550, command: "DATA" },
      expected: "SMTP_REJECTED"
    },
    {
      label: "temporary DATA rejection",
      structured: { code: "EMESSAGE", responseCode: 451, command: "DATA" },
      expected: "SMTP_TEMPORARY_FAILURE"
    },
    {
      label: "message construction",
      structured: { code: "EMESSAGE", command: "API" },
      expected: "SMTP_MESSAGE_FAILED"
    },
    {
      label: "message stream",
      structured: { code: "ESTREAM", command: "API" },
      expected: "SMTP_MESSAGE_FAILED"
    },
    {
      label: "unknown provider error",
      structured: { code: "UNRECOGNIZED" },
      expected: "SMTP_DELIVERY_FAILED"
    },
    {
      label: "untrusted command that resembles a sender stage",
      structured: {
        code: "EENVELOPE",
        responseCode: 550,
        command: "MAIL FROM victim@example.com token=reset-secret"
      },
      expected: "SMTP_REJECTED"
    }
  ])("classifies $label failures using only bounded structured metadata", async ({
    structured,
    safeFailureCode,
    expected
  }) => {
    const privateValues = [
      "victim@example.com",
      "reset-token-private-value",
      "smtp-api-key-private-value"
    ];
    const { MailDeliveryError, safeMailDeliveryError } = await import(
      "../src/services/smtp-transport.js"
    );
    const providerFailure = safeFailureCode
      ? new MailDeliveryError(safeFailureCode)
      : Object.assign(
          new Error(privateValues.join(" ")),
          structured,
          {
            response: privateValues.join(" "),
            recipient: privateValues[0],
            token: privateValues[1],
            credential: privateValues[2]
          }
        );

    const failure = safeMailDeliveryError(providerFailure);
    const serialized = `${String(failure)} ${JSON.stringify(failure)}`;

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect(failure).toMatchObject({ failureCode: expected });
    expect(String(failure)).toBe("Error: Mail delivery failed.");
    for (const privateValue of privateValues) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("response");
    expect(failure).not.toHaveProperty("command");
  });

  it("sanitizes a non-taxonomy code passed to the shared delivery error", async () => {
    const { MailDeliveryError } = await import(
      "../src/services/smtp-transport.js"
    );
    const failure = new MailDeliveryError(
      "SMTP_PRIVATE_reset-token-private-value"
    );

    expect(failure.failureCode).toBe("SMTP_DELIVERY_FAILED");
    expect(JSON.stringify(failure)).not.toContain("reset-token-private-value");
  });

  it("builds the trusted fragment-only reset URL and escapes HTML", async () => {
    const { createSmtpPasswordResetMailer } = await import(
      "../src/services/smtp-password-reset-mailer.js"
    );
    const mailer = createSmtpPasswordResetMailer(smtpConfig);
    const rawToken = "r".repeat(43);
    const expiresAt = "2026-08-28T12:30:00.000Z <expires>";

    await mailer.sendResetLink({
      recipient: {
        name: "Asha <script>alert('mail')</script>",
        email: "asha@example.com"
      },
      rawToken,
      expiresAt
    });

    expect(mailer.deliveryKind).toBe("external");
    expect(mailState.createTransport).toHaveBeenCalledOnce();
    expect(mailState.sendMail).toHaveBeenCalledOnce();

    const message = mailState.sendMail.mock.calls[0]![0] as Record<string, unknown>;
    const resetUrl =
      `${smtpConfig.publicFrontendUrl}/reset-password#token=${rawToken}`;
    expect(message).toMatchObject({
      from: {
        name: "Lisno Security",
        address: "security@lisno.example"
      },
      to: {
        name: "Asha <script>alert('mail')</script>",
        address: "asha@example.com"
      },
      subject: "Reset your Lisno password",
      disableFileAccess: true,
      disableUrlAccess: true,
      xMailer: false
    });
    expect(message.text).toContain(`Choose a new password: ${resetUrl}`);
    expect(message.html).toContain(`href="${resetUrl}"`);
    expect(message.html).toContain(
      "Asha &lt;script&gt;alert(&#39;mail&#39;)&lt;/script&gt;"
    );
    expect(message.html).toContain(
      "2026-08-28T12:30:00.000Z &lt;expires&gt;"
    );
    expect(message.html).not.toContain("<script>");
    expect(message.text).not.toContain("/reset-password?token=");
    expect(message.html).not.toContain("/reset-password?token=");
    expect(message).not.toHaveProperty("attachments");
  });

  it("sends an independent password-changed notification without a token or link", async () => {
    const { createSmtpPasswordResetMailer } = await import(
      "../src/services/smtp-password-reset-mailer.js"
    );
    const mailer = createSmtpPasswordResetMailer(smtpConfig);
    const changedAt = "2026-08-28T12:45:00.000Z <changed>";

    await mailer.sendPasswordChanged({
      recipient: {
        name: "Devika & Team",
        email: "devika@example.com"
      },
      changedAt
    });

    expect(mailState.sendMail).toHaveBeenCalledOnce();
    const message = mailState.sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(message).toMatchObject({
      from: {
        name: "Lisno Security",
        address: "security@lisno.example"
      },
      to: { name: "Devika & Team", address: "devika@example.com" },
      subject: "Your Lisno password was changed",
      disableFileAccess: true,
      disableUrlAccess: true,
      xMailer: false
    });
    expect(message.text).toContain(`password was changed at ${changedAt}`);
    expect(message.html).toContain("Devika &amp; Team");
    expect(message.html).toContain(
      "2026-08-28T12:45:00.000Z &lt;changed&gt;"
    );
    expect(JSON.stringify(message)).not.toMatch(
      /reset-password|#token=|choose a new password|href=/iu
    );
    expect(message).not.toHaveProperty("attachments");
  });

  it("replaces reset-link provider failures with the shared safe delivery error", async () => {
    const providerFailure = Object.assign(
      new Error("550 victim@example.com rejected AUTH PLAIN private-value"),
      { code: "EAUTH", response: "provider payload" }
    );
    mailState.sendMail.mockRejectedValue(providerFailure);
    const {
      createSmtpPasswordResetMailer,
      PasswordResetDeliveryError
    } = await import("../src/services/smtp-password-reset-mailer.js");
    const mailer = createSmtpPasswordResetMailer(smtpConfig);

    const failure = await mailer.sendResetLink({
      recipient: { name: "Asha", email: "victim@example.com" },
      rawToken: "s".repeat(43),
      expiresAt: "2026-08-28T12:30:00.000Z"
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PasswordResetDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SMTP_AUTH_FAILED" });
    expect(String(failure)).toBe("Error: Mail delivery failed.");
    expect(String(failure)).not.toMatch(
      /victim|provider|AUTH PLAIN|private-value|550/iu
    );
  });

  it("keeps notification delivery independent after a reset-link failure", async () => {
    const { createSmtpPasswordResetMailer } = await import(
      "../src/services/smtp-password-reset-mailer.js"
    );
    const mailer = createSmtpPasswordResetMailer(smtpConfig);
    mailState.sendMail
      .mockRejectedValueOnce(Object.assign(new Error("provider detail"), {
        code: "ECONNREFUSED"
      }))
      .mockResolvedValueOnce({ messageId: "notification-message" });

    await expect(mailer.sendResetLink({
      recipient: { name: "Asha", email: "asha@example.com" },
      rawToken: "t".repeat(43),
      expiresAt: "2026-08-28T12:30:00.000Z"
    })).rejects.toMatchObject({ failureCode: "SMTP_CONNECTION_FAILED" });

    await expect(mailer.sendPasswordChanged({
      recipient: { name: "Asha", email: "asha@example.com" },
      changedAt: "2026-08-28T12:45:00.000Z"
    })).resolves.toBeUndefined();

    expect(mailState.sendMail).toHaveBeenCalledTimes(2);
    const notification = mailState.sendMail.mock.calls[1]![0] as Record<string, unknown>;
    expect(notification.subject).toBe("Your Lisno password was changed");
  });

  it("maps password-changed provider failures to a bounded safe code", async () => {
    mailState.sendMail.mockRejectedValue(Object.assign(
      new Error("451 provider response recipient@example.com"),
      { responseCode: 451, response: "private provider detail" }
    ));
    const {
      createSmtpPasswordResetMailer,
      PasswordResetDeliveryError
    } = await import("../src/services/smtp-password-reset-mailer.js");
    const mailer = createSmtpPasswordResetMailer(smtpConfig);

    const failure = await mailer.sendPasswordChanged({
      recipient: { name: "Asha", email: "recipient@example.com" },
      changedAt: "2026-08-28T12:45:00.000Z"
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PasswordResetDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SMTP_TEMPORARY_FAILURE" });
    expect(String(failure)).not.toMatch(/recipient|provider|451|private/iu);
  });
});
