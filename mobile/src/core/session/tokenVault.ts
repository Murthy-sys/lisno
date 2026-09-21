import * as SecureStore from "expo-secure-store";

const TOKEN_KEY_PREFIX = "lisno.auth.token.v2";
const LEGACY_TOKEN_KEY = "lisno.auth.token.v1";

export function credentialKeyForEnvironment(environmentId: string): string {
  if (!environmentId.trim()) throw new Error("An environment identity is required.");
  let encodedIdentity = "";
  for (let index = 0; index < environmentId.length; index += 1) {
    encodedIdentity += environmentId
      .charCodeAt(index)
      .toString(16)
      .padStart(4, "0");
  }
  return `${TOKEN_KEY_PREFIX}.${encodedIdentity}`;
}

export interface SecureTokenStorage {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface GenerationFence {
  readonly generation: number;
  readonly isCurrent: (generation: number) => boolean;
}

export class SecureTokenStorageUnavailableError extends Error {
  readonly code = "SECURE_TOKEN_STORAGE_UNAVAILABLE";

  constructor() {
    super("Secure credential storage is unavailable on this device.");
    this.name = "SecureTokenStorageUnavailableError";
  }
}

export class SupersededCredentialOperationError extends Error {
  readonly code = "SUPERSEDED_CREDENTIAL_OPERATION";

  constructor() {
    super("The credential operation was superseded by a newer session.");
    this.name = "SupersededCredentialOperationError";
  }
}

export class TokenVault {
  private tail: Promise<void> = Promise.resolve();
  private readonly tokenKey: string;

  constructor(
    environmentId: string,
    private readonly storage: SecureTokenStorage = SecureStore
  ) {
    this.tokenKey = credentialKeyForEnvironment(environmentId);
  }

  read(fence: GenerationFence): Promise<string | null> {
    return this.enqueue(async () => {
      this.assertCurrent(fence);
      await this.assertAvailable();
      await this.deleteLegacyCredential();
      this.assertCurrent(fence);
      const token = await this.storage.getItemAsync(this.tokenKey);
      this.assertCurrent(fence);
      return token?.trim() ? token : null;
    });
  }

  write(token: string, fence: GenerationFence): Promise<void> {
    if (!token.trim()) return Promise.reject(new Error("A token is required."));
    return this.enqueue(async () => {
      this.assertCurrent(fence);
      await this.assertAvailable();
      await this.deleteLegacyCredential();
      this.assertCurrent(fence);
      await this.storage.setItemAsync(this.tokenKey, token);
      if (!fence.isCurrent(fence.generation)) {
        await this.storage.deleteItemAsync(this.tokenKey);
        throw new SupersededCredentialOperationError();
      }
    });
  }

  clear(fence: GenerationFence): Promise<void> {
    return this.enqueue(async () => {
      this.assertCurrent(fence);
      await this.assertAvailable();
      await this.storage.deleteItemAsync(this.tokenKey);
      await this.deleteLegacyCredential();
      this.assertCurrent(fence);
    });
  }

  private async assertAvailable(): Promise<void> {
    if (!(await this.storage.isAvailableAsync())) {
      throw new SecureTokenStorageUnavailableError();
    }
  }

  private deleteLegacyCredential(): Promise<void> {
    return this.storage.deleteItemAsync(LEGACY_TOKEN_KEY);
  }

  private assertCurrent(fence: GenerationFence): void {
    if (!fence.isCurrent(fence.generation)) {
      throw new SupersededCredentialOperationError();
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
