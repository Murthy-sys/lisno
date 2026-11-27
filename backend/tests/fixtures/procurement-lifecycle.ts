import { UserModel } from "../../src/models/User.js";
import { ProjectModel } from "../../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../../src/models/ProjectWorkflowTask.js";
import { EstimateModel } from "../../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../../src/models/EstimateClientReviewRound.js";
import { ProjectPurchaseOrderModel } from "../../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../../src/models/VendorWorkAssignment.js";
import { AiEstimatorKnowledgeMainLineModel } from "../../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../../src/models/AiEstimatorKnowledgeSection.js";
import type { PublicUser } from "../../src/services/auth.service.js";
export const lifecycleAt=new Date("2026-11-27T06:00:00Z");
export function lifecycleActor(id:string,role:PublicUser["role"]):PublicUser{return {id,role,name:`Synthetic ${id}`,email:`${id}@example.invalid`};}
export async function seedLifecycleFixture(suffix="a"){
  const projectId=`lifecycle-${suffix}`,buyer=lifecycleActor(`buyer-${suffix}`,"procurement"),finance=lifecycleActor(`finance-${suffix}`,"finance_head"),manager=lifecycleActor(`manager-${suffix}`,"site_manager"),client=lifecycleActor(`client-${suffix}`,"client");
  for(const actor of [buyer,finance,manager,client])await UserModel.collection.insertOne({_id:actor.id,...actor,active:true} as any);
  await ProjectModel.collection.insertOne({_id:projectId,name:`Synthetic project ${suffix}`,status:"active",programManagerId:manager.id,clientId:client.id,assignedDesignerIds:[],completionAuthority:"vendor_client",completionAuthorityVersion:1,completionDecisionId:null,siteCompletionFenceEpoch:0} as any);
  for(const [kind,actor] of [["procurement",buyer],["finance",finance],["site_execution",manager]] as const)await ProjectWorkflowTaskModel.collection.insertOne({_id:`${projectId}-${kind}`,projectId,estimateId:`${projectId}-estimate`,designPlanVersion:1,kind,assigneeRole:actor.role,assigneeUserId:actor.id,status:"in_progress",version:1,supersededAt:null} as any);
  const lines=[1,2,3].map((priority)=>({id:`${projectId}-source-${priority}`,source:"configuration",itemType:"main_line",catalogueId:`${projectId}-main-${priority}`,mainLineId:`${projectId}-main-${priority}`,mainLineName:"Repeated item name",roomId:`room-${priority}`,roomName:`Room ${priority}`,mainBasketId:`${projectId}-basket`,mainBasketName:"Interiors",subBasketId:`${projectId}-sub`,subBasketName:"Installation",specification:"Synthetic installation",quantity:1,included:true,unit:"nos",rate:priority*100,amount:priority*100,ratePaise:priority*10000,amountPaise:priority*10000,classification:"special",pricingMode:"pmc"}));
  await EstimateModel.collection.insertOne({_id:`${projectId}-estimate`,projectId,version:2,status:"client_approved",designPlanStatus:"approved",designPlanVersion:1,designPlanApprovedAt:lifecycleAt,designPlanApprovedById:client.id,designPlanApprovalSource:"client_portal",procurementSourceEpoch:0,lineItems:lines} as any);
  await EstimateClientReviewRoundModel.collection.insertOne({_id:`${projectId}-review`,projectId,estimateId:`${projectId}-estimate`,estimateVersion:1,status:"approved",decision:"approve",decisionSource:"client_portal",decidedById:client.id,decidedAt:lifecycleAt,estimateSnapshot:{lineItems:lines,subtotalPaise:60000,gstPaise:0,totalPaise:60000,subtotal:600,gst:0,total:600}} as any);
  const orderId=`${projectId}-order`,revisionId=`${orderId}-revision`,vendorId=`${projectId}-vendor`;
  const orderLines=lines.map((line,i)=>({id:`${orderId}-line-${i}`,procurementItemId:`${projectId}-item-${i}`,sourceLineItemKey:line.id,sourceSectionId:line.mainBasketId,roomName:line.roomName,itemName:line.mainLineName,scopeType:"execution",targetDate:"2026-12-20",netPaise:line.amountPaise,totalPaise:line.amountPaise}));
  await ProjectPurchaseOrderModel.collection.insertOne({_id:orderId,projectId,vendorId,vendorName:"Synthetic vendor",orderNumber:`PO-${suffix}`,estimateId:`${projectId}-estimate`,status:"approved",approvedRevisionId:revisionId,approvedRevision:1,approvedTotalPaise:60000,cancelledAt:null,approvedAt:lifecycleAt} as any);
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({_id:revisionId,projectId,orderId,vendorId,revision:1,lines:orderLines} as any);
  for(const [i,line] of lines.entries()){
    const mainLineId=line.mainLineId;
    await AiEstimatorKnowledgeMainLineModel.collection.insertOne({_id:mainLineId,name:line.mainLineName,status:"active",basketId:line.mainBasketId,subBasketId:line.subBasketId,activeRevisionId:`${mainLineId}-active`,version:1,dependencyEpoch:0} as any);
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({_id:`${mainLineId}-active`,mainLineId,status:"active",version:1} as any);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({_id:`${mainLineId}-overview`,mainLineId,revisionId:`${mainLineId}-active`,sectionKey:"overview",payload:{closurePriority:`P${i+1}`}} as any);
    await VendorWorkAssignmentModel.collection.insertOne({_id:`${projectId}-assignment-${i}`,projectId,vendorId,orderId,orderRevision:1,lineId:orderLines[i]!.id,sourceLineItemKey:line.id,sourceSectionId:line.mainBasketId,status:"in_progress",progress:i*10,note:"Synthetic update",version:1} as any);
  }
  return {projectId,buyer,finance,manager,client,orderId,revisionId,vendorId,lines};
}
