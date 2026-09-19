import type { RequestToken, RequestTokenSource } from "../http/apiClient";

export class SessionTokenState implements RequestTokenSource {
  private value: RequestToken | null = null;

  getRequestToken(): RequestToken | null {
    return this.value;
  }

  setPending(
    token: string,
    environmentId: string,
    sessionGeneration: number,
    userId: string | null = null
  ): void {
    this.value = Object.freeze({
      token,
      environmentId,
      sessionGeneration,
      userId,
      accepted: false
    });
  }

  accept(userId: string, sessionGeneration: number): void {
    if (!this.value || this.value.sessionGeneration !== sessionGeneration) return;
    this.value = Object.freeze({ ...this.value, userId, accepted: true });
  }

  clear(sessionGeneration?: number): void {
    if (
      sessionGeneration !== undefined &&
      this.value?.sessionGeneration !== sessionGeneration
    ) {
      return;
    }
    this.value = null;
  }
}
