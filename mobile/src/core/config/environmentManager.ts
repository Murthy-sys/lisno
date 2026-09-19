import type { ResolvedEnvironment } from "./environment";

export interface EnvironmentSnapshot {
  readonly environment: ResolvedEnvironment;
  readonly generation: number;
  readonly status: "ready";
}

export class EnvironmentManager {
  private readonly snapshot: EnvironmentSnapshot;
  private readonly listeners = new Set<(snapshot: EnvironmentSnapshot) => void>();

  constructor(environment: ResolvedEnvironment) {
    this.snapshot = Object.freeze({
      environment,
      generation: 0,
      status: "ready"
    });
  }

  getSnapshot = (): EnvironmentSnapshot => this.snapshot;

  subscribe(listener: (snapshot: EnvironmentSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
