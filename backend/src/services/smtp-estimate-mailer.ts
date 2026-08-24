import nodemailer from "nodemailer";

import type { EnabledEstimateMailer } from "./estimate-mailer.js";
import {
  createIsolatedSmtpTransport,
  escapeMailHtml,
  MailDeliveryError,
  parseMailbox,
  type MailDeliveryConfig
} from "./smtp-transport.js";

export function createSmtpEstimateMailer(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): EnabledEstimateMailer & { readonly deliveryKind: "external" } {
  const sender = parseMailbox(config.from);
  const portalUrl = new URL("/client", config.publicFrontendUrl).toString();
  const transporter = nodemailer.createTransport(
    createIsolatedSmtpTransport(config)
  );

  return {
    deliveryKind: "external",
    async send(input) {
      const total = `INR ${input.total.toLocaleString("en-IN")}`;
      const clientName = escapeMailHtml(input.clientName);
      const projectName = escapeMailHtml(input.projectName);
      const safeTotal = escapeMailHtml(total);
      const safePortalUrl = escapeMailHtml(portalUrl);
      try {
        await transporter.sendMail({
          from: sender,
          to: { name: input.clientName, address: input.to },
          subject: `Lisno estimate for ${input.projectName} · v${input.estimateVersion}`,
          text: [
            `Hello ${input.clientName},`,
            "",
            `Your Lisno estimate for ${input.projectName} is ready.`,
            `Estimate version: ${input.estimateVersion}`,
            `Total: ${total}`,
            `View your client portal: ${portalUrl}`,
            "",
            "The estimate PDF is attached."
          ].join("\n"),
          html: [
            "<!doctype html>",
            "<html><body>",
            `<p>Hello ${clientName},</p>`,
            `<p>Your Lisno estimate for ${projectName} is ready.</p>`,
            `<p>Estimate version: ${input.estimateVersion}<br>Total: ${safeTotal}</p>`,
            `<p><a href="${safePortalUrl}">View your client portal</a></p>`,
            "<p>The estimate PDF is attached.</p>",
            "</body></html>"
          ].join(""),
          attachments: [{
            filename: input.attachment.filename,
            contentType: input.attachment.mimeType,
            content: input.attachment.bytes
          }],
          disableFileAccess: true,
          disableUrlAccess: true,
          xMailer: false
        });
        return { kind: "sent" };
      } catch (error) {
        if (error instanceof MailDeliveryError) {
          return { kind: "failed", failureCode: error.failureCode };
        }
        throw error;
      }
    }
  };
}
