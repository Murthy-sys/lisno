import { model, models, Schema } from "./mongoose.js";
const identity = {type: String, required: true, immutable: true};
const run = new Schema({
  _id: identity, projectId: identity, clientId: identity, sessionVersion: {type: Number, required: true, immutable: true},
  messageId: identity, messageVersion: {type: Number, required: true}, messageSequence: {type: Number, required: true, immutable: true},
  responseAfterSequence: {type: Number, required: true, immutable: true},
  generation: {type: Number, required: true, immutable: true},
  status: {type: String, required: true, enum: ["waiting_for_human", "ready", "leased", "answered", "needs_clarification", "no_answer", "suppressed", "failed"]},
  stateVersion: {type: Number, required: true, min: 1},
  eligibleAt: {type: String, required: true}, createdAt: identity, updatedAt: {type: String, required: true},
  explicit: {type: Boolean, required: true}, notified: {type: Schema.Types.Mixed, default: null}, routing: {type: String, required: true, enum: ["not_required", "notified", "unroutable"]},
  workerAttempts: {type: Number, required: true, min: 0}, providerAttempts: {type: Number, required: true, min: 0},
  generationStartedAt: {type: String, default: null},
  coalescingStartedAt: {type: String},
  coalescedSources: {type: [new Schema({runId: {type: String, required: true}, messageId: {type: String, required: true}, messageVersion: {type: Number, required: true}, messageSequence: {type: Number, required: true}}, {_id: false})], default: undefined},
  leaseToken: {type: String, default: null}, leaseUntil: {type: String, default: null}, resultId: {type: String, default: null},
  answerMessageId: {type: String, default: null}, checkedAt: {type: String, default: null}, failureCode: {type: String, default: null}
}, {versionKey: false});
run.index({projectId: 1, messageId: 1, generation: 1}, {unique: true});
run.index({status: 1, eligibleAt: 1, leaseUntil: 1});
run.index({projectId: 1, status: 1});
const result = new Schema({
  _id: identity, projectId: identity, messageId: identity, runId: identity, checkedAt: identity,
  kind: identity, facts: {type: [Schema.Types.Mixed], required: true, immutable: true},
  narrative: {type: [new Schema({text: {type: String, required: true, maxlength: 2000}, factIds: {type: [String], required: true}}, {_id: false})], default: undefined, immutable: true,
    validate: {validator: (rows: Array<{text: string}> | undefined) => rows === undefined || rows.length <= 4 && rows.reduce((length, row) => length + row.text.length, 0) <= 2000, message: "Assistant narrative exceeds its limit"}},
  candidates: {type: [Schema.Types.Mixed], required: true, immutable: true}, missingInputs: {type: [String], required: true, immutable: true},
  commercial: {type: Schema.Types.Mixed, default: null, immutable: true}, freshness: {type: [Schema.Types.Mixed], required: true, immutable: true}
}, {versionKey: false});
result.index({runId: 1}, {unique: true});
result.index({projectId: 1, _id: 1});
const receipt = new Schema({
  _id: identity, kind: identity, projectId: {type: String, immutable: true, default: null, required: function(this: {get(path: string): unknown; getUpdate?: () => {$setOnInsert?: {kind?: string}}}) { return (this.get("kind") ?? this.getUpdate?.()?.$setOnInsert?.kind) !== "usage"; }}, runId: identity, createdAt: identity, fingerprint: identity,
  amount: {type: Number, required: true, min: 0}, settled: {type: Boolean, required: true}
}, {versionKey: false});
const counter = new Schema({_id: identity, value: {type: Number, required: true, min: 0}, updatedAt: {type: String, required: true}}, {versionKey: false});
export const ProjectChatAssistantRunModel = models.ProjectChatAssistantRun ?? model("ProjectChatAssistantRun", run);
export const ProjectChatAssistantResultModel = models.ProjectChatAssistantResult ?? model("ProjectChatAssistantResult", result);
export const ProjectChatAssistantReceiptModel = models.ProjectChatAssistantReceipt ?? model("ProjectChatAssistantReceipt", receipt);
export const ProjectChatAssistantCounterModel = models.ProjectChatAssistantCounter ?? model("ProjectChatAssistantCounter", counter);
export const projectAssistantModels = [ProjectChatAssistantRunModel, ProjectChatAssistantResultModel, ProjectChatAssistantReceiptModel, ProjectChatAssistantCounterModel];
