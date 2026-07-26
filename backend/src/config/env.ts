import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z
    .string()
    .default("mongodb://127.0.0.1:27017/lisno?replicaSet=rs0"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  UPLOADS_DIR: z.string().default("uploads")
});

export const loadEnvironment = (
  input: Record<string, string | undefined> = process.env
) => environmentSchema.parse(input);
