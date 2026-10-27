import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { insertChatMongoFixture, chatModels } from "./helpers/project-chat-mongo.js";
import { chatSend } from "./helpers/project-chat.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectChatMessageModel } from "../src/models/ProjectChat.js";
import { ProjectModel } from "../src/models/Project.js";
import { chatUser } from "./helpers/project-chat.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("chat-membership-mutation"); for (const model of chatModels)
    await model.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());
async function fencedMutation(mutate: (session: mongoose.ClientSession) => Promise<unknown>) { const session = await mongoose.startSession(); try {
    await session.withTransaction(async () => { await createMongoRepository(session).coordinateAuthorizationMutation(); await mutate(session); });
}
finally {
    await session.endSession();
} }
describe("project chat authorization source fence", () => {
    it("loads assigned PM in Mongo and revokes reads, retries and prepared stream delivery on reassignment", async () => {
        const f = await insertChatMongoFixture();
        for (const id of ["pm-a", "pm-b"]) { const { id: _id, ...user } = chatUser(id, "site_manager"); await UserModel.create({ ...user, _id }); }
        const actor = { id: "pm-a", role: "site_manager" as const, sessionVersion: 1, expiresAt: Math.floor(f.clock().getTime() / 1000) + 3600 };
        await fencedMutation(session => ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: "pm-a" } }, { session }));
        const summary = await f.service.summary(actor, "a");
        const input = chatSend("Synthetic PM project update");
        await f.service.send(actor, "a", input);
        expect((await f.service.events(actor, "a", summary.cursor)).events.length).toBeGreaterThan(0);
        await fencedMutation(session => ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: "pm-b" } }, { session }));
        await expect(f.service.summary(actor, "a")).rejects.toMatchObject({ status: 404 });
        await expect(f.service.send(actor, "a", input)).rejects.toMatchObject({ status: 404 });
        let delivered = false;
        await expect(f.service.authorizeDelivery(actor, "a", () => { delivered = true; })).rejects.toMatchObject({ status: 404 });
        expect(delivered).toBe(false);
        await expect(f.service.summary({ ...actor, id: "pm-b" }, "a")).resolves.toBeDefined();
    });
    it("rejects a queued send after a completed trade reassignment and permits the new named assignee", async () => {
        const f = await insertChatMongoFixture();
        const worker = f.actor("electric-a");
        const session = await mongoose.startSession();
        let release!: () => void;
        const unblock = new Promise<void>((resolve) => { release = resolve; });
        let acquired!: () => void;
        const ready = new Promise<void>((resolve) => { acquired = resolve; });
        const source = session.withTransaction(async () => { await createMongoRepository(session).coordinateAuthorizationMutation(); await ProjectWorkflowTaskModel.updateOne({ _id: "trade-electric" }, { $set: { assigneeUserId: "electric-b" } }, { session }); acquired(); await unblock; });
        await ready;
        const sending = f.service.send(worker, "a", chatSend("Stale assignee"));
        const result = expect(sending).rejects.toMatchObject({ status: 404 });
        release();
        await source;
        await session.endSession();
        await result;
        expect(await ProjectChatMessageModel.countDocuments()).toBe(0);
        await expect(f.service.send(f.actor("electric-b"), "a", chatSend("Current assignee"))).resolves.toMatchObject({ author: { id: "electric-b" } });
    }, 30000);
    it("does not serve stored retry success after grant revocation or active/session changes", async () => {
        const f = await insertChatMongoFixture();
        const admin = f.actor("admin-a"), worker = f.actor("electric-a");
        const input = chatSend("Admin original");
        await f.service.send(admin, "a", input);
        await fencedMutation(session => ProjectAccessGrantModel.updateOne({ _id: "grant-admin-a" }, { $set: { active: false, revokedById: "super", revokedAt: f.clock(), revocationReason: "Removed" } }, { session }));
        await expect(f.service.send(admin, "a", input)).rejects.toMatchObject({ status: 404 });
        await expect(f.service.events(admin, "a", undefined)).rejects.toMatchObject({ status: 404 });
        await fencedMutation(session => UserModel.updateOne({ _id: worker.id }, { $inc: { sessionVersion: 1 } }, { session }));
        await expect(f.service.summary(worker, "a")).rejects.toMatchObject({ status: 401 });
        const fresh = { ...worker, sessionVersion: 2 };
        await expect(f.service.summary(fresh, "a")).resolves.toBeDefined();
        await fencedMutation(session => UserModel.updateOne({ _id: worker.id }, { $set: { active: false } }, { session }));
        await expect(f.service.send(fresh, "a", chatSend())).rejects.toMatchObject({ status: 401 });
    });
    it("does not enqueue an already prepared event batch after completed membership revocation", async () => {
        const f = await insertChatMongoFixture();
        const actor = f.actor("admin-a");
        const baseline = await f.service.summary(actor, "a");
        await f.service.send(f.actor("client-a"), "a", chatSend("Prepared before revocation"));
        const prepared = await f.service.events(actor, "a", baseline.cursor);
        expect(prepared.events).toHaveLength(1);
        await fencedMutation(session => ProjectAccessGrantModel.updateOne(
            {_id:"grant-admin-a"},
            {$set:{active:false,revokedById:"super",revokedAt:f.clock(),revocationReason:"Removed"}},
            {session}
        ));
        let enqueued = false;
        await expect(f.service.authorizeDelivery(actor, "a", () => { enqueued = true; })).rejects.toMatchObject({status:404});
        expect(enqueued).toBe(false);
        await f.service.authorizeDelivery(f.actor("client-a"), "a", () => { enqueued = true; });
        expect(enqueued).toBe(true);
    });

});
