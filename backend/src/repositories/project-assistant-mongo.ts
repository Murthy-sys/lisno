import type { ClientSession } from "mongoose";
import { ProjectChatAssistantRunModel as Run, ProjectChatAssistantResultModel as Result, ProjectChatAssistantReceiptModel as Receipt, ProjectChatAssistantCounterModel as Counter } from "../models/ProjectChatAssistant.js";
import type { AssistantTransactions } from "./project-assistant.js";
function record<T>(row: any): T { if (!row) return row; const {_id, __v, ...rest} = row; return {id: String(_id), ...rest} as T; }
function document<T extends {id: string}>({id, ...rest}: T) { return {_id: id, ...rest}; }
export function createMongoAssistantOperations(session: ClientSession): AssistantTransactions {
  return {
    async run(id) { return record(await Run.findById(id).session(session).lean()); },
    async latestRun(projectId, messageId) { return record(await Run.findOne({projectId, messageId}).sort({generation: -1}).session(session).lean()); },
    async projectRuns(projectId) { return (await Run.find({projectId, status: {$in: ["ready", "waiting_for_human", "leased"]}}).session(session).lean()).map(r => record(r)); },
    async dueRuns(now, limit) { return (await Run.find({$or: [{status: {$in: ["ready", "waiting_for_human"]}, eligibleAt: {$lte: now}}, {status: "leased", leaseUntil: {$lte: now}}]}).sort({eligibleAt: 1, _id: 1}).limit(limit).session(session).lean()).map(r => record(r)); },
    async waitingRuns(limit) { return (await Run.find({status: "waiting_for_human"}).sort({eligibleAt: 1, _id: 1}).limit(limit).session(session).lean()).map(r => record(r)); },
    async saveRun(row) { await Run.updateOne({_id: row.id}, {$set: document(row)}, {upsert: true, session, runValidators: true}); },
    async result(projectId, id) { return record(await Result.findOne({_id: id, projectId}).session(session).lean()); },
    async saveResult(row) { await Result.create([document(row)], {session}); },
    async receipt(id) { return record(await Receipt.findById(id).session(session).lean()); },
    async saveReceipt(row) { await Receipt.updateOne({_id: row.id}, {$set: document(row)}, {upsert: true, session, runValidators: true}); },
    async counter(id) { return record(await Counter.findById(id).session(session).lean()); },
    async saveCounter(row) { await Counter.updateOne({_id: row.id}, {$set: document(row)}, {upsert: true, session, runValidators: true}); }
  };
}
