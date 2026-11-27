import type { ClientSession } from "mongoose";
import type { LifecycleSource, LifecycleItem } from "../../contracts/procurement-lifecycle.js";
import { lcConflict, lcDigest } from "../../domain/procurement-lifecycle.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../../models/VendorWorkAssignment.js";
import { AiEstimatorKnowledgeMainLineModel } from "../../models/AiEstimatorKnowledgeMainLine.js";
import { procurementItemSourceSnapshot } from "../procurement.service.js";
import { readProcurementPriorities } from "../procurement-basket-priority.service.js";
import type { LifecycleRow } from "./access.js";

/** Caller authorizes first. Decision reads fence both approved scope and current Configuration. */
export async function readLifecycleSource(projectId:string,session:ClientSession,forWrite=false):Promise<LifecycleSource>{
  if(!session.inTransaction())throw new Error("Lifecycle source reads require a transaction.");
  let snapshot;
  try { snapshot=await procurementItemSourceSnapshot(projectId,session,forWrite); }
  catch(error){
    if(!(error instanceof ApiError)||![404,409].includes(error.status))throw error;
    if(forWrite)throw error;
    return {digest:lcDigest({projectId,available:false}),available:false,estimateId:null,estimateVersion:null,items:[],orders:[],blockers:[{code:"SOURCE_UNAVAILABLE",message:"Approved procurement scope is unavailable. Complete preparation or reconcile its source.",tab:"vendors"}]};
  }
  const lines=new Map(snapshot.allLineItems.map(line=>[line.key,line]));
  const mainLineIds=[...new Set(snapshot.allLineItems.flatMap(line=>line.source==="configuration"&&line.mainLineId?[line.mainLineId]:[]))];
  if(forWrite&&mainLineIds.length)await AiEstimatorKnowledgeMainLineModel.updateMany({_id:{$in:mainLineIds}},{$inc:{dependencyEpoch:1}},{session,timestamps:false});
  const priorities=await readProcurementPriorities(mainLineIds,session);
  const orders=await ProjectPurchaseOrderModel.find({projectId,approvedRevisionId:{$type:"string"},cancelledAt:null}).sort({_id:1}).session(session).lean() as LifecycleRow[];
  const revisions=await ProjectPurchaseOrderRevisionModel.find({projectId,_id:{$in:orders.map(order=>order.approvedRevisionId)}}).session(session).lean() as LifecycleRow[];
  const assignments=await VendorWorkAssignmentModel.find({projectId,status:{$ne:"superseded"}}).session(session).lean() as LifecycleRow[];
  const items:LifecycleItem[]=[]; const blockers:LifecycleSource["blockers"]=[];
  for(const order of orders){
    const revision=revisions.find(row=>row._id===order.approvedRevisionId&&row.orderId===order._id&&row.vendorId===order.vendorId&&row.revision===order.approvedRevision);
    if(!revision){blockers.push({code:"ORDER_SOURCE_UNAVAILABLE",message:`Issued scope is unavailable for ${order.orderNumber}.`,tab:"vendors",entityId:String(order._id)});continue;}
    for(const line of revision.lines as LifecycleRow[]){
      const approved=lines.get(line.sourceLineItemKey);
      const work=assignments.filter(row=>row.orderId===order._id&&row.orderRevision===revision.revision&&row.lineId===line.id&&row.vendorId===order.vendorId&&row.sourceLineItemKey===line.sourceLineItemKey);
      if(!approved||work.length!==1){blockers.push({code:"ITEM_SOURCE_UNAVAILABLE",message:`Reconcile the current assignment for ${line.itemName}.`,tab:"vendors",entityId:line.id});continue;}
      const assignment=work[0]!; const priority=approved.mainLineId?priorities.get(approved.mainLineId):null;
      items.push({id:String(assignment._id),assignmentId:String(assignment._id),sourceLineItemKey:line.sourceLineItemKey,mainLineId:approved.mainLineId??null,basketId:line.sourceSectionId,itemName:approved.mainLineName??line.itemName,roomName:line.roomName,roomId:approved.roomId??null,orderId:String(order._id),orderRevisionId:String(revision._id),lineId:line.id,vendorId:order.vendorId,vendorName:order.vendorName,scopeType:line.scopeType??"supply_and_execution",targetDate:line.targetDate??null,priority:priority?.state==="resolved"?priority.value:null,priorityRevisionId:priority?.revision?.id??null,vendorProgress:assignment.progress??null,vendorNote:assignment.note??null,vendorStatus:assignment.status??null});
    }
  }
  const result:Omit<LifecycleSource,"digest">={available:blockers.length===0,estimateId:snapshot.estimateId,estimateVersion:snapshot.estimateVersion,items,orders:orders.map(row=>({id:String(row._id),revisionId:row.approvedRevisionId,revision:row.approvedRevision,vendorId:row.vendorId,vendorName:row.vendorName,orderNumber:row.orderNumber,awardId:row.tenderAwardId??null,issuedAt:row.approvedAt?new Date(row.approvedAt).toISOString():null,totalPaise:row.approvedTotalPaise})),blockers};
  const digest=lcDigest({projectId,estimateId:snapshot.estimateId,estimateVersion:snapshot.estimateVersion,reviewRound:snapshot.estimateReviewRoundId,orders:result.orders,items:items.map(({vendorProgress:_progress,vendorNote:_note,vendorStatus:_status,...item})=>item),priorities:[...priorities],blockers});
  return {...result,digest};
}
export function assertLifecycleSource(source:LifecycleSource,digest:string):void{
  if(!source.available)lcConflict(source.blockers[0]?.message??"Procurement source is unavailable.");
  if(source.digest!==digest)lcConflict("Approved scope or Configuration changed. Refresh and reconcile before continuing.");
}
