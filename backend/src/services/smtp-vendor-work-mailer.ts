import nodemailer from "nodemailer";
import { createIsolatedSmtpTransport, parseMailbox, safeMailDeliveryError, type MailDeliveryConfig } from "./smtp-transport.js";
import type { VendorWorkMailer } from "./vendor-work-mailer.js";
import { vendorWorkMailTemplate } from "./vendor-work-mail-template.js";
export function createSmtpVendorWorkMailer(config: Extract<MailDeliveryConfig, { kind: "smtp" }>): Exclude<VendorWorkMailer, { deliveryKind: "disabled" }> {
  const transporter = nodemailer.createTransport(createIsolatedSmtpTransport(config));
  const sender = parseMailbox(config.from);
  return { deliveryKind: "external", async sendNewWork(input) {
    try { await transporter.sendMail({ from: sender, to: { name: input.recipient.name, address: input.recipient.email }, ...vendorWorkMailTemplate(input, config.publicFrontendUrl), disableFileAccess: true, disableUrlAccess: true, xMailer: false }); }
    catch (error) { throw safeMailDeliveryError(error); }
  } };
}
