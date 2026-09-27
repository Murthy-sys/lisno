import type { AuthenticatedSession } from "../contracts/session";
import { landingDestination, resolveAuthorizedFeature } from "./registry";

export interface NavigationEntry {
  readonly key?: string | undefined;
  readonly name: string;
  readonly params?: object | undefined;
  readonly state?: NavigationTree | undefined;
}

export interface NavigationTree {
  readonly key?: string | undefined;
  readonly index?: number | undefined;
  readonly routes: readonly NavigationEntry[];
}

export interface AppStack {
  readonly key: string;
  readonly index: number;
  readonly routes: readonly NavigationEntry[];
}

export interface AppDestination {
  readonly kind: "feature" | "record" | "more";
  readonly path: string;
  readonly featureId?: string;
}

const appNames = new Set(["index", "feature/[featureId]", "record/[featureId]/[recordId]", "estimate/[estimateId]", "more", "access-denied", "sign-in", "forgot-password", "reset-password", "accept-invitation", "welcome", "startup-recovery"]);
const accountNames = new Set(["forgot-password", "reset-password", "accept-invitation"]);

/** Accept one decoded or percent-encoded path scalar, never a separator or malformed escape. */
export function parseEstimateRouteId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.length > 256 || decoded.trim() !== decoded || decoded === "." || decoded === ".." || decoded.includes("%") || /[\/\\\u0000-\u001f\u007f]/u.test(decoded)) return null;
    encodeURIComponent(decoded);
    return decoded;
  } catch {
    return null;
  }
}

export function readAppStack(state: NavigationTree | undefined): AppStack | null {
  if (!state) return null;
  const index = state.index ?? 0;
  const nested = readAppStack(state.routes[index]?.state);
  if (nested) return nested;
  return state.key && state.routes.some((route) => appNames.has(route.name))
    ? { key: state.key, index, routes: state.routes }
    : null;
}

export function appDestination(entry: NavigationEntry | undefined): AppDestination | null {
  if (!entry) return null;
  if (entry.name === "more") return { kind: "more", path: "/more" };
  const params = entry.params as Record<string, unknown> | undefined;
  if (entry.name === "estimate/[estimateId]") {
    const estimateId = parseEstimateRouteId(params?.estimateId);
    return estimateId ? { kind: "record", featureId: "estimates", path: `/estimate/${encodeURIComponent(estimateId)}` } : null;
  }
  const featureId = params?.featureId;
  if (typeof featureId !== "string" || !/^[a-z-]+$/u.test(featureId)) return null;
  if (entry.name === "feature/[featureId]") return { kind: "feature", featureId, path: `/feature/${featureId}` };
  const recordId = params?.recordId;
  if (entry.name === "record/[featureId]/[recordId]" && typeof recordId === "string" && recordId.length > 0 && !/[\/\\\u0000-\u001f]/u.test(recordId)) {
    return { kind: "record", featureId, path: `/record/${featureId}/${encodeURIComponent(recordId)}` };
  }
  return null;
}

export function destinationAllowed(destination: AppDestination, session: AuthenticatedSession): boolean {
  return destination.kind === "more"
    ? landingDestination(session.user.role, session.authorization) !== null
    : resolveAuthorizedFeature(destination.featureId ?? "", session.user.role, session.authorization) !== null;
}

/** Retains only identities of observed app entries, never arbitrary route parameters. */
export class BackEntryOwnership {
  private initialized = false;
  private fence: string | null = null;
  private readonly entries = new Map<string, string>();
  private readonly excluded = new Set<string>();

  observe(fence: string | null, stack: AppStack | null): void {
    if (this.initialized && this.fence !== fence) {
      this.entries.clear();
      for (const route of stack?.routes ?? []) if (route.key) this.excluded.add(route.key);
    }
    this.initialized = true;
    this.fence = fence;
    if (!stack) return;
    const keys = new Set(stack.routes.map((route) => route.key));
    for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key);
    for (const key of this.excluded) if (!keys.has(key)) this.excluded.delete(key);
    const current = stack.routes[stack.index];
    const destination = appDestination(current);
    if (fence && current?.key && destination && !this.excluded.has(current.key)) {
      this.entries.set(current.key, destination.path);
    }
  }

  owns(entry: NavigationEntry, fence: string | null): boolean {
    const destination = appDestination(entry);
    return Boolean(fence && fence === this.fence && entry.key && destination && this.entries.get(entry.key) === destination.path);
  }
}

export type BackAction =
  | { readonly kind: "none" }
  | { readonly kind: "pop"; readonly count: number }
  | { readonly kind: "replace"; readonly path: string }
  | { readonly kind: "sign-in" };

export function resolveBackAction(stack: AppStack | null, session: AuthenticatedSession | null, fence: string | null, ownership: BackEntryOwnership, explicitParent?: string): BackAction {
  if (!stack) return { kind: "none" };
  const current = stack.routes[stack.index];
  if (!current) return { kind: "none" };
  if (accountNames.has(current.name)) return { kind: "sign-in" };
  if (!session) return current.name === "access-denied" ? { kind: "sign-in" } : { kind: "none" };
  const home = landingDestination(session.user.role, session.authorization);
  if (!home && current.name === "access-denied") return { kind: "none" };
  const destination = appDestination(current);
  const feature = destination?.kind === "record"
    ? resolveAuthorizedFeature(destination.featureId ?? "", session.user.role, session.authorization)
    : null;
  if (explicitParent && (destination?.kind !== "record" || explicitParent !== `/feature/${destination.featureId}`)) return { kind: "none" };
  if (!explicitParent && destination?.kind === "feature" && destination.path === home?.path) return { kind: "none" };
  if (!destination && current.name !== "access-denied") return { kind: "none" };

  for (let index = stack.index - 1; index >= 0; index -= 1) {
    const previous = stack.routes[index]!;
    const target = appDestination(previous);
    if (!target || !ownership.owns(previous, fence) || !destinationAllowed(target, session)) break;
    // A fallback or resize can leave adjacent copies of the same logical screen.
    if (target.path === destination?.path) continue;
    if (!explicitParent || target.path === explicitParent) return { kind: "pop", count: stack.index - index };
    break;
  }

  const fallback = feature?.path ?? home?.path ?? "/access-denied";
  return fallback && fallback !== destination?.path ? { kind: "replace", path: fallback } : { kind: "none" };
}
