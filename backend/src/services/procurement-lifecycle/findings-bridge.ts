import type { ClientSession } from "mongoose";
import type { LifecycleItem } from "../../contracts/procurement-lifecycle.js";
import { lcConflict,lcDigest,lcMissing } from "../../domain/procurement-lifecycle.js";
import { ProjectSnagModel } from "../../models/ProjectSnag.js";
import { ProcurementFindingModel } from "../../models/ProcurementFinding.js";
import { ProcurementLifecycleEvidenceModel } from "../../models/ProcurementLifecycleEvidence.js";
import type { FileStorage } from "../../storage/storage.js";
import { createWorkflowEvidenceStorage } from "../workflow-evidence-storage.js";
import { handoverEvidenceEntityId } from "../procurement-handover.service.js";
import type { PublicUser } from "../auth.service.js";
import { requireProjectSnagOwner } from "../project-manager/client.js";
import { pmRecord } from "../project-manager/common.js";
import { requireLifecycleProject } from "./access.js";
import { readLifecycleSource } from "./source.js";
import { lcTransaction, type LifecycleDependencies } from "./transaction.js";
interface FindingInput {actor:PublicUser;projectId:string;findingId:string;sourceItem:LifecycleItem|null;title:string;note:string;ownerId:string;dueAt:string;evidenceIds:string[];origin:{kind:"handover"|"inspection"|"urgent";entityId:string;checkId?:string};}
export function createLifecycleFindingBridge(deps:LifecycleDependencies){
  return async(input:FindingInput,session:ClientSession):Promise<{snagId:string}>=>{
    const {actor,projectId}=input;
    const project=await requireLifecycleProject(actor,projectId,session,true,["procurement"]);
    const owner=await requireProjectSnagOwner(project,input.ownerId,session);
    const source=await readLifecycleSource(projectId,session,true);
    const item=input.sourceItem?source.items.find(row=>row.id===input.sourceItem!.id):null;
    if(input.sourceItem&&(!item||item.orderRevisionId!==input.sourceItem.orderRevisionId))lcConflict("The finding's work source changed.");
    const existing=await ProjectSnagModel.findOne({projectId,procurementFindingId:input.findingId}).session(session).lean();
    if(existing)return {snagId:String(existing._id)};
    const id=`procurement-snag-${lcDigest([projectId,input.findingId]).slice(0,40)}`;const at=(deps.now??(()=>new Date()))();
    await ProjectSnagModel.create([{_id:id,projectId,procurementFindingId:input.findingId,assignmentId:item?.assignmentId??null,sourceLineItemKey:item?.sourceLineItemKey??null,sourceSectionId:item?.basketId??null,vendorId:item?.vendorId??null,vendorName:item?.vendorName??null,roomId:item?.roomId??null,roomName:item?.roomName??null,tradeName:null,ownerId:owner.id,title:input.title,description:input.note,severity:"warning",status:"open",dueAt:new Date(input.dueAt),version:1,postHandover:false,createdById:actor.id,createdAt:at,updatedAt:at,evidenceIds:[]}],{session});
    await pmRecord(deps,{projectId,entityId:id,family:"snag",actor,key:`proc-finding-${lcDigest(input.findingId).slice(0,40)}`,payload:{findingId:input.findingId,origin:input.origin},action:"create",version:1,reason:input.note,result:{id,kind:"snag",title:input.title,status:"open",severity:"warning",version:1,sourceToken:null,description:input.note,ownerId:owner.id,ownerName:owner.name,facts:[{label:"Reported through",value:"Procurement inspection or handover"}],actions:[]},recipientIds:[owner.id,...(project.currentProjectManagerId?[project.currentProjectManagerId]:[])]},session);
    return {snagId:id};
  };
}

/** Site Manager access is restricted to evidence explicitly linked to the canonical snag's finding. */
export function createProcurementFindingEvidenceService(storage: FileStorage) {
  const evidence = createWorkflowEvidenceStorage(storage);
  async function authorize(actor: PublicUser, projectId: string, snagId: string, evidenceId: string, session: ClientSession) {
    await requireLifecycleProject(actor, projectId, session, false, ["site_manager"]);
    const snag = await ProjectSnagModel.findOne({ _id: snagId, projectId, procurementFindingId: { $type: "string" } }).session(session).lean();
    if (!snag) lcMissing();
    const finding = await ProcurementFindingModel.findOne({ _id: snag.procurementFindingId, projectId, snagId,
      evidenceIds: evidenceId, "origin.kind": { $in: ["inspection", "handover", "urgent"] } }).session(session).lean();
    if (!finding) lcMissing();
    const purpose = finding.origin.kind === "inspection" ? "inspection" : "handover";
    const entityId = finding.origin.kind === "handover" ? handoverEvidenceEntityId(projectId) : finding.origin.entityId;
    const row = await ProcurementLifecycleEvidenceModel.findOne({ _id: evidenceId, projectId, entityId, purpose })
      .select("+storageReference +sha256").session(session).lean();
    if (!row) lcMissing();
    return row;
  }
  return {
    async read(actor: PublicUser, projectId: string, snagId: string, evidenceId: string) {
      const row = await lcTransaction(session => authorize(actor, projectId, snagId, evidenceId, session));
      const stream = await evidence.openVerifiedMedia({ ...row, id: String(row._id) } as any);
      try { await lcTransaction(session => authorize(actor, projectId, snagId, evidenceId, session)); }
      catch (error) { stream.destroy(); throw error; }
      return { stream, mimeType: String(row.mimeType), filename: String(row.originalFilename) };
    }
  };
}
