import nodemailer from "nodemailer";

import type { InvitationMailer } from "./invitation-mailer.js";
import {
  createIsolatedSmtpTransport,
  escapeMailHtml,
  parseMailbox,
  safeMailDeliveryError,
  type MailDeliveryConfig
} from "./smtp-transport.js";

export { MailDeliveryError as InvitationDeliveryError } from "./smtp-transport.js";

export function createSmtpInvitationMailer(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): Extract<InvitationMailer, { deliveryKind: "external" }> {
  const sender = parseMailbox(config.from);
  const transporter = nodemailer.createTransport(
    createIsolatedSmtpTransport(config)
  );

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
        await transporter.sendMail({
          from: sender,
          to: { name: input.recipient.name, address: input.recipient.email },
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
            '<html><body>',
            `<p>Hello ${recipientName},</p>`,
            `<p>You have been invited to Lisno as ${roleLabel}.</p>`,
            `<p><a href="${safeUrl}">Accept your invitation</a></p>`,
            `<p>This invitation expires at ${expiresAt}.</p>`,
            "</body></html>"
          ].join(""),
          disableFileAccess: true,
          disableUrlAccess: true,
          xMailer: false
        });
      } catch (error) {
        throw safeMailDeliveryError(error);
      }
    }
  };
}
