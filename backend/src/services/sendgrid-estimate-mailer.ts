import type { EnabledEstimateMailer } from "./estimate-mailer.js";
import {
  createIsolatedSendGridTransport,
  parseSendGridMailbox,
  type MailDeliveryConfig,
  type SendGridTransport
} from "./sendgrid-transport.js";
import { escapeMailHtml, MailDeliveryError } from "./smtp-transport.js";

export function createSendGridEstimateMailer(
  config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>,
  transport: SendGridTransport = createIsolatedSendGridTransport(config)
): EnabledEstimateMailer & { readonly deliveryKind: "external" } {
  const sender = parseSendGridMailbox(config.from);
  const portalUrl = new URL("/client", config.publicFrontendUrl).toString();

  return {
    deliveryKind: "external",
    async send(input) {
      const total = `INR ${input.total.toLocaleString("en-IN")}`;
      const clientName = escapeMailHtml(input.clientName);
      const projectName = escapeMailHtml(input.projectName);
      const safeTotal = escapeMailHtml(total);
      const safePortalUrl = escapeMailHtml(portalUrl);

      try {
        await transport.send({
          from: sender,
          to: { name: input.clientName, email: input.to },
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
            content: input.attachment.bytes.toString("base64"),
            filename: input.attachment.filename,
            type: input.attachment.mimeType,
            disposition: "attachment"
          }]
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
