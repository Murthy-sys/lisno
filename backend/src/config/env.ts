import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/lisno"),
  JWT_SECRET: z.string().min(1).default("development-only-secret"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  UPLOADS_DIR: z.string().default("uploads")
});

export const env = environmentSchema.parse(process.env);
