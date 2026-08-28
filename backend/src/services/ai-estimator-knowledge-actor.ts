import type { ClientSession } from "mongoose";

import type { Role } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";

export interface AiEstimatorKnowledgeStoredActor {
  readonly id: string;
  readonly role: Role;
  readonly active: boolean;
}

export interface AiEstimatorKnowledgeAuthorizedActor {
  readonly id: string;
  readonly role: "super_admin";
}

export interface AiEstimatorKnowledgeActorStore {
  coordinateAuthorizationMutation(session: ClientSession): Promise<void>;
  findActor(
    actorId: string,
    session?: ClientSession
  ): Promise<AiEstimatorKnowledgeStoredActor | null>;
  countActiveSuperAdmins(session?: ClientSession): Promise<number>;
}

export interface AiEstimatorKnowledgeActorGuard {
  requireReadActor(
    actor: PublicUser,
    session?: ClientSession
  ): Promise<AiEstimatorKnowledgeAuthorizedActor>;
  requireMutationActor(
    actor: PublicUser,
    session: ClientSession
  ): Promise<AiEstimatorKnowledgeAuthorizedActor>;
}

const mongoActorStore: AiEstimatorKnowledgeActorStore = {
  async coordinateAuthorizationMutation(session) {
    await AuthorizationCoordinationModel.updateOne(
      { _id: "authorization" },
      {
        $inc: { revision: 1 },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, session }
    ).exec();
  },

  async findActor(actorId, session) {
    const query = UserModel.findById(actorId)
      .select({ _id: 1, role: 1, active: 1 });
    if (session) query.session(session);
    const actor = await query.lean().exec();
    if (!actor) return null;
    return {
      id: String(actor._id),
      role: actor.role,
      active: actor.active
    };
  },

  async countActiveSuperAdmins(session) {
    const query = UserModel.countDocuments({ role: "super_admin", active: true });
    if (session) query.session(session);
    return query.exec();
  }
};

export function createAiEstimatorKnowledgeActorGuard(
  store: AiEstimatorKnowledgeActorStore = mongoActorStore
): AiEstimatorKnowledgeActorGuard {
  return {
    async requireReadActor(actor, session) {
      return requireActiveSoleSuperAdmin(store, actor, session);
    },

    async requireMutationActor(actor, session) {
      await store.coordinateAuthorizationMutation(session);
      return requireActiveSoleSuperAdmin(store, actor, session);
    }
  };
}

async function requireActiveSoleSuperAdmin(
  store: AiEstimatorKnowledgeActorStore,
  actor: PublicUser,
  session?: ClientSession
): Promise<AiEstimatorKnowledgeAuthorizedActor> {
  const storedActor = await store.findActor(actor.id, session);
  if (
    !storedActor ||
    !storedActor.active ||
    storedActor.role !== actor.role
  ) {
    throw new ApiError(
      401,
      "INVALID_TOKEN",
      "Authentication token is invalid."
    );
  }
  if (storedActor.role !== "super_admin") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You are not authorized to perform this action."
    );
  }

  const activeSuperAdminCount = await store.countActiveSuperAdmins(session);
  if (activeSuperAdminCount !== 1) {
    throw new ApiError(
      409,
      "SOLE_SUPER_ADMIN_REQUIRED",
      "Exactly one active Super Admin is required."
    );
  }
  return { id: storedActor.id, role: storedActor.role };
}

export const aiEstimatorKnowledgeActorGuard =
  createAiEstimatorKnowledgeActorGuard();
