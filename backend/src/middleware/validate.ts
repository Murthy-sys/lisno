import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { ApiError } from "./errors.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(
        new ApiError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
          validationFields(result.error.issues)
        )
      );
      return;
    }

    request.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      next(
        new ApiError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
          validationFields(result.error.issues)
        )
      );
      return;
    }
    response.locals.validatedQuery = result.data;
    next();
  };
}

function validationFields(
  issues: Array<{
    code: string;
    path: PropertyKey[];
    message: string;
    keys?: string[];
  }>
) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys ?? []) {
        if (!fields[key]) fields[key] = `Unrecognized field: ${key}.`;
      }
      continue;
    }
    const field = issue.path.map(String).join(".");
    if (field && !fields[field]) fields[field] = issue.message;
  }
  return fields;
}
