import { describe, expect, it, vi } from "vitest";

import {
  createSendGridInvitationMailer,
  InvitationDeliveryError
} from "../src/services/sendgrid-invitation-mailer.js";
import type {
  SendGridMessage,
  SendGridTransport
} from "../src/services/sendgrid-transport.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const config = {
  kind: "sendgrid_web_api",
  publicFrontendUrl: "https://app.lisno.example",
  apiKey: "SG.fabricated-invitation-key-for-tests",
  from: "Lisno Invitations <invitations@lisno.example>",
  deliveryTimeoutMs: 30_000
} as const;

function createTransport(
  implementation: SendGridTransport["send"] = async () => undefined
) {
  return {
    send: vi.fn(implementation)
  } satisfies SendGridTransport;
}

describe("SendGrid invitation mailer", () => {
  it("sends the exact invitation content with a fragment-only URL and escaped HTML", async () => {
    const transport = createTransport();
    const mailer = createSendGridInvitationMailer(config, transport);
    const rawToken = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    const input = {
      recipient: {
        name: "Asha <script>alert('mail')</script>",
        email: "asha@example.com"
      },
      roleLabel: "Designer & Planner",
      rawToken,
      expiresAt: "2026-08-24T10:00:00.000Z <expires>"
    };
    const invitationUrl =
      `${config.publicFrontendUrl}/accept-invitation#token=${rawToken}`;

    await mailer.sendInvitation(input);

    expect(mailer.deliveryKind).toBe("external");
    expect(transport.send).toHaveBeenCalledOnce();
    expect(transport.send).toHaveBeenCalledWith({
      from: {
        name: "Lisno Invitations",
        email: "invitations@lisno.example"
      },
      to: {
        name: input.recipient.name,
        email: input.recipient.email
      },
      subject: `Your Lisno ${input.roleLabel} invitation`,
      text: [
        `Hello ${input.recipient.name},`,
        "",
        `You have been invited to Lisno as ${input.roleLabel}.`,
        `Accept your invitation: ${invitationUrl}`,
        `This invitation expires at ${input.expiresAt}.`
      ].join("\n"),
      html: [
        "<!doctype html>",
        "<html><body>",
        "<p>Hello Asha &lt;script&gt;alert(&#39;mail&#39;)&lt;/script&gt;,</p>",
        "<p>You have been invited to Lisno as Designer &amp; Planner.</p>",
        `<p><a href="${invitationUrl}">Accept your invitation</a></p>`,
        "<p>This invitation expires at 2026-08-24T10:00:00.000Z &lt;expires&gt;.</p>",
        "</body></html>"
      ].join("")
    } satisfies SendGridMessage);
    const message = transport.send.mock.calls[0]![0];
    expect(message).not.toHaveProperty("attachments");
    expect(message.text).not.toContain("/accept-invitation?token=");
    expect(message.html).not.toContain("<script>");
  });

  it("reuses the one injected transport for independent sends", async () => {
    const transport = createTransport();
    const mailer = createSendGridInvitationMailer(config, transport);
    const input = {
      recipient: { name: "Asha", email: "asha@example.com" },
      roleLabel: "Designer",
      rawToken: "r".repeat(43),
      expiresAt: "2026-08-24T10:00:00.000Z"
    };

    await mailer.sendInvitation(input);
    await mailer.sendInvitation(input);

    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("preserves a bounded transport failure through the shared delivery error alias", async () => {
    const providerFailure = new MailDeliveryError("SENDGRID_FORBIDDEN");
    const transport = createTransport(async () => {
      throw providerFailure;
    });
    const mailer = createSendGridInvitationMailer(config, transport);

    const failure = await mailer.sendInvitation({
      recipient: { name: "Asha", email: "asha@example.com" },
      roleLabel: "Designer",
      rawToken: "s".repeat(43),
      expiresAt: "2026-08-24T10:00:00.000Z"
    }).catch((error: unknown) => error);

    expect(InvitationDeliveryError).toBe(MailDeliveryError);
    expect(failure).toBe(providerFailure);
    expect(failure).toBeInstanceOf(InvitationDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_FORBIDDEN" });
  });

  it("discards hostile provider details, recipients, tokens, and credentials", async () => {
    const privateValues = [
      "victim@example.com",
      "invitation-token-private-value",
      config.apiKey,
      "hostile provider body"
    ];
    const transport = createTransport(async () => {
      throw Object.assign(new Error(privateValues.join(" ")), {
        response: { body: privateValues.join(" ") },
        authorization: config.apiKey
      });
    });
    const mailer = createSendGridInvitationMailer(config, transport);

    const failure = await mailer.sendInvitation({
      recipient: { name: "Victim", email: privateValues[0]! },
      roleLabel: "Designer",
      rawToken: privateValues[1]!,
      expiresAt: "2026-08-24T10:00:00.000Z"
    }).catch((error: unknown) => error);
    const exposed = `${String(failure)} ${JSON.stringify(failure)}`;

    expect(failure).toBeInstanceOf(InvitationDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_DELIVERY_FAILED" });
    for (const privateValue of privateValues) {
      expect(exposed).not.toContain(privateValue);
    }
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("response");
  });
});
