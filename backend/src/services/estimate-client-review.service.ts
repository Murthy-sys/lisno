import type mongoose from "mongoose";

import {
  type EstimateClientReviewDetail,
  type EstimateClientReviewListItem,
  type EstimateClientReviewSnapshot,
  type EstimateClientReviewStatus,
  type EstimateClientReviewSummary,
  type ReviewAssignee,
  type StoredDownload
} from "../domain/estimate-client-review.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientResponseProofModel } from "../models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import type { PageResult, PaginationInput } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { EstimateClientReviewStorage } from "./estimate-client-review-storage.js";

type Pipeline = Record<string, unknown>[];
type Row = Record<string, unknown>;

export interface EstimateClientReviewService {
  resolveReviewAssignee(
    projectId: string | null,
    session: mongoose.ClientSession
  ): Promise<ReviewAssignee>;
  currentSummaryForEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<EstimateClientReviewSummary | null>;
  currentRoundForClientEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<{ id: string; version: number } | null>;
  list(
    actor: PublicUser,
    filters: { status?: EstimateClientReviewStatus },
    pagination: PaginationInput
  ): Promise<PageResult<EstimateClientReviewListItem>>;
  detail(actor: PublicUser, roundId: string): Promise<EstimateClientReviewDetail>;
  readPdf(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  readClientPdf(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  readProof(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  requireDecisionScope(
    actor: PublicUser,
    roundId: string,
    session?: mongoose.ClientSession
  ): Promise<void>;
  requireRetryScope(
    actor: PublicUser,
    estimateId: string,
    roundId: string
  ): Promise<void>;
}

export function createEstimateClientReviewService(input: {
  storage: EstimateClientReviewStorage;
}): EstimateClientReviewService {
  async function resolveReviewAssignee(
    projectId: string | null,
    session: mongoose.ClientSession
  ): Promise<ReviewAssignee> {
    if (projectId !== null) {
      const initiators = await aggregateWithSession(
        ProjectAccessGrantModel,
        [
          {
            $match: {
              projectId,
              module: "projects",
              source: "admin_initiator",
              active: true
            }
          },
          {
            $lookup: {
              from: UserModel.collection.name,
              let: { adminId: "$userId" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$_id", "$$adminId"] },
                    role: "admin",
                    active: true
                  }
                },
                { $project: { _id: 1 } },
                { $limit: 1 }
              ],
              as: "eligibleAdmins"
            }
          },
          { $match: { "eligibleAdmins.0": { $exists: true } } },
          { $project: { _id: 0, assignedAdminId: "$userId" } },
          { $limit: 2 }
        ],
        session
      );
      if (initiators.length > 1) assignmentConflict();
      if (initiators.length === 1) {
        return {
          assignedAdminId: stringField(initiators[0], "assignedAdminId"),
          source: "admin_initiator"
        };
      }
    }

    const superAdmins = await aggregateWithSession(
      UserModel,
      [
        { $match: { role: "super_admin", active: true } },
        { $project: { _id: 0, assignedAdminId: "$_id" } },
        { $limit: 2 }
      ],
      session
    );
    if (superAdmins.length !== 1) assignmentInvariant();
    return {
      assignedAdminId: stringField(superAdmins[0], "assignedAdminId"),
      source: "super_admin_fallback"
    };
  }

  async function currentSummaryForEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<EstimateClientReviewSummary | null> {
    await requireEstimateReader(actor, estimateId);
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      { $match: { estimateId } },
      { $sort: { sendGeneration: -1, _id: 1 } },
      { $limit: 1 },
      {
        $project: {
          _id: 0,
          id: "$_id",
          sendGeneration: 1,
          estimateVersion: 1,
          version: 1,
          deliveryStatus: 1,
          deliveryAttemptCount: 1,
          deliveredAt: 1,
          status: 1
        }
      }
    ]);
    return rows[0] ? mapSummary(rows[0]) : null;
  }

  async function currentRoundForClientEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<{ id: string; version: number } | null> {
    if (actor.role !== "client") notFound();
    await requireClientEstimateReader(actor, estimateId);
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      { $match: { estimateId } },
      { $sort: { sendGeneration: -1, _id: 1 } },
      { $limit: 1 },
      ...activeActorStages(actor, "clientActor", {
        emailNormalized: normalizeEmail(actor.email)
      }),
      ...clientLeadScopeStages("clientActor"),
      {
        $match: {
          $expr: {
            $eq: ["$recipientEmailNormalized", "$clientActor.emailNormalized"]
          }
        }
      },
      { $project: { _id: 0, id: "$_id", version: 1 } }
    ]);
    return rows[0]
      ? { id: stringField(rows[0], "id"), version: numberField(rows[0], "version") }
      : null;
  }

  async function list(
    actor: PublicUser,
    filters: { status?: EstimateClientReviewStatus },
    pagination: PaginationInput
  ): Promise<PageResult<EstimateClientReviewListItem>> {
    const pipeline = roundScopePipeline(actor, {
      ...(filters.status ? { status: filters.status } : {})
    });
    pipeline.push({
      $facet: {
        items: [
          {
            $set: {
              pendingRank: {
                $cond: [{ $eq: ["$status", "pending"] }, 0, 1]
              }
            }
          },
          { $sort: { pendingRank: 1, createdAt: -1, _id: 1 } },
          { $skip: pagination.offset },
          { $limit: pagination.limit },
          ...roundPresentationStages(false)
        ],
        count: [{ $count: "total" }]
      }
    });
    const [page] = await aggregateRows(EstimateClientReviewRoundModel, pipeline);
    const result = page ?? {};
    const items = arrayField(result, "items").map(mapListItem);
    const countRows = arrayField(result, "count");
    return {
      items,
      total: countRows[0] ? numberField(countRows[0], "total") : 0
    };
  }

  async function detail(
    actor: PublicUser,
    roundId: string
  ): Promise<EstimateClientReviewDetail> {
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      ...roundScopePipeline(actor, { _id: roundId }),
      ...roundPresentationStages(true)
    ]);
    if (!rows[0]) notFound();
    return mapDetail(rows[0]);
  }

  async function readPdf(
    actor: PublicUser,
    roundId: string
  ): Promise<StoredDownload> {
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      ...roundScopePipeline(actor, { _id: roundId }),
      {
        $project: {
          _id: 0,
          storageReference: "$pdfStorageReference",
          filename: "$pdfFilename",
          mimeType: "$pdfMimeType"
        }
      }
    ]);
    return readAuthorizedDownload(rows[0]);
  }

  async function readClientPdf(
    actor: PublicUser,
    roundId: string
  ): Promise<StoredDownload> {
    if (actor.role !== "client") notFound();
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      { $match: { _id: roundId } },
      ...activeActorStages(actor, "clientActor", {
        emailNormalized: normalizeEmail(actor.email)
      }),
      ...clientLeadScopeStages("clientActor"),
      {
        $match: {
          $expr: {
            $eq: ["$recipientEmailNormalized", "$clientActor.emailNormalized"]
          }
        }
      },
      {
        $lookup: {
          from: EstimateClientReviewRoundModel.collection.name,
          let: { currentEstimateId: "$estimateId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$estimateId", "$$currentEstimateId"] }
              }
            },
            { $sort: { sendGeneration: -1, _id: 1 } },
            { $limit: 1 },
            { $project: { _id: 1 } }
          ],
          as: "latestRounds"
        }
      },
      { $set: { latestRound: { $arrayElemAt: ["$latestRounds", 0] } } },
      { $match: { $expr: { $eq: ["$latestRound._id", "$_id"] } } },
      {
        $project: {
          _id: 0,
          storageReference: "$pdfStorageReference",
          filename: "$pdfFilename",
          mimeType: "$pdfMimeType"
        }
      }
    ]);
    return readAuthorizedDownload(rows[0]);
  }

  async function readProof(
    actor: PublicUser,
    roundId: string
  ): Promise<StoredDownload> {
    const scope = proofReaderScopePipeline(actor, roundId);
    const rows = await aggregateRows(EstimateClientReviewRoundModel, [
      ...scope,
      {
        $lookup: {
          from: EstimateClientResponseProofModel.collection.name,
          let: { scopedRoundId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$reviewRoundId", "$$scopedRoundId"] }
              }
            },
            {
              $project: {
                _id: 0,
                storageReference: 1,
                filename: "$originalFilename",
                mimeType: 1
              }
            },
            { $limit: 1 }
          ],
          as: "proofRows"
        }
      },
      { $set: { proof: { $arrayElemAt: ["$proofRows", 0] } } },
      { $match: { "proof.storageReference": { $type: "string" } } },
      {
        $project: {
          _id: 0,
          storageReference: "$proof.storageReference",
          filename: "$proof.filename",
          mimeType: "$proof.mimeType"
        }
      }
    ]);
    return readAuthorizedDownload(rows[0]);
  }

  async function requireDecisionScope(
    actor: PublicUser,
    roundId: string,
    session?: mongoose.ClientSession
  ): Promise<void> {
    const rows = await aggregateWithOptionalSession(
      EstimateClientReviewRoundModel,
      [
        ...roundScopePipeline(actor, { _id: roundId }),
        { $project: { _id: 1 } },
        { $limit: 1 }
      ],
      session
    );
    if (!rows[0]) notFound();
  }

  async function requireRetryScope(
    actor: PublicUser,
    estimateId: string,
    roundId: string
  ): Promise<void> {
    if (!["estimator_sales", "super_admin"].includes(actor.role)) notFound();
    const estimateMatch: Row = { _id: estimateId };
    if (actor.role === "estimator_sales") estimateMatch.ownerId = actor.id;
    const rows = await aggregateRows(EstimateModel, [
      { $match: estimateMatch },
      ...activeActorStages(actor, "activeActor"),
      {
        $lookup: {
          from: EstimateClientReviewRoundModel.collection.name,
          let: {
            estimateId: "$_id",
            roundId: { $literal: roundId }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$roundId"] },
                    { $eq: ["$estimateId", "$$estimateId"] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } },
            { $limit: 1 }
          ],
          as: "retryRounds"
        }
      },
      { $match: { "retryRounds.0": { $exists: true } } },
      { $project: { _id: 1 } },
      { $limit: 1 }
    ]);
    if (!rows[0]) notFound();
  }

  async function requireEstimateReader(
    actor: PublicUser,
    estimateId: string
  ): Promise<void> {
    if (!["estimator_sales", "super_admin"].includes(actor.role)) notFound();
    const match: Row = { _id: estimateId };
    if (actor.role === "estimator_sales") match.ownerId = actor.id;
    const rows = await aggregateRows(EstimateModel, [
      { $match: match },
      ...activeActorStages(actor, "activeActor"),
      { $project: { _id: 1 } },
      { $limit: 1 }
    ]);
    if (!rows[0]) notFound();
  }

  async function requireClientEstimateReader(
    actor: PublicUser,
    estimateId: string
  ): Promise<void> {
    const rows = await aggregateRows(EstimateModel, [
      { $match: { _id: estimateId } },
      ...activeActorStages(actor, "clientActor", {
        emailNormalized: normalizeEmail(actor.email)
      }),
      {
        $lookup: {
          from: LeadModel.collection.name,
          let: { estimateLeadId: "$leadId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$estimateLeadId"] }
              }
            },
            {
              $set: {
                clientEmailNormalized: {
                  $toLower: { $trim: { input: "$clientEmail" } }
                }
              }
            },
            {
              $match: {
                clientEmailNormalized: normalizeEmail(actor.email)
              }
            },
            { $project: { _id: 1 } },
            { $limit: 1 }
          ],
          as: "clientLeadRows"
        }
      },
      { $match: { "clientLeadRows.0": { $exists: true } } },
      { $project: { _id: 1 } },
      { $limit: 1 }
    ]);
    if (!rows[0]) notFound();
  }

  async function readAuthorizedDownload(row: Row | undefined): Promise<StoredDownload> {
    if (!row) notFound();
    const storageReference = stringField(row, "storageReference");
    const filename = stringField(row, "filename");
    const mimeType = stringField(row, "mimeType") as StoredDownload["mimeType"];
    const bytes = await input.storage.read(storageReference);
    return { filename, mimeType, bytes };
  }

  return {
    resolveReviewAssignee,
    currentSummaryForEstimate,
    currentRoundForClientEstimate,
    list,
    detail,
    readPdf,
    readClientPdf,
    readProof,
    requireDecisionScope,
    requireRetryScope
  };
}

