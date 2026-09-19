import type { ResolvedEnvironment } from "./environment";

export type CleanupReason = "logout" | "access_denied";

export interface CleanupContext {
  readonly reason: CleanupReason;
  readonly generation: number;
  readonly fromEnvironment: ResolvedEnvironment;
}

export type CleanupHandler = (context: CleanupContext) => void | Promise<void>;

interface RegisteredCleanup {
  readonly name: string;
  readonly priority: number;
  readonly handler: CleanupHandler;
}

export class CleanupFailureError extends Error {
  readonly code = "CLEANUP_FAILED";

  constructor(readonly failures: readonly { name: string; error: unknown }[]) {
    super("Private application state could not be cleared safely.");
    this.name = "CleanupFailureError";
  }
}

export class CleanupRegistry {
  private readonly entries = new Map<string, RegisteredCleanup>();

  register(
    name: string,
    handler: CleanupHandler,
    priority = 100
  ): () => void {
    if (!name.trim()) throw new Error("Cleanup handlers require a name.");
    if (this.entries.has(name)) {
      throw new Error(`Cleanup handler \"${name}\" is already registered.`);
    }

    const entry = { name, priority, handler };
    this.entries.set(name, entry);
    return () => {
      if (this.entries.get(name) === entry) this.entries.delete(name);
    };
  }

  async run(context: CleanupContext): Promise<void> {
    const failures: { name: string; error: unknown }[] = [];
    const ordered = [...this.entries.values()].sort(
      (left, right) => left.priority - right.priority
    );

    for (const entry of ordered) {
      try {
        await entry.handler(context);
      } catch (error) {
        failures.push({ name: entry.name, error });
      }
    }

    if (failures.length > 0) {
      throw new CleanupFailureError(Object.freeze(failures));
    }
  }
}

export const cleanupRegistry = new CleanupRegistry();
