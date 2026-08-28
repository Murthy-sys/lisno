import type { InvitationMailer } from "./invitation-mailer.js";
import {
  createIsolatedSendGridTransport,
  parseSendGridMailbox,
  safeSendGridDeliveryError,
  type MailDeliveryConfig,
  type SendGridTransport
} from "./sendgrid-transport.js";
import { escapeMailHtml } from "./smtp-transport.js";

export { MailDeliveryError as InvitationDeliveryError } from "./smtp-transport.js";

export function createSendGridInvitationMailer(
  config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>,
  transport: SendGridTransport = createIsolatedSendGridTransport(config)
): Extract<InvitationMailer, { deliveryKind: "external" }> {
  const sender = parseSendGridMailbox(config.from);

  return {
    deliveryKind: "external",
    async sendInvitation(input) {
      const invitationUrl =
        `${config.publicFrontendUrl}/accept-invitation#token=${input.rawToken}`;
      const recipientName = escapeMailHtml(input.recipient.name);
      const roleLabel = escapeMailHtml(input.roleLabel);
      const safeUrl = escapeMailHtml(invitationUrl);
      const expiresAt = escapeMailHtml(input.expiresAt);

      try {
        await transport.send({
          from: sender,
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
            `<p>Hello ${recipientName},</p>`,
            `<p>You have been invited to Lisno as ${roleLabel}.</p>`,
            `<p><a href="${safeUrl}">Accept your invitation</a></p>`,
            `<p>This invitation expires at ${expiresAt}.</p>`,
            "</body></html>"
          ].join("")
        });
      } catch (error) {
        throw safeSendGridDeliveryError(error);
      }
    }
  };
}
