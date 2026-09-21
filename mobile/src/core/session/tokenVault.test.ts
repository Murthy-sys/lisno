import {
  credentialKeyForEnvironment,
  SupersededCredentialOperationError,
  TokenVault,
  type SecureTokenStorage
} from "./tokenVault";

describe("TokenVault", () => {
  const legacyKey = "lisno.auth.token.v1";

  it("creates reversible, SecureStore-safe keys without collapsing identities", () => {
    const remote = credentialKeyForEnvironment(
      "remote:https://api.example.test/api/v1"
    );
    const local = credentialKeyForEnvironment(
      "local:http://10.0.2.2:3000/api/v1"
    );
    const unicodeA = credentialKeyForEnvironment("remote:https://example.test/😀");
    const unicodeB = credentialKeyForEnvironment("remote:https://example.test/😁");

    expect(remote).not.toBe(local);
    expect(unicodeA).not.toBe(unicodeB);
    expect([remote, local, unicodeA, unicodeB]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[A-Za-z0-9._-]+$/u),
        expect.stringMatching(/^[A-Za-z0-9._-]+$/u),
        expect.stringMatching(/^[A-Za-z0-9._-]+$/u),
        expect.stringMatching(/^[A-Za-z0-9._-]+$/u)
      ])
    );
  });

  it("isolates Remote and Local credentials, including clear operations", async () => {
    const values = new Map<string, string>();
    const keys: string[] = [];
    const storage: SecureTokenStorage = {
      async isAvailableAsync() {
        return true;
      },
      async getItemAsync(key) {
        keys.push(key);
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        keys.push(key);
        values.set(key, value);
      },
      async deleteItemAsync(key) {
        keys.push(key);
        values.delete(key);
      }
    };
    const remote = new TokenVault(
      "remote:https://api.example.test/api/v1",
      storage
    );
    const local = new TokenVault(
      "local:http://10.0.2.2:3000/api/v1",
      storage
    );
    const fence = { generation: 1, isCurrent: () => true };

    await remote.write("remote-token", fence);
    await local.write("local-token", fence);
    await remote.clear(fence);

    await expect(remote.read(fence)).resolves.toBeNull();
    await expect(local.read(fence)).resolves.toBe("local-token");
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => /^[A-Za-z0-9._-]+$/u.test(key))).toBe(true);
  });

  it("deletes but never reads or migrates the legacy unscoped credential", async () => {
    const environmentId = "remote:https://api.example.test/api/v1";
    const scopedKey = credentialKeyForEnvironment(environmentId);
    const values = new Map<string, string>([[legacyKey, "legacy-token"]]);
    const reads: string[] = [];
    const storage: SecureTokenStorage = {
      async isAvailableAsync() {
        return true;
      },
      async getItemAsync(key) {
        reads.push(key);
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        values.set(key, value);
      },
      async deleteItemAsync(key) {
        values.delete(key);
      }
    };
    const vault = new TokenVault(environmentId, storage);
    const fence = { generation: 1, isCurrent: () => true };

    await expect(vault.read(fence)).resolves.toBeNull();
    expect(reads).toEqual([scopedKey]);
    expect(values.has(legacyKey)).toBe(false);
    expect(values.has(scopedKey)).toBe(false);
  });

  it("clears its scoped credential and shared legacy residue without clearing another environment", async () => {
    const remoteId = "remote:https://api.example.test/api/v1";
    const localId = "local:http://10.0.2.2:3000/api/v1";
    const remoteKey = credentialKeyForEnvironment(remoteId);
    const localKey = credentialKeyForEnvironment(localId);
    const values = new Map<string, string>([
      [legacyKey, "legacy-token"],
      [remoteKey, "remote-token"],
      [localKey, "local-token"]
    ]);
    const storage: SecureTokenStorage = {
      async isAvailableAsync() {
        return true;
      },
      async getItemAsync(key) {
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        values.set(key, value);
      },
      async deleteItemAsync(key) {
        values.delete(key);
      }
    };
    const fence = { generation: 1, isCurrent: () => true };

    await new TokenVault(remoteId, storage).clear(fence);

    expect(values.has(legacyKey)).toBe(false);
    expect(values.has(remoteKey)).toBe(false);
    expect(values.get(localKey)).toBe("local-token");
  });

  it("serializes writes so a stale secure-store completion cannot erase a newer token", async () => {
    let releaseFirst!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => (releaseFirst = resolve));
    let markFirstStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => (markFirstStarted = resolve));
    let first = true;
    let stored: string | null = null;
    const storage: SecureTokenStorage = {
      async isAvailableAsync() {
        return true;
      },
      async getItemAsync() {
        return stored;
      },
      async setItemAsync(_key, value) {
        if (first) {
          first = false;
          markFirstStarted();
          await firstWriteGate;
        }
        stored = value;
      },
      async deleteItemAsync() {
        stored = null;
      }
    };
    const vault = new TokenVault("remote:https://api.example.test/api/v1", storage);
    let generation = 1;

    const oldWrite = vault.write("old-token", {
      generation: 1,
      isCurrent: (candidate) => candidate === generation
    });
    await firstWriteStarted;
    generation = 2;
    const newWrite = vault.write("new-token", {
      generation: 2,
      isCurrent: (candidate) => candidate === generation
    });
    releaseFirst();

    await expect(oldWrite).rejects.toBeInstanceOf(
      SupersededCredentialOperationError
    );
    await expect(newWrite).resolves.toBeUndefined();
    expect(stored).toBe("new-token");
  });

  it("fails explicitly when secure credential storage is unavailable", async () => {
    const vault = new TokenVault("remote:https://api.example.test/api/v1", {
      async isAvailableAsync() {
        return false;
      },
      async getItemAsync() {
        return null;
      },
      async setItemAsync() {},
      async deleteItemAsync() {}
    });

    await expect(
      vault.read({ generation: 1, isCurrent: () => true })
    ).rejects.toMatchObject({ code: "SECURE_TOKEN_STORAGE_UNAVAILABLE" });
  });
});
