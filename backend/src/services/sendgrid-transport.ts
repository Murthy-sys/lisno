import sendGridMail from "@sendgrid/mail";
import addressparser from "nodemailer/lib/addressparser/index.js";

import {
  MailDeliveryError,
  type MailDeliveryConfig as ExistingMailDeliveryConfig
} from "./smtp-transport.js";

export type MailDeliveryConfig =
  | ExistingMailDeliveryConfig
  | {
      kind: "sendgrid_web_api";
      publicFrontendUrl: string;
      apiKey: string;
      from: string;
      deliveryTimeoutMs: number;
    };

const SENDGRID_FAILURE_CODES = [
  "SENDGRID_AUTH_FAILED",
  "SENDGRID_FORBIDDEN",
  "SENDGRID_RATE_LIMITED",
  "SENDGRID_REQUEST_REJECTED",
  "SENDGRID_UNAVAILABLE",
  "SENDGRID_TIMEOUT",
  "SENDGRID_CONNECTION_FAILED",
  "SENDGRID_DELIVERY_FAILED"
] as const;

export type SendGridFailureCode = (typeof SENDGRID_FAILURE_CODES)[number];

export interface SendGridMailbox {
  name?: string;
  email: string;
}

export interface SendGridAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  contentId?: string;
}

export interface SendGridMessage {
  to: SendGridMailbox | SendGridMailbox[];
  from: SendGridMailbox;
  subject: string;
  text: string;
  html: string;
  attachments?: SendGridAttachment[];
}

interface SendGridSdkResponse {
  statusCode: number;
}

export interface SendGridSdk {
  setApiKey(apiKey: string): void;
  setTimeout(timeoutMs: number): void;
  send(message: SendGridMessage): Promise<[SendGridSdkResponse, unknown]>;
}

export interface SendGridTransport {
  send(message: SendGridMessage): Promise<void>;
}

const SENDGRID_CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "EPIPE",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);
const SENDGRID_TIMEOUT_ERROR_CODES = new Set(["ECONNABORTED", "ETIMEDOUT"]);

class SendGridStatusError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super("SendGrid delivery failed.");
    this.statusCode = statusCode;
  }
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return undefined;
  }
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function structuredStatusCode(error: unknown): number | undefined {
  const directCode = readProperty(error, "code");
  if (typeof directCode === "number" && Number.isInteger(directCode)) {
    return directCode;
  }
  const directStatus = readProperty(error, "statusCode");
  if (typeof directStatus === "number" && Number.isInteger(directStatus)) {
    return directStatus;
  }
  const response = readProperty(error, "response");
  const responseStatus = readProperty(response, "statusCode");
  if (typeof responseStatus === "number" && Number.isInteger(responseStatus)) {
    return responseStatus;
  }
  return undefined;
}

function classifyStatus(statusCode: number): SendGridFailureCode {
  if (statusCode === 401) return "SENDGRID_AUTH_FAILED";
  if (statusCode === 403) return "SENDGRID_FORBIDDEN";
  if (statusCode === 429) return "SENDGRID_RATE_LIMITED";
  if (statusCode >= 400 && statusCode < 500) {
    return "SENDGRID_REQUEST_REJECTED";
  }
  if (statusCode >= 500 && statusCode < 600) return "SENDGRID_UNAVAILABLE";
  return "SENDGRID_DELIVERY_FAILED";
}

function classifySendGridFailure(error: unknown): SendGridFailureCode {
  if (
    error instanceof MailDeliveryError &&
    (SENDGRID_FAILURE_CODES as readonly string[]).includes(error.failureCode)
  ) {
    return error.failureCode as SendGridFailureCode;
  }

  const statusCode = structuredStatusCode(error);
  if (statusCode !== undefined) return classifyStatus(statusCode);

  const code = readProperty(error, "code");
  if (typeof code === "string" && SENDGRID_TIMEOUT_ERROR_CODES.has(code)) {
    return "SENDGRID_TIMEOUT";
  }
  if (typeof code === "string" && SENDGRID_CONNECTION_ERROR_CODES.has(code)) {
    return "SENDGRID_CONNECTION_FAILED";
  }
  return "SENDGRID_DELIVERY_FAILED";
}

export function safeSendGridDeliveryError(error: unknown): MailDeliveryError {
  if (
    error instanceof MailDeliveryError &&
    (SENDGRID_FAILURE_CODES as readonly string[]).includes(error.failureCode)
  ) {
    return error;
  }
  return new MailDeliveryError(classifySendGridFailure(error));
}

export function parseSendGridMailbox(value: string): SendGridMailbox {
  const parsed = addressparser(value);
  const entry = parsed.length === 1 && "address" in parsed[0]! ? parsed[0] : undefined;
  if (!entry?.address) throw new Error("SendGrid sender mailbox is invalid.");
  return { name: entry.name || undefined, email: entry.address };
}

function createOfficialSdk(): SendGridSdk {
  const MailService = (sendGridMail as unknown as {
    MailService: new () => SendGridSdk;
  }).MailService;
  return new MailService();
}

function withDeliveryTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new MailDeliveryError("SENDGRID_TIMEOUT"));
    }, timeoutMs);
    timer.unref?.();

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function createIsolatedSendGridTransport(
  config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>,
  sdk: SendGridSdk = createOfficialSdk()
): SendGridTransport {
  try {
    sdk.setApiKey(config.apiKey);
    sdk.setTimeout(config.deliveryTimeoutMs);
  } catch (error) {
    throw safeSendGridDeliveryError(error);
  }

  return {
    async send(message) {
      try {
        const [response] = await withDeliveryTimeout(
          sdk.send(message),
          config.deliveryTimeoutMs
        );
        if (response.statusCode !== 202) {
          throw new SendGridStatusError(response.statusCode);
        }
      } catch (error) {
        throw safeSendGridDeliveryError(error);
      }
    }
  };
}
