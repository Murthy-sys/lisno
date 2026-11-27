import type { ClientSession } from "mongoose";
import type { LifecycleState,LifecycleSummary } from "../contracts/procurement-lifecycle.js";
import {lcConflict,lcParse,lcSetupSchema,lcPolicySchema,lcLocalDate} from "../domain/procurement-lifecycle.js";
import {ProcurementLifecycleStateModel} from "../models/ProcurementLifecycleState.js";
import {ProjectModel} from "../models/Project.js";
import type {PublicUser} from "./auth.service.js";
import {requireLifecycleProject,type LifecycleRow} from "./procurement-lifecycle/access.js";
import {lcRunCommand,lcTransaction,type LifecycleDependencies} from "./procurement-lifecycle/transaction.js";
import {readLifecycleSource,assertLifecycleSource} from "./procurement-lifecycle/source.js";
import { ensureReviewRoundInSession } from "./procurement-progress.service.js";
import { readProjectSnagOwners } from "./project-manager/client.js";
import { readProcurementReadiness } from "./procurement-readiness.service.js";
import { listPaymentAlertSources } from "./procurement-payments.service.js";
export function lifecycleStateDto(row:LifecycleRow):LifecycleState{return {projectId:row.projectId,version:row.version,activatedAt:new Date(row.activatedAt).toISOString(),activatedById:row.activatedById,policy:row.policy,adoption:row.adoption,sourceDigest:row.sourceDigest};}
export async function requireLifecycleState(projectId:string,session:ClientSession):Promise<LifecycleRow>{const state=await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();if(!state)lcConflict("Set up the procurement lifecycle before recording project activity.");return state;}
export function createProcurementLifecycleService(deps:LifecycleDependencies){
  const now=deps.now??(()=>new Date());
  async function summary(actor:PublicUser,projectId:string,session:ClientSession):Promise<LifecycleSummary>{
    const project=await requireLifecycleProject(actor,projectId,session,false,["procurement","super_admin"]);
    const state=await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();
    const source=await readLifecycleSource(projectId,session);
    const legacy=project.status==="completed"&&!state;
    const readiness=state&&project.status!=="completed"?await readProcurementReadiness(projectId,session,now()):null;
    const payments=state?await listPaymentAlertSources(projectId,session,now()):null;
    const attention={overduePayments:payments?payments.filter(row=>row.kind==="payment"&&row.dueDate&&row.dueDate<lcLocalDate(now(),row.timezone)).length:null,progressActions:readiness?readiness.blockers.filter(row=>row.tab==="progress").length:null,handoverActions:readiness?readiness.blockers.filter(row=>row.tab==="handover").length:null,signoffBlockers:readiness?.blockers.length??null};
    const blockers=[...source.blockers,...(!state&&!legacy?[{code:"LIFECYCLE_SETUP_REQUIRED",message:"Set up progress checks and the project inspection policy.",tab:"progress" as const}]:[])];
    return {projectId,projectName:String(project.name),projectStatus:String(project.status),serverNow:now().toISOString(),version:state?.version??0,sourceDigest:source.digest,availability:legacy?"legacy_completed":!source.available?"source_unavailable":state?"available":"setup_required",state:state?lifecycleStateDto(state):null,source,blockers,attention,findingOwners:await readProjectSnagOwners(project,session),allowedActions:actor.role==="procurement"&&project.status!=="completed"?(state?["policy"]:source.available&&source.orders.length?["setup"]:[]):[]};
  }
  return {
    get:(actor:PublicUser,projectId:string)=>lcTransaction(session=>summary(actor,projectId,session)),
    async setup(actor:PublicUser,projectId:string,value:unknown){const input=lcParse(lcSetupSchema,value);return lcRunCommand(deps,actor,projectId,input,"setup",["procurement"],async(session,project)=>{
      if(input.expectedVersion!==0||await ProcurementLifecycleStateModel.exists({_id:projectId}).session(session))lcConflict("This project's lifecycle is already set up.");
      if(project.status!=="active")lcConflict("Start active project execution before setting up checks.");
      const source=await readLifecycleSource(projectId,session,true);assertLifecycleSource(source,input.sourceDigest);if(!source.orders.length)lcConflict("Issue an approved vendor order before setting up checks.");
      const at=now();
      await ProcurementLifecycleStateModel.create([{_id:projectId,projectId,version:1,activatedAt:at,activatedById:actor.id,policy:input.policy,adoption:"existing",sourceDigest:source.digest,updatedAt:at,updatedById:actor.id}],{session});
      await ensureReviewRoundInSession(projectId,session,at,source);
      if(project.completionAuthority!=="vendor_client")await ProjectModel.updateOne({_id:projectId,status:"active",completionDecisionId:null},{$set:{completionAuthority:"vendor_client"},$inc:{completionAuthorityVersion:1}},{session,timestamps:false});
      return summary(actor,projectId,session);
    },{reason:input.reason});},
    async policy(actor:PublicUser,projectId:string,value:unknown){const input=lcParse(lcPolicySchema,value);return lcRunCommand(deps,actor,projectId,input,"policy",["procurement"],async session=>{
      const source=await readLifecycleSource(projectId,session,true);assertLifecycleSource(source,input.sourceDigest);const state=await requireLifecycleState(projectId,session);
      if(state.version!==input.expectedVersion)lcConflict();
      await ensureReviewRoundInSession(projectId,session,now(),source);
      // Inspection count is owned by the versioned inspection plan once visits exist.
      if(input.policy.inspectionCount!==state.policy.inspectionCount)lcConflict("Change the inspection count through its plan before the first inspection.");
      if(input.policy.timezone!==state.policy.timezone)lcConflict("The project timezone is fixed after activation so original deadlines remain unambiguous.");
      await ProcurementLifecycleStateModel.updateOne({_id:projectId,version:input.expectedVersion},{$set:{policy:input.policy,sourceDigest:source.digest,updatedAt:now(),updatedById:actor.id},$inc:{version:1}},{session,runValidators:true});return summary(actor,projectId,session);
    },{reason:input.reason});}
  };
}
