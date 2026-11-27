import type { ClientSession } from "mongoose";
import { z } from "zod";
import type { LifecycleEvidence } from "../../contracts/procurement-lifecycle.js";
import { lcConflict,lcMissing,lcNewId,lcParse,lcId } from "../../domain/procurement-lifecycle.js";
import { ProcurementLifecycleEvidenceModel,ProcurementLifecycleEvidenceCleanupModel } from "../../models/ProcurementLifecycleEvidence.js";
import type { ValidatedUpload } from "../../middleware/upload.js";
import type { ValidatedWorkflowMedia } from "../../middleware/workflow-evidence-upload.js";
import type { FileStorage } from "../../storage/storage.js";
import type { PublicUser } from "../auth.service.js";
import { createWorkflowEvidenceStorage } from "../workflow-evidence-storage.js";
import { requireLifecycleProject,type LifecycleRow } from "./access.js";
import { lcTransaction } from "./transaction.js";
const inputSchema=z.object({entityId:lcId,purpose:z.enum(["payment","inspection","handover"])}).strict();
const dto=(row:LifecycleRow):LifecycleEvidence=>({id:String(row._id??row.id),entityId:row.entityId,purpose:row.purpose,name:row.originalFilename,mimeType:row.mimeType,kind:row.kind});
export async function assertLifecycleEvidence(projectId:string,entityId:string,ids:readonly string[],session:ClientSession,purpose?:LifecycleEvidence["purpose"]):Promise<LifecycleRow[]>{
  if(ids.length>12||new Set(ids).size!==ids.length)lcConflict("Choose at most twelve distinct files.");
  const filter={projectId,entityId,_id:{$in:ids},...(purpose?{purpose}:{})};
  const rows=await ProcurementLifecycleEvidenceModel.find(filter).session(session).lean();
  if(rows.length!==ids.length)lcConflict("Evidence must belong to this project, record, and purpose.");
  if(ids.length)await ProcurementLifecycleEvidenceModel.updateMany(filter,{$inc:{referenceEpoch:1}},{session});
  return rows;
}
export function createLifecycleEvidenceService(storage:FileStorage){
  const evidence=createWorkflowEvidenceStorage(storage);
  async function cleanup(reference:string){try{if(!await ProcurementLifecycleEvidenceModel.exists({storageReference:reference}))await storage.delete(reference);await ProcurementLifecycleEvidenceCleanupModel.deleteOne({_id:reference});}catch{await ProcurementLifecycleEvidenceCleanupModel.updateOne({_id:reference},{$setOnInsert:{createdAt:new Date()},$inc:{attempts:1}},{upsert:true});}}
  async function authorize(actor:PublicUser,projectId:string,purpose:string,session:ClientSession,mutation:boolean){
    await requireLifecycleProject(actor,projectId,session,mutation,purpose==="payment"?["procurement","finance_head","super_admin"]:mutation?["procurement"]:["procurement","super_admin","site_manager"],purpose==="payment");
  }
  return {
    async upload(actor:PublicUser,projectId:string,value:unknown,media:ValidatedWorkflowMedia[],document?:ValidatedUpload,signal?:AbortSignal){
      const input=lcParse(inputSchema,value);await lcTransaction(session=>authorize(actor,projectId,input.purpose,session,false));
      if(media.length+(document?1:0)<1||media.length+(document?1:0)>12)lcConflict("Choose between one and twelve evidence files.");
      const saved:LifecycleRow[]=[];
      try{
        for(const file of media)saved.push(await evidence.saveMedia(file,signal));
        if(document)saved.push({...await evidence.saveProof(document),id:lcNewId("evidence"),kind:document.mimeType.startsWith("image/")?"image":"document"});
        const result=await lcTransaction(async session=>{
          await authorize(actor,projectId,input.purpose,session,true);const result:LifecycleEvidence[]=[];
          for(const file of saved){const existing=await ProcurementLifecycleEvidenceModel.findOne({projectId,entityId:input.entityId,uploaderId:actor.id,sha256:file.sha256}).session(session).lean();
            if(existing){if(existing.purpose!==input.purpose)lcConflict("Evidence purpose changed.");result.push(dto(existing));}
            else {const {id,...stored}=file;const [row]=await ProcurementLifecycleEvidenceModel.create([{...stored,_id:id,projectId,...input,uploaderId:actor.id,createdAt:new Date()}],{session});result.push(dto(row!.toObject()));}}
          return result;
        });
        for(const file of saved)await cleanup(file.storageReference);
        return {items:result};
      }catch(error){for(const file of saved)await cleanup(file.storageReference);throw error;}
    },
    async read(actor:PublicUser,projectId:string,id:string){
      const row=await lcTransaction(async session=>{const record=await ProcurementLifecycleEvidenceModel.findOne({_id:id,projectId}).select("+storageReference +sha256").session(session).lean();if(!record)lcMissing();await authorize(actor,projectId,record.purpose,session,false);return record;});
      const stream=await evidence.openVerifiedMedia({...row,id:String(row._id)} as any);
      try{await lcTransaction(session=>authorize(actor,projectId,row.purpose,session,false));}catch(error){stream.destroy();throw error;}
      return {stream,mimeType:row.mimeType,filename:row.originalFilename};
    },
    async cleanupBatch(){const rows=await ProcurementLifecycleEvidenceCleanupModel.find({}).sort({attempts:1,createdAt:1,_id:1}).limit(20).lean();for(const row of rows)await cleanup(String(row._id));}
  };
}
