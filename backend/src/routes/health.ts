import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_request, response) => {
  response.status(200).json({ data: { status: "ok" } });
});
