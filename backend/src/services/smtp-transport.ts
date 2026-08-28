import type { Readable } from "node:stream";

import type { Transport } from "nodemailer";
import addressparser from "nodemailer/lib/addressparser/index.js";
import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";

export type MailDeliveryConfig =
  | { kind: "disabled" }
  | {
      kind: "smtp";
      publicFrontendUrl: string;
      host: string;
      port: number;
      tlsMode: "implicit" | "starttls";
      username: string;
      password: string;
      from: string;
      deliveryTimeoutMs: number;
    };

const MAIL_DELIVERY_FAILURE_CODES = [
  "SMTP_AUTH_FAILED",
  "SMTP_TLS_FAILED",
  "SMTP_CONNECTION_FAILED",
  "SMTP_TIMEOUT",
  "SMTP_SENDER_REJECTED",
  "SMTP_RECIPIENT_REJECTED",
  "SMTP_MESSAGE_FAILED",
  "SMTP_REJECTED",
  "SMTP_TEMPORARY_FAILURE",
  "SMTP_DELIVERY_FAILED",
  "SENDGRID_AUTH_FAILED",
  "SENDGRID_FORBIDDEN",
  "SENDGRID_RATE_LIMITED",
  "SENDGRID_REQUEST_REJECTED",
  "SENDGRID_UNAVAILABLE",
  "SENDGRID_TIMEOUT",
  "SENDGRID_CONNECTION_FAILED",
  "SENDGRID_DELIVERY_FAILED"
] as const;

export type MailDeliveryFailureCode =
  (typeof MAIL_DELIVERY_FAILURE_CODES)[number];

function isMailDeliveryFailureCode(
  value: string
): value is MailDeliveryFailureCode {
  return (MAIL_DELIVERY_FAILURE_CODES as readonly string[]).includes(value);
}

export class MailDeliveryError extends Error {
  readonly failureCode: MailDeliveryFailureCode;

  constructor(failureCode: string) {
    super("Mail delivery failed.");
    this.failureCode = isMailDeliveryFailureCode(failureCode)
      ? failureCode
      : "SMTP_DELIVERY_FAILED";
  }
}

interface SafeSentInfo {
  messageId: string;
}

type ProviderError = Error & {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
};

const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;

function hasSmtpFailureResponse(
  provider: ProviderError
): provider is ProviderError & { responseCode: number } {
  return typeof provider.responseCode === "number"
    && Number.isInteger(provider.responseCode)
    && provider.responseCode >= 400
    && provider.responseCode < 600;
}

function classifyEnvelopeRejection(
  provider: ProviderError
): MailDeliveryFailureCode | undefined {
  if (provider.code !== "EENVELOPE" || !hasSmtpFailureResponse(provider)) {
    return undefined;
  }
  if (provider.command === "MAIL FROM") return "SMTP_SENDER_REJECTED";
  if (provider.command === "RCPT TO") return "SMTP_RECIPIENT_REJECTED";
  return undefined;
}

function classifyFailure(error: unknown): MailDeliveryFailureCode {
  if (error instanceof MailDeliveryError) return error.failureCode;
  const provider = error instanceof Error ? error as ProviderError : undefined;
  switch (provider?.code) {
    case "EAUTH":
      return "SMTP_AUTH_FAILED";
    case "ETLS":
    case "EREQUIRETLS":
      return "SMTP_TLS_FAILED";
    case "EDNS":
    case "ECONNECTION":
    case "ESOCKET":
    case "ETIMEDOUT":
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "SMTP_CONNECTION_FAILED";
  }

  if (!provider) return "SMTP_DELIVERY_FAILED";

  const envelopeRejection = classifyEnvelopeRejection(provider);
  if (envelopeRejection) return envelopeRejection;

  if (hasSmtpFailureResponse(provider)) {
    if (provider.responseCode >= 500) return "SMTP_REJECTED";
    return "SMTP_TEMPORARY_FAILURE";
  }

  if (provider.code === "EMESSAGE" || provider.code === "ESTREAM") {
    return "SMTP_MESSAGE_FAILED";
  }

  return "SMTP_DELIVERY_FAILED";
}

export function safeMailDeliveryError(error: unknown): MailDeliveryError {
  return error instanceof MailDeliveryError
    ? error
    : new MailDeliveryError(classifyFailure(error));
}

export function escapeMailHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]!);
}

export function parseMailbox(value: string): { name: string; address: string } {
  const parsed = addressparser(value);
  const entry = parsed.length === 1 && "address" in parsed[0]! ? parsed[0] : undefined;
  if (!entry?.address) throw new Error("SMTP sender mailbox is invalid.");
  return { name: entry.name, address: entry.address };
}

export function createIsolatedSmtpTransport(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): Transport<SafeSentInfo> {
  return {
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
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        dnsTimeout: SMTP_CONNECTION_TIMEOUT_MS,
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
          callback(safeMailDeliveryError(error), { messageId: "" });
          return;
        }
        callback(null, info ?? { messageId: mail.message.messageId() });
      };

      timer = setTimeout(() => {
        finish(new MailDeliveryError("SMTP_TIMEOUT"));
      }, config.deliveryTimeoutMs);
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
          finish(new MailDeliveryError("SMTP_AUTH_FAILED"));
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
}
