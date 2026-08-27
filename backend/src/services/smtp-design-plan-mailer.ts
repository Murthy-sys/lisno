import nodemailer from "nodemailer";

import type { EnabledDesignPlanMailer } from "./design-plan-mailer.js";
import {
  createIsolatedSmtpTransport,
  escapeMailHtml,
  MailDeliveryError,
  parseMailbox,
  type MailDeliveryConfig
} from "./smtp-transport.js";

export function createSmtpDesignPlanMailer(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): EnabledDesignPlanMailer & { readonly deliveryKind: "external" } {
  const sender = parseMailbox(config.from);
  const transporter = nodemailer.createTransport(
    createIsolatedSmtpTransport(config)
  );

  return {
    deliveryKind: "external",
    async sendDesignPlan(input) {
      const portalUrl = new URL(input.portalUrl).toString();
      const clientName = escapeMailHtml(input.clientName);
      const projectName = escapeMailHtml(input.projectName);
      const safePortalUrl = escapeMailHtml(portalUrl);
      try {
        await transporter.sendMail({
          from: sender,
          to: { name: input.clientName, address: input.to },
          subject: `Lisno design plan for ${input.projectName} · v${input.designPlanVersion}`,
          text: [
            `Hello ${input.clientName},`,
            "",
            `The design plan for ${input.projectName} is ready for your review.`,
            `Design version: ${input.designPlanVersion}`,
            `Review it in your client portal: ${portalUrl}`,
            "",
            input.attachments.length === 1
              ? "The uploaded plan is attached."
              : "The uploaded plans are attached."
          ].join("\n"),
          html: [
            "<!doctype html>",
            "<html><body>",
            `<p>Hello ${clientName},</p>`,
            `<p>The design plan for ${projectName} is ready for your review.</p>`,
            `<p>Design version: ${input.designPlanVersion}</p>`,
            `<p><a href="${safePortalUrl}">Review the design plan</a></p>`,
            `<p>${input.attachments.length === 1 ? "The uploaded plan is" : "The uploaded plans are"} attached.</p>`,
            "</body></html>"
          ].join(""),
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.mimeType,
            content: attachment.bytes
          })),
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
