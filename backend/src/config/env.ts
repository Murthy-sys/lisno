import addressparser from "nodemailer/lib/addressparser/index.js";
import { z } from "zod";

export type InvitationDeliveryConfig =
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
    };

const SMTP_KEYS = [
  "PUBLIC_FRONTEND_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_TLS_MODE",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "SMTP_FROM"
] as const;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

function isSingleMailbox(value: string): boolean {
  if (CONTROL_CHARACTERS.test(value)) return false;
  const parsed = addressparser(value);
  if (parsed.length !== 1 || !("address" in parsed[0]!)) return false;
  return z.string().email().safeParse(parsed[0].address).success;
}

const environmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z
    .string()
    .default("mongodb://127.0.0.1:27017/lisno?replicaSet=rs0"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().url()).min(1)),
  UPLOADS_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  OCR_LEASE_SECONDS: z.coerce.number().int().positive().default(300),
  OCR_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OCR_RETRY_INITIAL_SECONDS: z.coerce.number().positive().default(30),
  OCR_RETRY_MAX_SECONDS: z.coerce.number().positive().default(900),
  OCR_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(0.2),
  OCR_WORKER_TOKEN: z.string().min(32),
  PUBLIC_FRONTEND_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_TLS_MODE: z.string().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_TLS_REJECT_UNAUTHORIZED: z.string().optional()
}).superRefine((environment, context) => {
  if (environment.OCR_RETRY_MAX_SECONDS < environment.OCR_RETRY_INITIAL_SECONDS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OCR_RETRY_MAX_SECONDS"],
      message: "OCR_RETRY_MAX_SECONDS must be at least OCR_RETRY_INITIAL_SECONDS."
    });
  }
  const supplied = SMTP_KEYS.filter((key) => environment[key] !== undefined);
  if (supplied.length > 0 && supplied.length !== SMTP_KEYS.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_HOST"],
      message: "Invitation delivery configuration must be supplied as one complete group."
    });
    return;
  }
  if (supplied.length === 0) {
    if (
      environment.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined &&
      environment.SMTP_TLS_REJECT_UNAUTHORIZED !== "true"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_TLS_REJECT_UNAUTHORIZED"],
        message: "SMTP certificate verification cannot be disabled."
      });
    }
    return;
  }

  if (!isHttpsOrigin(environment.PUBLIC_FRONTEND_URL!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["PUBLIC_FRONTEND_URL"], message: "PUBLIC_FRONTEND_URL must be an HTTPS origin." });
  }
  if (
    !environment.SMTP_HOST!.trim() ||
    environment.SMTP_HOST !== environment.SMTP_HOST!.trim() ||
    CONTROL_CHARACTERS.test(environment.SMTP_HOST!) ||
    /\s/u.test(environment.SMTP_HOST!)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_HOST"], message: "SMTP_HOST is invalid." });
  }
  const port = Number(environment.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_PORT"], message: "SMTP_PORT is invalid." });
  }
  if (environment.SMTP_TLS_MODE !== "implicit" && environment.SMTP_TLS_MODE !== "starttls") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_TLS_MODE"], message: "SMTP_TLS_MODE is invalid." });
  }
  for (const key of ["SMTP_USERNAME", "SMTP_PASSWORD"] as const) {
    if (!environment[key]?.trim() || CONTROL_CHARACTERS.test(environment[key]!)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is invalid.` });
    }
  }
  if (!isSingleMailbox(environment.SMTP_FROM!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_FROM"], message: "SMTP_FROM must contain one valid mailbox." });
  }
  if (
    environment.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined &&
    environment.SMTP_TLS_REJECT_UNAUTHORIZED !== "true"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_TLS_REJECT_UNAUTHORIZED"],
      message: "SMTP certificate verification cannot be disabled."
    });
  }
}).transform((environment) => {
  const {
    PUBLIC_FRONTEND_URL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_TLS_MODE,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_FROM,
    SMTP_TLS_REJECT_UNAUTHORIZED: _tlsVerification,
    ...base
  } = environment;
  const invitationDelivery: InvitationDeliveryConfig = SMTP_HOST === undefined
    ? { kind: "disabled" }
    : {
        kind: "smtp",
        publicFrontendUrl: new URL(PUBLIC_FRONTEND_URL!).origin,
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        tlsMode: SMTP_TLS_MODE as "implicit" | "starttls",
        username: SMTP_USERNAME!,
        password: SMTP_PASSWORD!,
        from: SMTP_FROM!.trim()
      };
  return { ...base, invitationDelivery };
});

export type LoadedEnvironment = z.infer<typeof environmentSchema>;

export const loadEnvironment = (
  input: Record<string, string | undefined> = process.env
) => environmentSchema.parse(input);
