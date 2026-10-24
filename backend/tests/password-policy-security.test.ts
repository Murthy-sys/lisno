import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { newPasswordSchema } from "../src/domain/password-policy.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createPasswordResetsRouter } from "../src/routes/password-resets.js";
import { createProjectClientInvitationsRouter } from "../src/routes/project-client-invitations.js";
import { createUserInvitationsRouter } from "../src/routes/user-invitations.js";

describe("new password byte boundary", () => {
  it.each(["a".repeat(72), "é".repeat(36), "😀".repeat(18)])("accepts the full bcrypt boundary without truncation", password => {
    expect(Buffer.byteLength(password, "utf8")).toBe(72);
    expect(newPasswordSchema.safeParse(password).success).toBe(true);
  });

  it.each(["a".repeat(73), "é".repeat(37), "😀".repeat(19), "short"])("rejects invalid credentials before any public service runs", async password => {
    const complete = vi.fn(), accept = vi.fn(), acceptNew = vi.fn();
    const app = express();
    const pass = (_request: unknown, _response: unknown, next: () => void) => next();
    app.use(express.json());
    app.use(createPasswordResetsRouter({ complete } as never));
    app.use(createUserInvitationsRouter({} as never, { accept } as never, pass));
    app.use(createProjectClientInvitationsRouter({} as never, { acceptNew } as never, pass, pass));
    app.use(errorHandler);
    for (const path of ["/auth/password-reset/complete", "/auth/user-invitations/accept", "/auth/project-invitations/accept"]) {
      const result = await request(app).post(path).send({ token: "unused", password, passwordConfirmation: password }).expect(400);
      expect(result.body.error.fields.password).toBeTypeOf("string");
      expect(JSON.stringify(result.body)).not.toContain(password);
    }
    expect(complete).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(acceptNew).not.toHaveBeenCalled();
  });
});
