declare module "nodemailer/lib/smtp-connection/index.js" {
  import { EventEmitter } from "node:events";
  import type { Readable } from "node:stream";

  interface SmtpConnectionOptions {
    host: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    ignoreTLS: boolean;
    logger: false;
    debug: false;
    connectionTimeout: number;
    greetingTimeout: number;
    socketTimeout: number;
    dnsTimeout: number;
    tls: { rejectUnauthorized: true };
  }

  interface SmtpEnvelope {
    from: string | false;
    to: string[];
  }

  interface SmtpSendInfo {
    response?: string;
  }

  export default class SMTPConnection extends EventEmitter {
    constructor(options: SmtpConnectionOptions);
    readonly allowsAuth: boolean;
    connect(callback: (error?: Error | null) => void): void;
    login(
      auth: { user: string; pass: string },
      callback: (error?: Error | null) => void
    ): void;
    send(
      envelope: SmtpEnvelope,
      message: Readable,
      callback: (error?: Error | null, info?: SmtpSendInfo) => void
    ): void;
    close(): void;
  }
}
