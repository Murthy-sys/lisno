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

export class MailDeliveryError extends Error {
  constructor(readonly failureCode: string) {
    super("Mail delivery failed.");
  }
}

interface SafeSentInfo {
  messageId: string;
}

type ProviderError = Error & {
  code?: unknown;
  responseCode?: unknown;
};

const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;

function classifyFailure(error: unknown): string {
  if (error instanceof MailDeliveryError) return error.failureCode;
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
