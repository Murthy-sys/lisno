import { z } from "zod";

const environmentSchema = z.object({
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
  OCR_WORKER_TOKEN: z.string().min(32)
}).superRefine((environment, context) => {
  if (environment.OCR_RETRY_MAX_SECONDS < environment.OCR_RETRY_INITIAL_SECONDS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OCR_RETRY_MAX_SECONDS"],
      message: "OCR_RETRY_MAX_SECONDS must be at least OCR_RETRY_INITIAL_SECONDS."
    });
  }
});

export const loadEnvironment = (
  input: Record<string, string | undefined> = process.env
) => environmentSchema.parse(input);