function roundScopePipeline(actor: PublicUser, initialMatch: Row): Pipeline {
  if (actor.role === "super_admin") {
    return [
      { $match: initialMatch },
      ...activeActorStages(actor, "activeActor")
    ];
  }
  if (actor.role !== "admin") notFound();
  return [
    {
      $match: {
        ...initialMatch,
        assignedAdminId: actor.id,
        projectId: { $type: "string" }
      }
    },
    ...activeActorStages(actor, "activeActor"),
    {
      $lookup: {
        from: ProjectAccessGrantModel.collection.name,
        let: { roundProjectId: "$projectId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$projectId", "$$roundProjectId"] },
              userId: actor.id,
              source: "admin_initiator",
              module: "projects",
              active: true
            }
          },
          { $project: { _id: 1 } },
          { $limit: 1 }
        ],
        as: "currentInitiatorGrants"
      }
    },
    { $match: { "currentInitiatorGrants.0": { $exists: true } } }
  ];
}

function proofReaderScopePipeline(actor: PublicUser, roundId: string): Pipeline {
  if (actor.role === "admin" || actor.role === "super_admin") {
    return roundScopePipeline(actor, { _id: roundId });
  }
  if (actor.role !== "estimator_sales") notFound();
  return [
    { $match: { _id: roundId } },
    ...activeActorStages(actor, "activeActor"),
    {
      $lookup: {
        from: EstimateModel.collection.name,
        let: { roundEstimateId: "$estimateId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$roundEstimateId"] },
              ownerId: actor.id
            }
          },
          { $project: { _id: 1 } },
          { $limit: 1 }
        ],
        as: "ownedEstimates"
      }
    },
    { $match: { "ownedEstimates.0": { $exists: true } } }
  ];
}

