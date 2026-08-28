import nodemailer from "nodemailer";

import type { PasswordResetMailer } from "./password-reset-mailer.js";
import {
  createIsolatedSmtpTransport,
  escapeMailHtml,
  parseMailbox,
  safeMailDeliveryError,
  type MailDeliveryConfig
} from "./smtp-transport.js";

export { MailDeliveryError as PasswordResetDeliveryError } from "./smtp-transport.js";

export function createSmtpPasswordResetMailer(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): Extract<PasswordResetMailer, { deliveryKind: "external" }> {
  const sender = parseMailbox(config.from);
  const transporter = nodemailer.createTransport(
    createIsolatedSmtpTransport(config)
  );

  return {
    deliveryKind: "external",
    async sendResetLink(input) {
      const resetUrl =
        `${config.publicFrontendUrl}/reset-password#token=${input.rawToken}`;
      const recipientName = escapeMailHtml(input.recipient.name);
      const safeResetUrl = escapeMailHtml(resetUrl);
      const expiresAt = escapeMailHtml(input.expiresAt);

      try {
        await transporter.sendMail({
          from: sender,
          to: { name: input.recipient.name, address: input.recipient.email },
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
            `<p>Hello ${recipientName},</p>`,
            "<p>We received a request to reset your Lisno password.</p>",
            `<p><a href="${safeResetUrl}">Choose a new password</a></p>`,
            `<p>This link expires at ${expiresAt} and can be used only once.</p>`,
            "<p>If you did not request this, you can ignore this email.</p>",
            "</body></html>"
          ].join(""),
          disableFileAccess: true,
          disableUrlAccess: true,
          xMailer: false
        });
      } catch (error) {
        throw safeMailDeliveryError(error);
      }
    },

    async sendPasswordChanged(input) {
      const recipientName = escapeMailHtml(input.recipient.name);
      const changedAt = escapeMailHtml(input.changedAt);

      try {
        await transporter.sendMail({
          from: sender,
          to: { name: input.recipient.name, address: input.recipient.email },
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
            `<p>Hello ${recipientName},</p>`,
            `<p>Your Lisno password was changed at ${changedAt}.</p>`,
            "<p>If you did not make this change, contact your Lisno administrator immediately.</p>",
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
