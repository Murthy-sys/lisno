import mongoose, { type ClientSession } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
  allocateAiEstimatorKnowledgeDisplayOrder,
  createAiEstimatorKnowledgeMainLineDisplayOrderScope,
  createAiEstimatorKnowledgeMasterDisplayOrderScope,
  observeExplicitAiEstimatorKnowledgeDisplayOrder
} from "../src/services/ai-estimator-knowledge-display-order.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actorId = "user-super-admin";
let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replicaSet = await startMongoReplicaSet(
    "ai-estimator-knowledge-display-order-test"
  );
  await Promise.all([
    AiEstimatorKnowledgeBasketModel.init(),
    AiEstimatorKnowledgeDisplayOrderSequenceModel.init(),
    AiEstimatorKnowledgeMainLineModel.init()
  ]);
}, 60_000);

afterEach(async () => {
  await replicaSet.clear();
});

afterAll(async () => {
  await replicaSet.stop();
});

describe("AI Estimator Knowledge display-order allocator", () => {
  it("encodes stable isolated scope keys and rejects malformed scope values", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE).toBe("baskets");
    expect(createAiEstimatorKnowledgeMainLineDisplayOrderScope("basket-1")).toBe(
      "main-lines:basket-1"
    );
    expect(createAiEstimatorKnowledgeMasterDisplayOrderScope("uoms")).toBe(
      "masters:uoms"
    );

    expect(() => createAiEstimatorKnowledgeMainLineDisplayOrderScope("")).toThrow(
      TypeError
    );
    expect(() =>
      createAiEstimatorKnowledgeMainLineDisplayOrderScope(" basket-1")
    ).toThrow(TypeError);
    expect(() =>
      createAiEstimatorKnowledgeMasterDisplayOrderScope("unknown" as never)
    ).toThrow(TypeError);
  });

  it("validates sequence documents as nonnegative safe-integer high-water values", async () => {
    await expect(
      new AiEstimatorKnowledgeDisplayOrderSequenceModel({
        _id: "baskets",
        highWaterOrder: -1
      }).validate()
    ).rejects.toThrow();
    await expect(
      new AiEstimatorKnowledgeDisplayOrderSequenceModel({
        _id: "baskets",
        highWaterOrder: Number.MAX_SAFE_INTEGER + 1
      }).validate()
    ).rejects.toThrow();
    await expect(
      new AiEstimatorKnowledgeDisplayOrderSequenceModel({
        _id: "baskets",
        highWaterOrder: Number.MAX_SAFE_INTEGER
      }).validate()
    ).resolves.toBeUndefined();
  });

  it("lazily starts an empty scope at zero", async () => {
    const allocated = await inTransaction((session) =>
      allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
    );

    expect(allocated).toBe(0);
    await expectSequence("baskets", 0);
  });

  it("seeds from the unfiltered historical maximum including archived values and gaps", async () => {
    await AiEstimatorKnowledgeBasketModel.create([
      basket("basket-active", 2),
      basket("basket-archived", 10, "archived")
    ]);

    const allocated = await inTransaction((session) =>
      allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
    );

    expect(allocated).toBe(11);
    await expectSequence("baskets", 11);
  });

  it("observes explicit compatibility orders and never lowers the high-water mark", async () => {
    await inTransaction((session) =>
      observeExplicitAiEstimatorKnowledgeDisplayOrder({
        ...basketTarget(session),
        displayOrder: 50
      })
    );
    await inTransaction((session) =>
      observeExplicitAiEstimatorKnowledgeDisplayOrder({
        ...basketTarget(session),
        displayOrder: 2
      })
    );

    const allocated = await inTransaction((session) =>
      allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
    );

    expect(allocated).toBe(51);
    await expectSequence("baskets", 51);
  });

  it("serializes concurrent same-scope transaction retries into consecutive allocations", async () => {
    const allocations = await Promise.all([
      allocateAndCreateBasket("basket-concurrent-a"),
      allocateAndCreateBasket("basket-concurrent-b")
    ]);

    expect(allocations.toSorted((left, right) => left - right)).toEqual([0, 1]);
    await expectSequence("baskets", 1);
    const rows = await AiEstimatorKnowledgeBasketModel.find()
      .sort({ displayOrder: 1 })
      .select({ displayOrder: 1, _id: 0 })
      .lean()
      .exec();
    expect(rows.map((row) => row.displayOrder)).toEqual([0, 1]);
  });

  it("updates an existing sequence across sequential connection transactions", async () => {
    await AiEstimatorKnowledgeBasketModel.create(basket("basket-main-lines", 0));

    const first = await allocateAndCreateMainLine("main-line-a");
    const second = await allocateAndCreateMainLine("main-line-b");

    expect([first, second]).toEqual([0, 1]);
    await expectSequence("main-lines:basket-main-lines", 1);
  });

  it("keeps independently encoded scopes isolated", async () => {
    const basketOrder = await inTransaction((session) =>
      allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
    );
    const masterOrder = await inTransaction((session) =>
      allocateAiEstimatorKnowledgeDisplayOrder({
        ...basketTarget(session),
        scope: createAiEstimatorKnowledgeMasterDisplayOrderScope("uoms")
      })
    );

    expect({ basketOrder, masterOrder }).toEqual({ basketOrder: 0, masterOrder: 0 });
    await expectSequence("baskets", 0);
    await expectSequence("masters:uoms", 0);
  });

  it("rejects invalid explicit values and status-constrained resource filters", async () => {
    for (const displayOrder of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        inTransaction((session) =>
          observeExplicitAiEstimatorKnowledgeDisplayOrder({
            ...basketTarget(session),
            displayOrder
          })
        )
      ).rejects.toThrow(TypeError);
    }

    await expect(
      inTransaction((session) =>
        allocateAiEstimatorKnowledgeDisplayOrder({
          ...basketTarget(session),
          resourceFilter: { status: "active" }
        })
      )
    ).rejects.toThrow(/every lifecycle status/u);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);
  });

  it("requires a live session that is already inside a Mongo transaction", async () => {
    const session = await mongoose.startSession();
    try {
      await expect(
        allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
      ).rejects.toThrow(/active Mongo transaction/u);
    } finally {
      await session.endSession();
    }
  });

  it("rejects safe-integer exhaustion before writing any sequence", async () => {
    await AiEstimatorKnowledgeBasketModel.create(
      basket("basket-exhausted", Number.MAX_SAFE_INTEGER)
    );

    const error = await captureRejection(() =>
      inTransaction((session) =>
        allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
      )
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "DISPLAY_ORDER_EXHAUSTED" });
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);
  });

  it("also rejects exhaustion from an existing sequence without changing it", async () => {
    await AiEstimatorKnowledgeDisplayOrderSequenceModel.create({
      _id: "baskets",
      highWaterOrder: Number.MAX_SAFE_INTEGER
    });

    const error = await captureRejection(() =>
      inTransaction((session) =>
        allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
      )
    );

    expect(error).toMatchObject({ status: 409, code: "DISPLAY_ORDER_EXHAUSTED" });
    await expectSequence("baskets", Number.MAX_SAFE_INTEGER);
  });

  it("rolls back the sequence with its caller transaction", async () => {
    const session = await mongoose.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          expect(
            await allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(session))
          ).toBe(0);
          throw new Error("resource write failed");
        })
      ).rejects.toThrow("resource write failed");
    } finally {
      await session.endSession();
    }

    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);
    const allocated = await inTransaction((nextSession) =>
      allocateAiEstimatorKnowledgeDisplayOrder(basketTarget(nextSession))
    );
    expect(allocated).toBe(0);
  });
});