function activeActorStages(
  actor: PublicUser,
  alias: string,
  extraMatch: Row = {}
): Pipeline {
  return [
    {
      $lookup: {
        from: UserModel.collection.name,
        let: { actorId: { $literal: actor.id } },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$actorId"] },
              role: actor.role,
              active: true,
              ...extraMatch
            }
          },
          { $project: { _id: 1, emailNormalized: 1 } },
          { $limit: 1 }
        ],
        as: `${alias}Rows`
      }
    },
    { $set: { [alias]: { $arrayElemAt: [`$${alias}Rows`, 0] } } },
    { $match: { [`${alias}._id`]: { $exists: true } } }
  ];
}

function clientLeadScopeStages(clientAlias: string): Pipeline {
  return [
    {
      $lookup: {
        from: LeadModel.collection.name,
        let: { roundLeadId: "$leadId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$roundLeadId"] }
            }
          },
          {
            $set: {
              clientEmailNormalized: {
                $toLower: { $trim: { input: "$clientEmail" } }
              }
            }
          },
          { $project: { _id: 1, clientEmailNormalized: 1 } },
          { $limit: 1 }
        ],
        as: "clientLeadRows"
      }
    },
    { $set: { clientLead: { $arrayElemAt: ["$clientLeadRows", 0] } } },
    {
      $match: {
        $expr: {
          $eq: [
            "$clientLead.clientEmailNormalized",
            `$${clientAlias}.emailNormalized`
          ]
        }
      }
    }
  ];
}

