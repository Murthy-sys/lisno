import nodemailer from "nodemailer";
import { createIsolatedSendGridTransport, parseSendGridMailbox, safeSendGridDeliveryError,
  type MailDeliveryConfig as SendGridConfig, type SendGridTransport } from "./sendgrid-transport.js";
import { createIsolatedSmtpTransport, escapeMailHtml, parseMailbox, safeMailDeliveryError,
  type MailDeliveryConfig as SmtpConfig } from "./smtp-transport.js";

export interface ProcurementBasketBoqMailInput {
  recipient: { name: string; email: string };
  rawToken: string;
  expiresAt: string;
  projectName: string;
  basketName: string;
  counterofferReason?: string | null;
  targetNetPaise?: number | null;
}
export type ProcurementBasketBoqMailer = { readonly deliveryKind: "disabled" } |
  { readonly deliveryKind: "external"; preflight(): Promise<void>;
    sendRequest(input: ProcurementBasketBoqMailInput): Promise<void> } |
  { readonly deliveryKind: "local_test"; preflight?(): Promise<void>;
    sendRequest(input: ProcurementBasketBoqMailInput): Promise<void> };

function content(input: ProcurementBasketBoqMailInput, frontendUrl: string) {
  const url = `${frontendUrl}/vendor-boq#token=${encodeURIComponent(input.rawToken)}`;
  const subject = input.counterofferReason ? `Revised BOQ quotation requested for ${input.basketName}` : `BOQ quotation requested for ${input.basketName}`;
  const target = input.targetNetPaise == null ? "" : ` Suggested before-GST total: ₹${(input.targetNetPaise / 100).toFixed(2)}.`;
  const message = input.counterofferReason ? `\n\nProcurement requested a revised quotation: ${input.counterofferReason}${target}` : "";
  return { subject,
    text: `Hello ${input.recipient.name},\n\nPlease quote the ${input.basketName} BOQ for ${input.projectName}: ${url}${message}\n\nThis private link expires at ${input.expiresAt} and can be used once.`,
    html: `<!doctype html><html><body><p>Hello ${escapeMailHtml(input.recipient.name)},</p><p>Please quote the ${escapeMailHtml(input.basketName)} BOQ for ${escapeMailHtml(input.projectName)}: <a href="${escapeMailHtml(url)}">Open BOQ</a></p>${input.counterofferReason ? `<p>Procurement requested a revised quotation: ${escapeMailHtml(input.counterofferReason)}${escapeMailHtml(target)}</p>` : ""}<p>This private link expires at ${escapeMailHtml(input.expiresAt)} and can be used once.</p></body></html>` };
}

export function createSmtpProcurementBasketBoqMailer(config: Extract<SmtpConfig, { kind: "smtp" }>): ProcurementBasketBoqMailer {
  const sender = parseMailbox(config.from);
  const transport = nodemailer.createTransport(createIsolatedSmtpTransport(config));
  return { deliveryKind: "external", async preflight() {
    try { await transport.verify(); } catch (error) { throw safeMailDeliveryError(error); }
  }, async sendRequest(input) {
    const message = content(input, config.publicFrontendUrl);
    try { await transport.sendMail({ from: sender, to: { name: input.recipient.name, address: input.recipient.email },
      ...message, disableFileAccess: true, disableUrlAccess: true, xMailer: false }); }
    catch (error) { throw safeMailDeliveryError(error); }
  } };
}

export function createSendGridProcurementBasketBoqMailer(config: Extract<SendGridConfig, { kind: "sendgrid_web_api" }>,
  transport: SendGridTransport = createIsolatedSendGridTransport(config)): ProcurementBasketBoqMailer {
  const sender = parseSendGridMailbox(config.from);
  return { deliveryKind: "external", async preflight() {
    try { await transport.send({ from: sender, to: sender, subject: "Lisno BOQ delivery check",
      text: "Delivery check only.", html: "<p>Delivery check only.</p>",
      mailSettings: { sandboxMode: { enable: true } } }); }
    catch (error) { throw safeSendGridDeliveryError(error); }
  }, async sendRequest(input) {
    const message = content(input, config.publicFrontendUrl);
    try { await transport.send({ from: sender, to: { name: input.recipient.name, email: input.recipient.email }, ...message }); }
    catch (error) { throw safeSendGridDeliveryError(error); }
  } };
}
