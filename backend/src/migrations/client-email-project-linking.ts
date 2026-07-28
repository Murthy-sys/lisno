import "dotenv/config";

import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { loadEnvironment } from "../config/env.js";
import { normalizeEmail } from "../domain/email.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";

type LegacyUser = {
  _id: unknown;
  name?: string;
  email: string;
  emailNormalized?: string;
  mobile?: string | null;
  address?: string | null;
};

type LegacyProject = {
  _id: unknown;
  clientId?: string | null;
  clientName?: string;
  clientEmail?: string;
  clientEmailNormalized?: string;
  clientMobile?: string;
  clientAddress?: string;
};

export interface ClientLinkingMigrationResult {
  users: number;
  projects: number;
  duplicateEmails: string[];
}

export async function migrateClientEmailProjectLinking(
  options: { dryRun?: boolean } = {}
): Promise<ClientLinkingMigrationResult> {
  const [users, projects] = await Promise.all([
    UserModel.find().lean().exec() as Promise<LegacyUser[]>,
    ProjectModel.find().lean().exec() as Promise<LegacyProject[]>
  ]);
  const clientsById = new Map<string, LegacyUser>();
  const usersByNormalizedEmail = new Map<string, LegacyUser[]>();
  for (const user of users) {
    const id = String(user._id);
    clientsById.set(id, user);
    const emailNormalized = normalizeEmail(user.email);
    const grouped = usersByNormalizedEmail.get(emailNormalized) ?? [];
    grouped.push(user);
    usersByNormalizedEmail.set(emailNormalized, grouped);
  }
  const duplicateEmails = [...usersByNormalizedEmail.entries()]
    .filter(([, grouped]) => grouped.length > 1)
    .map(([email]) => email)
    .sort();
  const result = { users: users.length, projects: projects.length, duplicateEmails };
  if (options.dryRun) return result;
  if (duplicateEmails.length > 0) {
    throw new Error(
      `Cannot migrate client linking: duplicate normalized emails: ${duplicateEmails.join(", ")}`
    );
  }

  const userWrites = users.flatMap((user) => {
    const changes = changedFields(user, {
      emailNormalized: normalizeEmail(user.email),
      mobile: user.mobile ?? null,
      address: user.address ?? null
    });
    return Object.keys(changes).length === 0
      ? []
      : [{ updateOne: { filter: { _id: user._id }, update: { $set: changes } } }];
  });
  const projectWrites = projects.flatMap((project) => {
    const client = project.clientId ? clientsById.get(String(project.clientId)) : undefined;
    const snapshotEmail = project.clientEmail ?? client?.email ?? "";
    const changes = missingSnapshotFields(project, {
      clientName: client?.name ?? "",
      clientEmail: snapshotEmail,
      clientEmailNormalized: normalizeEmail(snapshotEmail),
      clientMobile: client?.mobile ?? "",
      clientAddress: client?.address ?? ""
    });
    return Object.keys(changes).length === 0
      ? []
      : [
          {
            updateOne: {
              filter: { _id: project._id, clientId: project.clientId ?? null },
              update: { $set: changes }
            }
          }
        ];
  });
  if (userWrites.length > 0) {
    await UserModel.bulkWrite(userWrites, { timestamps: false });
  }
  if (projectWrites.length > 0) {
    await ProjectModel.bulkWrite(projectWrites, { timestamps: false });
  }
  await Promise.all([UserModel.syncIndexes(), ProjectModel.syncIndexes()]);
  return result;
}

function changedFields(
  current: Record<string, unknown>,
  expected: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(expected).filter(([field, value]) => current[field] !== value)
  );
}

function missingSnapshotFields(
  project: LegacyProject,
  expected: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(expected).filter(([field]) => project[field as keyof LegacyProject] == null)
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const env = loadEnvironment();
  await mongoose.connect(env.MONGODB_URI);
  try {
    const result = await migrateClientEmailProjectLinking({ dryRun });
    process.stdout.write(
      `${dryRun ? "Dry run: " : ""}${result.users} users, ${result.projects} projects, ${result.duplicateEmails.length} duplicate normalized emails.\n`
    );
  } finally {
    await mongoose.disconnect();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