function roundPresentationStages(includeDetail: boolean): Pipeline {
  const projection: Row = {
    _id: 0,
    id: "$_id",
    version: 1,
    sendGeneration: 1,
    project: {
      $cond: [
        { $eq: ["$projectId", null] },
        null,
        { id: "$project._id", name: "$project.name" }
      ]
    },
    client: {
      name: "$estimateSnapshot.clientName",
      email: "$recipientEmail"
    },
    estimate: {
      id: "$estimateId",
      version: "$estimateVersion",
      total: "$estimateSnapshot.total"
    },
    assignedAdmin: {
      id: "$assignedAdmin._id",
      name: "$assignedAdmin.name"
    },
    deliveryStatus: 1,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: 1,
    deliveredAt: 1,
    status: 1,
    decision: 1,
    proofAvailable: { $ne: ["$proof", null] },
    createdAt: 1
  };
  if (includeDetail) {
    projection.estimateSnapshot = 1;
    projection.pdf = {
      filename: "$pdfFilename",
      mimeType: "$pdfMimeType",
      byteSize: "$pdfByteSize",
      sha256: "$pdfSha256"
    };
    projection.decisionSource = 1;
    projection.decisionNote = 1;
    projection.decidedAt = 1;
  }
  return [
    {
      $lookup: {
        from: ProjectModel.collection.name,
        localField: "projectId",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, name: 1 } }],
        as: "projectRows"
      }
    },
    {
      $lookup: {
        from: UserModel.collection.name,
        localField: "assignedAdminId",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, name: 1 } }],
        as: "assignedAdminRows"
      }
    },
    {
      $lookup: {
        from: EstimateClientResponseProofModel.collection.name,
        let: { roundId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$reviewRoundId", "$$roundId"] } } },
          { $project: { _id: 1 } },
          { $limit: 1 }
        ],
        as: "proofRows"
      }
    },
    {
      $set: {
        project: { $arrayElemAt: ["$projectRows", 0] },
        assignedAdmin: { $arrayElemAt: ["$assignedAdminRows", 0] },
        proof: { $arrayElemAt: ["$proofRows", 0] }
      }
    },
    { $project: projection }
  ];
}

