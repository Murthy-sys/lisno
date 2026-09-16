// Disposable replica-set transport fixture. Never uses environment database configuration.
import express from "express";
import mongoose from "mongoose";
import path from "node:path";
import { tmpdir } from "node:os";
import { createMongoRepository } from "../../src/repositories/mongo.js";
import { createMongoProjectChatRepository } from "../../src/repositories/project-chat-mongo.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { createAuditService } from "../../src/services/audit.service.js";
import { createProjectChatService } from "../../src/services/project-chat.service.js";
import { createProjectChatEventsHub } from "../../src/services/project-chat-events.service.js";
import { createProjectChatStreamService } from "../../src/services/project-chat-stream.service.js";
import { createProjectChatTypingService } from "../../src/services/project-chat-typing.service.js";
import { createProjectChatRouter } from "../../src/routes/project-chat.js";
import { createProjectChatEventsRouter } from "../../src/routes/project-chat-events.js";
import { createProjectChatAttachmentsRouter } from "../../src/routes/project-chat-attachments.js";
import { createProjectChatAttachmentService } from "../../src/services/project-chat-attachments.service.js";
import { createLocalStorage } from "../../src/storage/local-storage.js";
import { errorHandler } from "../../src/middleware/errors.js";

const uri = process.argv[2]!;
if (!uri.startsWith("mongodb://127.0.0.1:")) throw new Error("Only disposable loopback Mongo is allowed");
await mongoose.connect(uri, { autoIndex: false });
const clock = () => process.argv[5] === "advancing" ? new Date() : new Date("2026-09-16T10:00:00.000Z");
const repository = createMongoRepository();
const auth = createAuthService(repository, { jwtSecret: "chat-process-fixture-secret-at-least-32-characters", jwtExpiresInSeconds: 3600 }, { clock });
const audit = createAuditService(repository);
const chatRepository = createMongoProjectChatRepository(repository);
const chat = createProjectChatService({ repository, audit, clock, chatRepository });
const typing = createProjectChatTypingService({ chatRepository, clock });
const stream = createProjectChatStreamService({ auth, chat, typing, hub: createProjectChatEventsHub({ watchChanges: process.argv[3] !== "poll", pollIntervalMs: 250 }) });
const app = express();
app.use(express.json());
if (process.argv[4]) {
  const storageRoot = path.resolve(process.argv[4]);
  if (![tmpdir(), "/tmp", "/private/tmp"].some(root => {
    const relative = path.relative(path.resolve(root), storageRoot);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  })) throw new Error("Only disposable temporary shared storage is allowed");
  const attachments = createProjectChatAttachmentService({repository, audit, chatRepository, clock, storage: createLocalStorage(storageRoot).managed});
  app.use("/api/v1", createProjectChatAttachmentsRouter(auth, attachments));
}
app.use("/api/v1", createProjectChatRouter(auth, { ...chat, async send(...args) {
  const result = await chat.send(...args);
  if (process.argv[3] === "crash" && args[2].body === "Committed before process exit") {
    process.send?.({ committed: result.id });
    await new Promise<void>(() => {});
  }
  return result;
} }, typing));
app.use("/api/v1", createProjectChatEventsRouter(auth, stream));
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") process.send?.({ port: address.port });
});
process.on("SIGTERM", () => { void (async () => {
  await stream.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  process.exit(0);
})(); });
