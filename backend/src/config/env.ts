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
  OCR_WORKER_TOKEN: z.string().min(32)
});

export const loadEnvironment = (
  input: Record<string, string | undefined> = process.env
) => environmentSchema.parse(input);