async function aggregateRows(
  model: { aggregate(pipeline: never[]): mongoose.Aggregate<unknown[]> },
  pipeline: Pipeline
): Promise<Row[]> {
  return (await model.aggregate(pipeline as never[]).exec()) as Row[];
}

async function aggregateWithSession(
  model: { aggregate(pipeline: never[]): mongoose.Aggregate<unknown[]> },
  pipeline: Pipeline,
  session: mongoose.ClientSession
): Promise<Row[]> {
  return (await model
    .aggregate(pipeline as never[])
    .session(session)
    .exec()) as Row[];
}

async function aggregateWithOptionalSession(
  model: { aggregate(pipeline: never[]): mongoose.Aggregate<unknown[]> },
  pipeline: Pipeline,
  session?: mongoose.ClientSession
): Promise<Row[]> {
  const aggregate = model.aggregate(pipeline as never[]);
  if (session) aggregate.session(session);
  return (await aggregate.exec()) as Row[];
}

function mapSummary(row: Row): EstimateClientReviewSummary {
  return {
    id: stringField(row, "id"),
    sendGeneration: numberField(row, "sendGeneration"),
    estimateVersion: numberField(row, "estimateVersion"),
    version: numberField(row, "version"),
    deliveryStatus: stringField(row, "deliveryStatus") as EstimateClientReviewSummary["deliveryStatus"],
    deliveryAttemptCount: numberField(row, "deliveryAttemptCount"),
    deliveredAt: nullableIsoField(row, "deliveredAt"),
    status: stringField(row, "status") as EstimateClientReviewStatus
  };
}

function mapListItem(row: Row): EstimateClientReviewListItem {
  const project = nullableRecordField(row, "project");
  const client = recordField(row, "client");
  const estimate = recordField(row, "estimate");
  const assignedAdmin = recordField(row, "assignedAdmin");
  return {
    id: stringField(row, "id"),
    version: numberField(row, "version"),
    sendGeneration: numberField(row, "sendGeneration"),
    project: project
      ? { id: stringField(project, "id"), name: stringField(project, "name") }
      : null,
    client: {
      name: stringField(client, "name"),
      email: stringField(client, "email")
    },
    estimate: {
      id: stringField(estimate, "id"),
      version: numberField(estimate, "version"),
      total: numberField(estimate, "total")
    },
    assignedAdmin: {
      id: stringField(assignedAdmin, "id"),
      name: stringField(assignedAdmin, "name")
    },
    deliveryStatus: stringField(row, "deliveryStatus") as EstimateClientReviewListItem["deliveryStatus"],
    deliveryAttemptCount: numberField(row, "deliveryAttemptCount"),
    deliveryAttemptedAt: nullableIsoField(row, "deliveryAttemptedAt"),
    deliveredAt: nullableIsoField(row, "deliveredAt"),
    status: stringField(row, "status") as EstimateClientReviewStatus,
    decision: nullableStringField(row, "decision") as EstimateClientReviewListItem["decision"],
    proofAvailable: booleanField(row, "proofAvailable"),
    createdAt: isoField(row, "createdAt")
  };
}

