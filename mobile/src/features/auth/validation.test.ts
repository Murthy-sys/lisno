import { loginSchema, newPasswordSchema } from "./validation";

describe("authentication validation", () => {
  it("normalizes a valid sign-in email without weakening passwords", () => {
    expect(loginSchema.parse({ email: "  user@example.com ", password: "secret" })).toEqual({
      email: "user@example.com",
      password: "secret"
    });
  });

  it("requires long matching replacement passwords", () => {
    expect(newPasswordSchema.safeParse({ password: "too-short", passwordConfirmation: "too-short" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a secure passphrase", passwordConfirmation: "different pass" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a secure passphrase", passwordConfirmation: "a secure passphrase" }).success).toBe(true);
  });
});

it.each(["a".repeat(72), "é".repeat(36), "🙂".repeat(18), "\ud800".repeat(24)])("accepts new passwords at the UTF-8 byte limit %j", password => {
  expect(newPasswordSchema.safeParse({ password, passwordConfirmation: password }).success).toBe(true);
});
it.each(["a".repeat(73), "é".repeat(37), "🙂".repeat(19), "\ud800".repeat(25)])("rejects new passwords above the UTF-8 byte limit %j", password => {
  const result = newPasswordSchema.safeParse({ password, passwordConfirmation: password });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0]?.message).toContain("72 UTF-8 bytes");
});
it("keeps existing long and short login passwords unchanged", () => {
  for (const password of ["legacy", "é".repeat(90)]) {
    expect(loginSchema.parse({ email: "user@example.com", password }).password).toBe(password);
  }
});
