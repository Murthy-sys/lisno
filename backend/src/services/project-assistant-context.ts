import { createHash } from "node:crypto";
import type { AssistantReadScope, AssistantSourceVersion } from "../contracts/project-chat-assistant.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatSources, ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import type { UserRecord } from "../repositories/types.js";

export interface AssistantContext {
  sources: ChatSources;
  user: UserRecord;
}

/** A durable run retains the initiating Client scope, never a synthetic login token. */
export async function readAssistantContext(repository: ProjectChatRepository, scope: AssistantReadScope, transaction?: ChatTransaction): Promise<AssistantContext> {
  const read = async (tx: ChatTransaction) => {
    const user = await tx.app.findUserById(scope.clientId);
    if (!user || !user.active || user.role !== "client" || (user.sessionVersion ?? 1) !== scope.sessionVersion) unavailable();
    const sources = await tx.sources(scope.projectId);
    if (!sources || sources.project.id !== scope.projectId || sources.project.clientId !== scope.clientId) unavailable();
    const membership = resolveChatMembership(sources, await tx.selections(scope.projectId));
    if (!membership.participants.some(person => person.id === scope.clientId && person.role === "client")) unavailable();
    return { sources, user };
  };
  return transaction ? read(transaction) : repository.snapshot(read);
}

export function unavailable(): never {
  throw new ApiError(404, "ASSISTANT_SOURCE_UNAVAILABLE", "The requested project information is not available.");
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Hashes stay server-side and witness private inputs without returning those inputs to the model. */
export function sourceWitness(kind: string, id: string, value: unknown): AssistantSourceVersion {
  return { kind, id, version: createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex") };
}
export function scopeWitness(context: AssistantContext): AssistantSourceVersion {
  // Publication takes this coordination token itself. It is not a business fact;
  // every other project field, including authority/version/status, remains witnessed.
  const { siteCompletionFenceEpoch: _siteCompletionFenceEpoch, ...project } = context.sources.project as typeof context.sources.project & { siteCompletionFenceEpoch?: number };
  return sourceWitness("assistant-scope", context.sources.project.id, {
    clientId: context.sources.project.clientId, sessionVersion: context.user.sessionVersion ?? 1,
    project,
    people: context.sources.users.map(user => ({ id: user.id, role: user.role, active: user.active, name: user.name })),
    estimates: context.sources.estimates, tasks: context.sources.workflowTasks,
    grants: context.sources.grants, exclusions: context.sources.exclusions
  });
}
