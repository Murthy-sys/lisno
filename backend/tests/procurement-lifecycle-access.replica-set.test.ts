import {beforeAll,afterAll,beforeEach,describe,it,expect} from "vitest";
import {startMongoReplicaSet} from "./helpers/mongo-replica-set.js";
import {seedLifecycleFixture,lifecycleAt,lifecycleActor} from "./fixtures/procurement-lifecycle.js";
import {createMemoryRepository} from "../src/repositories/memory.js";
import {createAuditService} from "../src/services/audit.service.js";
import {createProcurementLifecycleService} from "../src/services/procurement-lifecycle.service.js";
import {lcRunCommand,lcTransaction} from "../src/services/procurement-lifecycle/transaction.js";
import {requireLifecycleProject} from "../src/services/procurement-lifecycle/access.js";
import {ProcurementLifecycleCommandModel} from "../src/models/ProcurementLifecycleCommand.js";
import {ProcurementLifecycleStateModel} from "../src/models/ProcurementLifecycleState.js";
import {ProjectWorkflowTaskModel} from "../src/models/ProjectWorkflowTask.js";
import {UserModel} from "../src/models/User.js";
import {AuditEventModel} from "../src/models/AuditEvent.js";
import {AiEstimatorKnowledgeSectionModel} from "../src/models/AiEstimatorKnowledgeSection.js";
let replica:Awaited<ReturnType<typeof startMongoReplicaSet>>;
const deps={audit:createAuditService(createMemoryRepository()),now:()=>lifecycleAt};const service=createProcurementLifecycleService(deps);
beforeAll(async()=>{replica=await startMongoReplicaSet("lifecycle-foundation");for(const model of [ProcurementLifecycleStateModel,ProcurementLifecycleCommandModel,AuditEventModel])await model.syncIndexes();},120000);
beforeEach(async()=>{await replica.clear();});afterAll(async()=>{await replica?.stop();});
describe("scoped lifecycle commands and sources",()=>{
  it("requires current assigned Procurement and Finance identities",async()=>{
    const a=await seedLifecycleFixture("a"),b=await seedLifecycleFixture("b");
    await expect(service.get(b.buyer,a.projectId)).rejects.toMatchObject({status:404});
    await expect(lcTransaction(s=>requireLifecycleProject(b.finance,a.projectId,s))).rejects.toMatchObject({status:404});
    await expect(lcTransaction(s=>requireLifecycleProject(a.finance,a.projectId,s))).resolves.toHaveProperty("_id",a.projectId);
    const admin=lifecycleActor("sole-admin","super_admin");await UserModel.collection.insertOne({_id:admin.id,...admin,active:true} as any);
    await expect(service.get(admin,a.projectId)).resolves.toHaveProperty("projectId",a.projectId);
    await UserModel.collection.insertOne({_id:"second-admin",role:"super_admin",active:true} as any);
    await expect(service.get(admin,a.projectId)).rejects.toMatchObject({status:404});
  });
  it("does not write on read, adopts explicitly once, and revokes replay after reassignment",async()=>{
    const a=await seedLifecycleFixture();const before=await service.get(a.buyer,a.projectId);
    expect(before.source.items.map(i=>i.priority)).toEqual(["P1","P2","P3"]);
    expect(await ProcurementLifecycleStateModel.countDocuments()).toBe(0);
    const input={expectedVersion:0,sourceDigest:before.sourceDigest,idempotencyKey:"setup-lifecycle-1",policy:{timezone:"Asia/Kolkata",reviewIntervalDays:7,inspectionCount:2},reason:"Adopt this active project"};
    const first=await service.setup(a.buyer,a.projectId,input);expect(first.version).toBe(1);
    expect(await service.setup(a.buyer,a.projectId,input)).toEqual(first);expect(await ProcurementLifecycleCommandModel.countDocuments()).toBe(1);
    await expect(service.setup(a.buyer,a.projectId,{...input,reason:"A different command"})).rejects.toMatchObject({status:409});
    await ProjectWorkflowTaskModel.updateOne({_id:`${a.projectId}-procurement`},{$set:{assigneeUserId:"someone-else"}});
    await expect(service.setup(a.buyer,a.projectId,input)).rejects.toMatchObject({status:404});
  });
  it("rejects a stale Configuration digest and rolls back failed commands",async()=>{
    const a=await seedLifecycleFixture();const before=await service.get(a.buyer,a.projectId);
    await AiEstimatorKnowledgeSectionModel.updateOne({_id:`${a.lines[0]!.mainLineId}-overview`},{$set:{"payload.closurePriority":"P3"}});
    const command={expectedVersion:0,sourceDigest:before.sourceDigest,idempotencyKey:"stale-source-command",policy:{timezone:"Asia/Kolkata",reviewIntervalDays:7,inspectionCount:2},reason:"Adopt with stale data"};
    await expect(service.setup(a.buyer,a.projectId,command)).rejects.toMatchObject({status:409});expect(await ProcurementLifecycleStateModel.countDocuments()).toBe(0);
    await expect(lcRunCommand(deps,a.buyer,a.projectId,command,"failure",["procurement"],async()=>{throw new Error("synthetic failure");})).rejects.toThrow("synthetic failure");
    expect(await ProcurementLifecycleCommandModel.countDocuments()).toBe(0);expect(await AuditEventModel.countDocuments()).toBe(0);
  });
});
