import type { ErrorRequestHandler, RequestHandler } from "express";

import type { ApiErrorResponse } from "../contracts/http.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: ApiErrorHeaders
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorHeaders {
  readonly "Retry-After"?: string;
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const apiError =
    error instanceof ApiError
      ? error
      : isBodyParserSyntaxError(error)
        ? new ApiError(
            400,
            "INVALID_JSON",
            "Request body must contain valid JSON."
          )
      : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  const body: ApiErrorResponse = {
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fields ? { fields: apiError.fields } : {})
    }
  };

  const retryAfter = apiError.headers?.["Retry-After"];
  if (retryAfter && /^(?:0|[1-9]\d*)$/u.test(retryAfter)) {
    response.setHeader("Retry-After", retryAfter);
  }
  response.status(apiError.status).json(body);
};

function isBodyParserSyntaxError(
  error: unknown
): error is SyntaxError & { status: 400; type: "entity.parse.failed" } {
  if (!(error instanceof SyntaxError)) return false;
  const candidate = error as SyntaxError & { status?: unknown; type?: unknown };
  return candidate.status === 400 && candidate.type === "entity.parse.failed";
}
