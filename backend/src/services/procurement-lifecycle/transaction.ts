import mongoose, { type ClientSession } from "mongoose";
import type { Role } from "../../domain/roles.js";
import type { LifecycleCommand, LifecycleHistory, LifecyclePage } from "../../contracts/procurement-lifecycle.js";
import { lcConflict, lcDigest, lcNewId } from "../../domain/procurement-lifecycle.js";
import { ProcurementLifecycleCommandModel } from "../../models/ProcurementLifecycleCommand.js";
import type { AuditService } from "../audit.service.js";
import type { PublicUser } from "../auth.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./access.js";
export interface LifecycleDependencies { audit: AuditService; now?:()=>Date; }
export const lcTransaction=<T>(work:(session:ClientSession)=>Promise<T>):Promise<T>=>mongoose.connection.transaction(work,{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});
export async function lcRunCommand<T>(deps:LifecycleDependencies,actor:PublicUser,projectId:string,input:LifecycleCommand,action:string,roles:readonly Role[],work:(session:ClientSession,project:LifecycleRow)=>Promise<T>,options:{allowCompleted?:boolean;entityId?:string;reason?:string|null}={}):Promise<T>{
  const digest=lcDigest({action,input});
  return lcTransaction(async session=>{
    const project=await requireLifecycleProject(actor,projectId,session,true,roles,options.allowCompleted);
    const prior=await ProcurementLifecycleCommandModel.findOne({projectId,actorId:actor.id,idempotencyKey:input.idempotencyKey}).session(session).lean();
    if(prior){if(prior.digest!==digest)lcConflict("This command key was already used for different data.");return prior.result as T;}
    const result=await work(session,project); const at=(deps.now??(()=>new Date()))(); const entityId=options.entityId??projectId;
    await ProcurementLifecycleCommandModel.create([{_id:lcNewId("command"),projectId,actorId:actor.id,actorName:actor.name,action,entityId,idempotencyKey:input.idempotencyKey,digest,result,reason:options.reason??null,occurredAt:at}],{session});
    await deps.audit.appendInMongoTransaction({actorId:actor.id,action:"procurement_lifecycle_action_recorded",entityType:"procurement_lifecycle",entityId,occurredAt:at.toISOString(),newValues:{projectId,action},reason:options.reason??null},session);
    return result;
  });
}
export async function lcHistory(projectId:string,session:ClientSession,entityId?:string,page={limit:30,offset:0}):Promise<LifecyclePage<LifecycleHistory>>{
  const filter={projectId,...(entityId?{entityId}:{})};
  const rows=await ProcurementLifecycleCommandModel.find(filter).sort({occurredAt:-1,_id:1}).skip(page.offset).limit(page.limit).session(session).lean();
  const total=await ProcurementLifecycleCommandModel.countDocuments(filter).session(session);
  return {items:rows.map(r=>({id:String(r._id),action:r.action,actorId:r.actorId,actorName:r.actorName,at:new Date(r.occurredAt).toISOString(),reason:r.reason??null})),total,...page};
}
