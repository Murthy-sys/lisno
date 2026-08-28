import { describe, expect, it, vi } from "vitest";

import {
  createSendGridPasswordResetMailer,
  PasswordResetDeliveryError
} from "../src/services/sendgrid-password-reset-mailer.js";
import type {
  SendGridMessage,
  SendGridTransport
} from "../src/services/sendgrid-transport.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const config = {
  kind: "sendgrid_web_api",
  publicFrontendUrl: "https://app.lisno.example",
  apiKey: "SG.fabricated-password-key-for-tests",
  from: "Lisno Security <security@lisno.example>",
  deliveryTimeoutMs: 30_000
} as const;

function createTransport(
  implementation: SendGridTransport["send"] = async () => undefined
) {
  return {
    send: vi.fn(implementation)
  } satisfies SendGridTransport;
}

describe("SendGrid password-reset mailer", () => {
  it("sends the exact reset-link content with a trusted fragment URL and escaped HTML", async () => {
    const transport = createTransport();
    const mailer = createSendGridPasswordResetMailer(config, transport);
    const rawToken = "r".repeat(43);
    const input = {
      recipient: {
        name: "Asha <script>alert('mail')</script>",
        email: "asha@example.com"
      },
      rawToken,
      expiresAt: "2026-08-28T12:30:00.000Z <expires>"
    };
    const resetUrl =
      `${config.publicFrontendUrl}/reset-password#token=${rawToken}`;

    await mailer.sendResetLink(input);

    expect(mailer.deliveryKind).toBe("external");
    expect(transport.send).toHaveBeenCalledOnce();
    expect(transport.send).toHaveBeenCalledWith({
      from: {
        name: "Lisno Security",
        email: "security@lisno.example"
      },
      to: {
        name: input.recipient.name,
        email: input.recipient.email
      },
      subject: "Reset your Lisno password",
      text: [
        `Hello ${input.recipient.name},`,
        "",
        "We received a request to reset your Lisno password.",
        `Choose a new password: ${resetUrl}`,
        `This link expires at ${input.expiresAt} and can be used only once.`,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: [
        "<!doctype html>",
        "<html><body>",
        "<p>Hello Asha &lt;script&gt;alert(&#39;mail&#39;)&lt;/script&gt;,</p>",
        "<p>We received a request to reset your Lisno password.</p>",
        `<p><a href="${resetUrl}">Choose a new password</a></p>`,
        "<p>This link expires at 2026-08-28T12:30:00.000Z &lt;expires&gt; and can be used only once.</p>",
        "<p>If you did not request this, you can ignore this email.</p>",
        "</body></html>"
      ].join("")
    } satisfies SendGridMessage);
    const message = transport.send.mock.calls[0]![0];
    expect(message).not.toHaveProperty("attachments");
    expect(message.text).not.toContain("/reset-password?token=");
    expect(message.html).not.toContain("<script>");
  });

  it("sends the exact password-changed notification without a token, link, or attachment", async () => {
    const transport = createTransport();
    const mailer = createSendGridPasswordResetMailer(config, transport);
    const input = {
      recipient: {
        name: "Devika & Team",
        email: "devika@example.com"
      },
      changedAt: "2026-08-28T12:45:00.000Z <changed>"
    };

    await mailer.sendPasswordChanged(input);

    expect(transport.send).toHaveBeenCalledOnce();
    expect(transport.send).toHaveBeenCalledWith({
      from: {
        name: "Lisno Security",
        email: "security@lisno.example"
      },
      to: {
        name: input.recipient.name,
        email: input.recipient.email
      },
      subject: "Your Lisno password was changed",
      text: [
        `Hello ${input.recipient.name},`,
        "",
        `Your Lisno password was changed at ${input.changedAt}.`,
        "If you did not make this change, contact your Lisno administrator immediately."
      ].join("\n"),
      html: [
        "<!doctype html>",
        "<html><body>",
        "<p>Hello Devika &amp; Team,</p>",
        "<p>Your Lisno password was changed at 2026-08-28T12:45:00.000Z &lt;changed&gt;.</p>",
        "<p>If you did not make this change, contact your Lisno administrator immediately.</p>",
        "</body></html>"
      ].join("")
    } satisfies SendGridMessage);
    const message = transport.send.mock.calls[0]![0];
    expect(message).not.toHaveProperty("attachments");
    expect(JSON.stringify(message)).not.toMatch(
      /reset-password|#token=|choose a new password|href=/iu
    );
  });

  it("uses one transport while keeping reset and notification sends independent", async () => {
    const transport = createTransport();
    const mailer = createSendGridPasswordResetMailer(config, transport);

    await mailer.sendResetLink({
      recipient: { name: "Asha", email: "asha@example.com" },
      rawToken: "s".repeat(43),
      expiresAt: "2026-08-28T12:30:00.000Z"
    });
    await mailer.sendPasswordChanged({
      recipient: { name: "Asha", email: "asha@example.com" },
      changedAt: "2026-08-28T12:45:00.000Z"
    });

    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(transport.send.mock.calls[0]![0].subject)
      .toBe("Reset your Lisno password");
    expect(transport.send.mock.calls[1]![0].subject)
      .toBe("Your Lisno password was changed");
  });

  it("preserves bounded errors through the shared service-recognized alias", async () => {
    const providerFailure = new MailDeliveryError("SENDGRID_RATE_LIMITED");
    const transport = createTransport(async () => {
      throw providerFailure;
    });
    const mailer = createSendGridPasswordResetMailer(config, transport);

    const failure = await mailer.sendResetLink({
      recipient: { name: "Asha", email: "asha@example.com" },
      rawToken: "t".repeat(43),
      expiresAt: "2026-08-28T12:30:00.000Z"
    }).catch((error: unknown) => error);

    expect(PasswordResetDeliveryError).toBe(MailDeliveryError);
    expect(failure).toBe(providerFailure);
    expect(failure).toBeInstanceOf(PasswordResetDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_RATE_LIMITED" });
  });

  it("discards hostile provider payloads, recipients, tokens, and credentials", async () => {
    const privateValues = [
      "victim@example.com",
      "reset-token-private-value",
      config.apiKey,
      "hostile provider body"
    ];
    const transport = createTransport(async () => {
      throw Object.assign(new Error(privateValues.join(" ")), {
        response: {
          statusCode: 401,
          body: privateValues.join(" ")
        },
        authorization: config.apiKey
      });
    });
    const mailer = createSendGridPasswordResetMailer(config, transport);

    const failure = await mailer.sendResetLink({
      recipient: { name: "Victim", email: privateValues[0]! },
      rawToken: privateValues[1]!,
      expiresAt: "2026-08-28T12:30:00.000Z"
    }).catch((error: unknown) => error);
    const exposed = `${String(failure)} ${JSON.stringify(failure)}`;

    expect(failure).toBeInstanceOf(PasswordResetDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_AUTH_FAILED" });
    for (const privateValue of privateValues) {
      expect(exposed).not.toContain(privateValue);
    }
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("response");
  });
});
