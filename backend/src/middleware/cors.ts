import type { RequestHandler } from "express";

const allowedMethods = "GET,HEAD,POST,PUT,PATCH,OPTIONS";
const allowedHeaders = "Authorization,Content-Type";

export function allowCors(origins: readonly string[]): RequestHandler {
  const allowedOrigins = new Set(origins);

  return (request, response, next) => {
    const origin = request.get("Origin");
    if (!origin || !allowedOrigins.has(origin)) {
      next();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", allowedMethods);
    response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    response.setHeader("Vary", "Origin");

    if (
      request.method === "OPTIONS" &&
      request.get("Access-Control-Request-Method")
    ) {
      response.status(204).end();
      return;
    }

    next();
  };
}
