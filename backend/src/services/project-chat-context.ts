import type { ChatActor } from "../contracts/project-chat.js";
import { hasPermission, type PermissionCode } from "../domain/authorization.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { chatForbidden, chatNotFound } from "../domain/project-chat.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatTransaction } from "../repositories/project-chat.js";
import type { Clock } from "./workflow.js";
export async function authenticatedChatUser(tx: ChatTransaction, actor: ChatActor, clock: Clock, permission: PermissionCode = "chat.read") {
  if (!Number.isFinite(actor.expiresAt) || actor.expiresAt * 1000 <= clock().getTime()) throw new ApiError(401, "TOKEN_EXPIRED", "Authentication token has expired.");
  const user = await tx.app.findUserById(actor.id);
  if (!user || !user.active || user.role !== actor.role || (user.sessionVersion ?? 1) !== actor.sessionVersion) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is no longer valid.");
  if (!hasPermission(user.role, permission)) chatForbidden();
  return user;
}
export async function projectChatContext(tx: ChatTransaction, actor: ChatActor, projectId: string, clock: Clock, permission: PermissionCode = "chat.read") {
  const user = await authenticatedChatUser(tx, actor, clock, permission);
  const sources = await tx.sources(projectId);
  if (!sources) chatNotFound();
  const membership = resolveChatMembership(sources, await tx.selections(projectId));
  if (!membership.participants.some(person => person.id === actor.id)) chatNotFound();
  return {sources, membership, user};
}
