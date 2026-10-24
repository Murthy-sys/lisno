import { newPasswordSchema } from "../domain/password-policy.js";
import { ApiError } from "../middleware/errors.js";

export function requireValidNewPassword(password: string): void {
  const result = newPasswordSchema.safeParse(password);
  if (!result.success) {
    const message = result.error.issues[0]!.message;
    throw new ApiError(400, "VALIDATION_ERROR", message, { password: message });
  }
}
