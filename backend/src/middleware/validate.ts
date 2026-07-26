import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { ApiError } from "./errors.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        if (issue.code === "unrecognized_keys") {
          for (const key of issue.keys) {
            if (!fields[key]) fields[key] = `Unrecognized field: ${key}.`;
          }
          continue;
        }
        const field = issue.path.join(".");
        if (field && !fields[field]) fields[field] = issue.message;
      }
      next(
        new ApiError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
          fields
        )
      );
      return;
    }

    request.body = result.data;
    next();
  };
}
