import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuthService, InvalidTokenError } from "../src/services/auth.service.js";

const password = "SessionRegressionPassword!";
const context = { remoteAddress: "127.0.0.1" };

describe("account-change session revocation", () => {
  it.each(["active", "role"] as const)("does not revive old sessions after a %s round trip", async field => {
    const seed = structuredClone(demoSeedData);
    const user = { ...seed.users[0]!, id: "session-user", email: "session@example.test", emailNormalized: "session@example.test", role: "admin" as const, active: true, accountKind: "standard" as const, version: 1, sessionVersion: 1, passwordHash: await bcrypt.hash(password, 4) };
    seed.users = [user];
    const repository = createMemoryRepository(seed);
    const auth = createAuthService(repository, { jwtSecret: "session-revocation-test-secret-at-least-32-characters", jwtExpiresInSeconds: 900 });
    const old = await auth.login(user.email, password, context);
    const first = await repository.updateUser(user.id, 1, { ...(field === "active" ? { active: false } : { role: "designer" }), updatedAt: new Date().toISOString() });
    expect(first.sessionVersion).toBe(2);
    await expect(auth.authenticate(old.token, context)).rejects.toBeInstanceOf(InvalidTokenError);
    const second = await repository.updateUser(user.id, 2, { active: true, role: "admin", updatedAt: new Date().toISOString() });
    expect(second.sessionVersion).toBe(3);
    await expect(auth.authenticate(old.token, context)).rejects.toBeInstanceOf(InvalidTokenError);
    const fresh = await auth.login(user.email, password, context);
    await expect(auth.authenticate(fresh.token, context)).resolves.toMatchObject({ id: user.id });
    const noOp = await repository.updateUser(user.id, 3, { active: true, role: "admin", updatedAt: new Date().toISOString() });
    expect(noOp).toMatchObject({ version: 4, sessionVersion: 3 });
    await expect(auth.authenticate(fresh.token, context)).resolves.toMatchObject({ id: user.id });
  });

  it("keeps existing long-password login compatible", async () => {
    const seed = structuredClone(demoSeedData);
    const longPassword = "L".repeat(80);
    seed.users = [{ ...seed.users[0]!, id: "legacy-password", email: "legacy@example.test", emailNormalized: "legacy@example.test", accountKind: "standard", passwordHash: await bcrypt.hash(longPassword, 4) }];
    const auth = createAuthService(createMemoryRepository(seed), { jwtSecret: "legacy-login-test-secret-at-least-32-characters", jwtExpiresInSeconds: 900 });
    await expect(auth.login("legacy@example.test", longPassword, context)).resolves.toHaveProperty("token");
  });
});
