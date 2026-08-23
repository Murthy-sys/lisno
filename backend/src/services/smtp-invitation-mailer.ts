import type { Readable } from "node:stream";

import nodemailer, { type Transport } from "nodemailer";
import addressparser from "nodemailer/lib/addressparser/index.js";
import SMTPConnection from "nodemailer/lib/smtp-connection";

import type { InvitationDeliveryConfig } from "../config/env.js";
import type { InvitationMailer } from "./invitation-mailer.js";

const SMTP_TIMEOUT_MS = 10_000;

interface SafeSentInfo {
  messageId: string;
}

type ProviderError = Error & {
  code?: unknown;
  responseCode?: unknown;
};

export class InvitationDeliveryError extends Error {
  constructor(readonly failureCode: string) {
    super("Invitation delivery failed.");
    this.name = "InvitationDeliveryError";
  }
}

function classifyFailure(error: unknown): string {
  if (error instanceof InvitationDeliveryError) return error.failureCode;
  const provider = error instanceof Error ? error as ProviderError : undefined;
  switch (provider?.code) {
    case "EAUTH":
      return "SMTP_AUTH_FAILED";
    case "ETLS":
      return "SMTP_TLS_FAILED";
    case "EMESSAGE":
    case "ESTREAM":
      return "SMTP_MESSAGE_FAILED";
    case "EDNS":
    case "ECONNECTION":
    case "ESOCKET":
    case "ETIMEDOUT":
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "SMTP_CONNECTION_FAILED";
    default:
      if (typeof provider?.responseCode === "number") {
        if (provider.responseCode >= 500) return "SMTP_REJECTED";
        if (provider.responseCode >= 400) return "SMTP_TEMPORARY_FAILURE";
      }
      return "SMTP_DELIVERY_FAILED";
  }
}

function safeFailure(error: unknown): InvitationDeliveryError {
  return new InvitationDeliveryError(classifyFailure(error));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]!);
}

function mailbox(value: string): { name: string; address: string } {
  const parsed = addressparser(value);
  const entry = parsed.length === 1 && "address" in parsed[0]! ? parsed[0] : undefined;
  if (!entry?.address) throw new Error("SMTP sender mailbox is invalid.");
  return { name: entry.name, address: entry.address };
}

function createIsolatedTransport(
  config: Extract<InvitationDeliveryConfig, { kind: "smtp" }>
): Transport<SafeSentInfo> {
  const transport: Transport<SafeSentInfo> = {
    name: "lisno-invitation-smtp",
    version: "1",
    send(mail, callback) {
      const implicitTls = config.tlsMode === "implicit";
      const connection = new SMTPConnection({
        host: config.host,
        port: config.port,
        secure: implicitTls,
        requireTLS: !implicitTls,
        ignoreTLS: false,
        logger: false,
        debug: false,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
        dnsTimeout: SMTP_TIMEOUT_MS,
        tls: { rejectUnauthorized: true }
      });
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (error?: unknown, info?: SafeSentInfo) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        connection.close();
        if (error !== undefined && error !== null) {
          callback(safeFailure(error), { messageId: "" });
          return;
        }
        callback(null, info ?? { messageId: mail.message.messageId() });
      };

      timer = setTimeout(() => {
        finish(new InvitationDeliveryError("SMTP_TIMEOUT"));
      }, SMTP_TIMEOUT_MS);
      timer.unref?.();

      connection.once("error", finish);
      connection.once("end", () => finish(new Error("SMTP connection ended.")));
      connection.connect((connectError) => {
        if (settled) return;
        if (connectError) {
          finish(connectError);
          return;
        }
        if (!connection.allowsAuth) {
          finish(new InvitationDeliveryError("SMTP_AUTH_FAILED"));
          return;
        }
        connection.login(
          { user: config.username, pass: config.password },
          (loginError) => {
            if (settled) return;
            if (loginError) {
              finish(loginError);
              return;
            }
            const envelope = mail.message.getEnvelope();
            const messageId = mail.message.messageId();
            connection.send(
              envelope,
              mail.message.createReadStream() as Readable,
              (sendError) => finish(sendError, { messageId })
            );
          }
        );
      });
    }
  };
  return transport;
}

export function createSmtpInvitationMailer(
  config: Extract<InvitationDeliveryConfig, { kind: "smtp" }>
): Extract<InvitationMailer, { deliveryKind: "external" }> {
  const sender = mailbox(config.from);
  const transporter = nodemailer.createTransport<SafeSentInfo>(
    createIsolatedTransport(config)
  );

  return {
    deliveryKind: "external",
    async sendInvitation(input) {
      const invitationUrl =
        `${config.publicFrontendUrl}/accept-invitation#token=${input.rawToken}`;
      const recipientName = escapeHtml(input.recipient.name);
      const roleLabel = escapeHtml(input.roleLabel);
      const safeUrl = escapeHtml(invitationUrl);
      const expiresAt = escapeHtml(input.expiresAt);
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
        throw safeFailure(error);
      }
    }
  };
}
