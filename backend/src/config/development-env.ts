import { loadEnvironment } from "./env.js";

const LOCAL_JWT_SECRET =
  "local-development-jwt-secret-do-not-use-in-production";
const LOCAL_OCR_WORKER_TOKEN =
  "local-development-ocr-worker-token-do-not-use-in-production";

export const withDevelopmentCredentials = (
  input: Record<string, string | undefined>
): Record<string, string | undefined> => ({
    ...input,
    JWT_SECRET: input.JWT_SECRET ?? LOCAL_JWT_SECRET,
    OCR_WORKER_TOKEN: input.OCR_WORKER_TOKEN ?? LOCAL_OCR_WORKER_TOKEN
  });

export const loadDevelopmentEnvironment = (
  input: Record<string, string | undefined> = process.env
) => loadEnvironment(withDevelopmentCredentials(input));