function basketTarget(session: ClientSession) {
  return {
    scope: AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
    resourceModel: AiEstimatorKnowledgeBasketModel,
    resourceFilter: {},
    session
  } as const;
}

function basket(
  id: string,
  displayOrder: number,
  status: "active" | "archived" = "active"
) {
  const archived = status === "archived";
  return {
    _id: id,
    name: id,
    description: null,
    displayOrder,
    status,
    version: 1,
    createdById: actorId,
    updatedById: actorId,
    archivedAt: archived ? new Date("2026-08-01T00:00:00.000Z") : null,
    archivedById: archived ? actorId : null
  };
}

async function allocateAndCreateBasket(id: string): Promise<number> {
  const session = await mongoose.startSession();
  let allocated: number | undefined;
  try {
    await session.withTransaction(async () => {
      allocated = await allocateAiEstimatorKnowledgeDisplayOrder(
        basketTarget(session)
      );
      await AiEstimatorKnowledgeBasketModel.create([basket(id, allocated)], {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  if (allocated === undefined) throw new Error("Allocation did not commit.");
  return allocated;
}

async function allocateAndCreateMainLine(id: string): Promise<number> {
  let allocated: number | undefined;
  await mongoose.connection.transaction(async (session) => {
    const scope = createAiEstimatorKnowledgeMainLineDisplayOrderScope(
      "basket-main-lines"
    );
    allocated = await allocateAiEstimatorKnowledgeDisplayOrder({
      scope,
      resourceModel: AiEstimatorKnowledgeMainLineModel,
      resourceFilter: { basketId: "basket-main-lines" },
      session
    });
    await AiEstimatorKnowledgeMainLineModel.create(
      [
        {
          _id: id,
          basketId: "basket-main-lines",
          name: id,
          description: null,
          displayOrder: allocated,
          status: "draft",
          activeRevisionId: null,
          draftRevisionId: `revision-${id}`,
          version: 1,
          createdById: actorId,
          updatedById: actorId,
          deactivatedAt: null,
          deactivatedById: null,
          archivedAt: null,
          archivedById: null
        }
      ],
      { session }
    );
  });
  if (allocated === undefined) throw new Error("Main Line allocation did not commit.");
  return allocated;
}

async function inTransaction<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  let completed = false;
  let result!: T;
  try {
    await session.withTransaction(async () => {
      result = await operation(session);
      completed = true;
    });
  } finally {
    await session.endSession();
  }
  if (!completed) throw new Error("Transaction did not complete.");
  return result;
}

async function expectSequence(scope: string, highWaterOrder: number): Promise<void> {
  await expect(
    AiEstimatorKnowledgeDisplayOrderSequenceModel.findById(scope).lean().exec()
  ).resolves.toMatchObject({ _id: scope, highWaterOrder });
}

async function captureRejection(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to reject.");
}
