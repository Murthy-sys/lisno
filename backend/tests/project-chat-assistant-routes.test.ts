import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectChatRouter } from "../src/routes/project-chat.js";
import { createAuthService } from "../src/services/auth.service.js";
import { createProjectChatAssistantService } from "../src/services/project-chat-assistant.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { chatSend, createChatFixture } from "./helpers/project-chat.js";

const secret = "synthetic-assistant-http-tests-secret-long";
function fixture() {
  const f = createChatFixture();
  const sources: AssistantReadSources = {status: async () => ({facts: [], freshness: []}), execution: async () => ({facts: [], freshness: []}), searchCatalogue: async () => [], recommendations: async () => ({rules: [], freshness: []}), preview: async () => {throw new Error("unused");}, revalidate: async () => true};
  const assistant = createProjectChatAssistantService({chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, enabled: true,
    provider: {generate: async () => ({kind: "no_answer", facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []})}, readSources: () => sources});
  vi.spyOn(assistant.runtime, "wake").mockImplementation(() => {});
  const service = createProjectChatService({repository: f.repository, chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, assistant});
  const auth = createAuthService(f.repository, {jwtSecret: secret, jwtExpiresInSeconds: 3600}, {clock: f.clock});
  const app = express(); app.use(express.json()); app.use("/api/v1", createProjectChatRouter(auth, service, undefined, assistant)); app.use(errorHandler);
  const token = (id: string, sessionVersion = 1) => jwt.sign({id, role: f.actor(id).role, sessionVersion, exp: Math.floor(Math.max(Date.now(), f.clock().getTime()) / 1000) + 3600}, secret);
  return {...f, app, token, service, assistant};
}

describe("assistant HTTP permission boundaries", () => {
  it("requires the owning current Client and strict communication-only input", async () => {
    const f = fixture(), message = await f.service.send(f.actor("client-a"), "a", chatSend("Estimate status?"));
    const path = `/api/v1/projects/a/chat/messages/${message.id}/assistant/request`;
    const body = {expectedVersion: 1, idempotencyKey: "client-asks-now"};
    expect((await request(f.app).post(path).send(body)).status).toBe(401);
    expect((await request(f.app).post(path).auth(f.token("super"), {type: "bearer"}).send(body)).status).toBe(403);
    expect((await request(f.app).post(path).auth(f.token("sales-a"), {type: "bearer"}).send(body)).status).toBe(403);
    expect((await request(f.app).post(path).auth(f.token("client-b"), {type: "bearer"}).send(body)).status).toBe(404);
    expect((await request(f.app).post(path).auth(f.token("client-a", 2), {type: "bearer"}).send(body)).status).toBe(401);
    for (const injected of [{...body, projectId: "b"}, {...body, author: {id: "lisno-ai"}}, {...body, amountPaise: 1}, {...body, tool: "update_estimate"}]) {
      expect((await request(f.app).post(path).auth(f.token("client-a"), {type: "bearer"}).send(injected)).status).toBe(400);
    }
    expect((await request(f.app).post(path).auth(f.token("client-a"), {type: "bearer"}).send({...body, expectedVersion: 2})).status).toBe(409);
    const accepted = await request(f.app).post(path).auth(f.token("client-a"), {type: "bearer"}).send(body);
    expect(accepted.status).toBe(200); expect(accepted.headers["cache-control"]).toBe("no-store");
    expect(accepted.body.data).toMatchObject({runId: message.assistant?.runId, generation: 1});
    const replay = await request(f.app).post(path).auth(f.token("client-a"), {type: "bearer"}).send(body);
    expect(replay.body.data.runId).toBe(accepted.body.data.runId);
  });
  it("delivers only current same-project results with no-store and rechecks revocation", async () => {
    const f = fixture(), question = await f.service.send(f.actor("client-a"), "a", chatSend("Estimate status?"));
    await f.assistant.request(f.actor("client-a"), "a", question.id, {expectedVersion: 1, idempotencyKey: "http-test-result"});
    await f.assistant.runtime.runOnce();
    const answer = (await f.service.messages(f.actor("client-a"), "a", {})).items.find(message => message.author.kind === "service")!;
    const path = `/api/v1/projects/a/chat/assistant/results/${answer.assistant!.resultId}`;
    const read = await request(f.app).get(path).auth(f.token("electric-a"), {type: "bearer"});
    expect(read.status).toBe(200); expect(read.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(read.body)).not.toMatch(/sessionVersion|freshness|leaseToken|providerAttempts/);
    expect((await request(f.app).get(path).auth(f.token("client-b"), {type: "bearer"})).status).toBe(404);
    expect((await request(f.app).get(path.replace("projects/a/", "projects/b/")).auth(f.token("client-b"), {type: "bearer"})).status).toBe(404);
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    expect((await request(f.app).get(path).auth(f.token("electric-a"), {type: "bearer"})).status).toBe(404);
  });
});
