import {
  Router,
  type NextFunction,
  type Request,
  type Response
} from "express";
import swaggerUi from "swagger-ui-express";
import type { SwaggerUiOptions } from "swagger-ui-express";

import { openApiDocument } from "../openapi.js";

export const apiDocsRouter = Router();

const swaggerAssetPaths = new Set([
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/swagger-ui-bundle.js",
  "/swagger-ui-standalone-preset.js",
  "/swagger-ui.css",
  "/swagger-ui-init.js"
]);

const swaggerPageOptions: SwaggerUiOptions & { customRobots: string } = {
  customSiteTitle: "Lisno API documentation",
  customRobots: "noindex, nofollow",
  swaggerOptions: {
    url: "/openapi.json",
    validatorUrl: null,
    persistAuthorization: false,
    displayRequestDuration: true,
    filter: true
  }
};

const swaggerPage = swaggerUi.setup(undefined, swaggerPageOptions);

apiDocsRouter.get(
  "/openapi.json",
  openApiHeaders,
  (_request, response) => {
    response.status(200).json(openApiDocument);
  }
);

apiDocsRouter.use(
  "/api-docs",
  swaggerUiHeaders,
  allowDocumentationMethod,
  allowDocumentationPath,
  swaggerUi.serve
);

apiDocsRouter.get(["/api-docs", "/api-docs/"], swaggerPage);

apiDocsRouter.use(
  "/api-docs",
  (_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested documentation asset was not found."
      }
    });
  }
);

function openApiHeaders(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

function swaggerUiHeaders(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  response.setHeader(
    "Cache-Control",
    isCacheableSwaggerAsset(_request.path)
      ? "public, max-age=86400"
      : "no-store"
  );
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

function allowDocumentationMethod(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (request.method === "GET" || request.method === "HEAD") {
    next();
    return;
  }
  response.setHeader("Allow", "GET, HEAD");
  response.status(405).json({
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "API documentation is read-only."
    }
  });
}

function allowDocumentationPath(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (request.path === "/" || swaggerAssetPaths.has(request.path)) {
    next();
    return;
  }
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested documentation asset was not found."
    }
  });
}

function isCacheableSwaggerAsset(path: string): boolean {
  return swaggerAssetPaths.has(path) && path !== "/swagger-ui-init.js";
}
