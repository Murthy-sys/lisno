import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import mongoose from "mongoose";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { repairExistingClientProjectLink } from "../src/operations/existing-client-project-link-repair.js";

export function assertLocalRepairUri(uri: string) {
  // No SRV, credentials, multi-host lists, or remote addresses in this local tool.
  if (!/^mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/.test(uri)) {
    throw new Error("This repair only supports an explicit loopback Mongo database.");
  }
}

export async function runClientLinkRepairCli(args: string[]) {
  const allowed = new Set(["--project-id", "--client-id", "--actor-id", "--expected-project-updated-at", "--expected-invitation-version", "--backup"]);
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--apply" && !apply) { apply = true; continue; }
    if (!allowed.has(arg) || values.has(arg) || !args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error("Invalid repair arguments.");
    values.set(arg, args[++index]!);
  }
  const value = (flag: string) => { const result = values.get(flag); if (!result) throw new Error(`Missing ${flag}.`); return result; };
  const target = { projectId: value("--project-id"), clientId: value("--client-id"), actorId: value("--actor-id"),
    expectedProjectUpdatedAt: value("--expected-project-updated-at"), expectedInvitationVersion: Number(value("--expected-invitation-version")) };
  if (apply && !values.has("--backup")) throw new Error("Apply requires --backup with a new absolute path.");
  config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const uri = process.env.MONGODB_URI ?? "";
  assertLocalRepairUri(uri);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  try {
    const result = await repairExistingClientProjectLink(createMongoRepository(), target, { apply, backupPath: values.get("--backup") });
    console.log(JSON.stringify(result));
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClientLinkRepairCli(process.argv.slice(2)).catch(() => {
    // Database errors may contain emails/URIs; expose only a stable safe diagnostic.
    console.error("CLIENT_LINK_REPAIR_FAILED: invalid arguments, ineligible/changed target, backup failure, or unavailable local database. No broad repair attempted.");
    process.exitCode = 1;
  });
}