function mapDetail(row: Row): EstimateClientReviewDetail {
  const list = mapListItem(row);
  const pdf = recordField(row, "pdf");
  return {
    id: list.id,
    version: list.version,
    sendGeneration: list.sendGeneration,
    project: list.project,
    client: list.client,
    estimate: list.estimate,
    assignedAdmin: list.assignedAdmin,
    deliveryStatus: list.deliveryStatus,
    deliveryAttemptCount: list.deliveryAttemptCount,
    deliveryAttemptedAt: list.deliveryAttemptedAt,
    deliveredAt: list.deliveredAt,
    status: list.status,
    decision: list.decision,
    proofAvailable: list.proofAvailable,
    createdAt: list.createdAt,
    estimateSnapshot: mapSnapshot(recordField(row, "estimateSnapshot")),
    pdf: {
      filename: stringField(pdf, "filename"),
      mimeType: "application/pdf",
      byteSize: numberField(pdf, "byteSize"),
      sha256: stringField(pdf, "sha256")
    },
    decisionSource: nullableStringField(row, "decisionSource") as EstimateClientReviewDetail["decisionSource"],
    decisionNote: nullableStringField(row, "decisionNote"),
    decidedAt: nullableIsoField(row, "decidedAt")
  };
}

function mapSnapshot(row: Row): EstimateClientReviewSnapshot {
  return {
    clientName: stringField(row, "clientName"),
    projectName: stringField(row, "projectName"),
    location: stringField(row, "location"),
    propertyType: stringField(row, "propertyType"),
    lineItems: arrayField(row, "lineItems").map((lineItem) => ({
      catalogueId: stringField(lineItem, "catalogueId"),
      roomName: stringField(lineItem, "roomName"),
      specification: stringField(lineItem, "specification"),
      unit: stringField(lineItem, "unit"),
      rate: numberField(lineItem, "rate"),
      quantity: numberField(lineItem, "quantity"),
      included: booleanField(lineItem, "included"),
      amount: numberField(lineItem, "amount")
    })),
    subtotal: numberField(row, "subtotal"),
    gst: numberField(row, "gst"),
    total: numberField(row, "total")
  };
}

function recordField(row: Row, field: string): Row {
  const value = row[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function nullableRecordField(row: Row, field: string): Row | null {
  return row[field] === null ? null : recordField(row, field);
}

function arrayField(row: Row, field: string): Row[] {
  const value = row[field];
  return Array.isArray(value)
    ? value.filter(
        (item): item is Row =>
          item !== null && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function stringField(row: Row, field: string): string {
  return String(row[field]);
}

function nullableStringField(row: Row, field: string): string | null {
  return row[field] === null || row[field] === undefined
    ? null
    : String(row[field]);
}

function numberField(row: Row, field: string): number {
  return Number(row[field]);
}

function booleanField(row: Row, field: string): boolean {
  return Boolean(row[field]);
}

function isoField(row: Row, field: string): string {
  const value = row[field];
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIsoField(row: Row, field: string): string | null {
  return row[field] === null || row[field] === undefined
    ? null
    : isoField(row, field);
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function assignmentConflict(): never {
  throw new ApiError(
    409,
    "REVIEW_ASSIGNMENT_CONFLICT",
    "A review assignee could not be resolved."
  );
}

function assignmentInvariant(): never {
  throw new ApiError(
    500,
    "REVIEW_ASSIGNMENT_INVARIANT",
    "A review assignee could not be resolved."
  );
}
