import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  EvaluationRecord,
  PageResult,
  PaginationInput
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import {
  assertDesignerRelationship,
  forbidden,
  requireActor,
  requireUser,
  type Clock
} from "./workflow.js";

export interface CreateEvaluationInput {
  subjectUserId: string;
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  comments: string;
  revisionOf?: string;
}

export interface EvaluationService {
  create(
    actor: PublicUser,
    input: CreateEvaluationInput
  ): Promise<EvaluationRecord>;
  list(
    actor: PublicUser,
    subjectId: string,
    pagination: PaginationInput
  ): Promise<PageResult<EvaluationRecord>>;
}

export function createEvaluationService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock
): EvaluationService {
  const assertCanViewSubject = async (actor: PublicUser, subjectId: string) => {
    const subject = await requireUser(repository, subjectId);
    if (subject.role === "designer") {
      await assertDesignerRelationship(repository, actor, subject.id);
      return subject;
    }
    if (actor.role === "design_head" && subject.role === "design_manager") {
      return subject;
    }
    forbidden();
  };

  return {
    async create(actor, input) {
      await requireActor(repository, actor);
      if (actor.role !== "design_manager" && actor.role !== "design_head") {
        forbidden();
      }
      const evaluatorRole = actor.role;
      const subject = await requireUser(repository, input.subjectUserId);
      if (actor.role === "design_manager") {
        if (subject.role !== "designer" || subject.managerId !== actor.id) {
          forbidden();
        }
      } else if (subject.role !== "designer" && subject.role !== "design_manager") {
        forbidden();
      }
      if (new Date(input.periodStartAt) > new Date(input.periodEndAt)) {
        throw new ApiError(
          400,
          "INVALID_DATE_RANGE",
          "The evaluation period start must not follow its end.",
          { periodEndAt: "The period end must not precede its start." }
        );
      }

      if (input.revisionOf) {
        const history = await repository.listEvaluationsForSubject(subject.id);
        const revised = history.find((evaluation) => evaluation.id === input.revisionOf);
        if (
          !revised ||
          revised.evaluatorUserId !== actor.id ||
          revised.evaluatorRole !== actor.role
        ) {
          throw new ApiError(
            400,
            "INVALID_REVISION",
            "The referenced evaluation cannot be revised by this evaluator."
          );
        }
        if (
          revised.periodStartAt !== input.periodStartAt ||
          revised.periodEndAt !== input.periodEndAt
        ) {
          throw new ApiError(
            400,
            "INVALID_REVISION",
            "An evaluation correction must retain the original period."
          );
        }
      }

      const occurredAt = clock().toISOString();
      return repository.runInTransaction(async (transaction) => {
        const evaluation = await transaction.createEvaluation({
          subjectUserId: subject.id,
          evaluatorUserId: actor.id,
          evaluatorRole,
          periodStartAt: input.periodStartAt,
          periodEndAt: input.periodEndAt,
          score: input.score,
          comments: input.comments,
          revisionOf: input.revisionOf ?? null,
          createdAt: occurredAt
        });
        await audit.append(
          {
            actorId: actor.id,
            action: input.revisionOf
              ? "evaluation_revised"
              : "evaluation_created",
            entityType: "evaluation",
            entityId: evaluation.id,
            occurredAt,
            oldValues: input.revisionOf
              ? { revisionOf: input.revisionOf }
              : {},
            newValues: {
              subjectUserId: subject.id,
              score: input.score,
              periodStartAt: input.periodStartAt,
              periodEndAt: input.periodEndAt
            }
          },
          transaction
        );
        return evaluation;
      });
    },

    async list(actor, subjectId, pagination) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      await assertCanViewSubject(actor, subjectId);
      return repository.pageEvaluationsForSubject(subjectId, pagination);
    }
  };
}
