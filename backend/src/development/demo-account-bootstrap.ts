import type { ClientSession, Model } from "mongoose";

import {
  assertDevelopmentDemoConnection,
  type DevelopmentDemoAuthorization
} from "./demo-account-authorization.js";
import {
  DEVELOPMENT_DEMO_ACCOUNTS,
  type DevelopmentDemoAccount
} from "./demo-account-catalog.js";

export interface DevelopmentDemoPreparationResult {
  inserted: number;
  repaired: number;
  unchanged: number;
}

interface DevelopmentDemoPreparationOptions {
  readonly clock?: () => Date;
}

interface StoredUser {
  readonly _id: string;
  readonly name?: unknown;
  readonly email?: unknown;
  readonly emailNormalized?: unknown;
  readonly passwordHash?: unknown;
  readonly role?: unknown;
  readonly active?: unknown;
  readonly accountKind?: unknown;
  readonly version?: unknown;
  readonly managerId?: unknown;
  readonly authorizedClientIds?: unknown;
  readonly title?: unknown;
}

type UserModel = Model<StoredUser>;

interface PreparationPlan {
  readonly missing: readonly DevelopmentDemoAccount[];
  readonly drifted: readonly {
    account: DevelopmentDemoAccount;
    version: number;
  }[];
  readonly unchanged: number;
}

const MAX_RECOVERY_ATTEMPTS = 3;

class DevelopmentDemoCollisionError extends Error {
  constructor() {
    super(
      "Development demo account collision: a reserved ID or email belongs to another account."
    );
  }
}

class DevelopmentDemoConcurrentWriteError extends Error {}

export async function ensureDevelopmentDemoAccounts(
  capability: DevelopmentDemoAuthorization,
  options: DevelopmentDemoPreparationOptions = {}
): Promise<DevelopmentDemoPreparationResult> {
  const mongoose = (await import("mongoose")).default;
  const { UserModel } = await import("../models/User.js");

  assertDevelopmentDemoConnection(capability, {
    connectedDatabaseName: mongoose.connection.name,
    defaultConnection: mongoose.connection,
    userModelConnection: UserModel.db
  });

  const startupNow = (options.clock ?? (() => new Date()))();
  const runTransaction = () =>
    mongoose.connection.transaction((session) =>
      prepareAccounts(UserModel as UserModel, session, startupNow)
    );

  try {
    return await runTransaction();
  } catch (error) {
    if (!isRetryableConvergenceError(error)) throw error;

    const originalError = error;
    for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        return await runTransaction();
      } catch (recoveryError) {
        if (recoveryError instanceof DevelopmentDemoCollisionError) {
          throw originalError;
        }
        if (!isRetryableConvergenceError(recoveryError)) throw recoveryError;
      }
    }
    throw originalError;
  }
}

async function prepareAccounts(
  userModel: UserModel,
  session: ClientSession,
  startupNow: Date
): Promise<DevelopmentDemoPreparationResult> {
  const storedUsers = (await userModel
    .find({
      $or: [
        { _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) } },
        {
          emailNormalized: {
            $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ emailNormalized }) => emailNormalized)
          }
        }
      ]
    })
    .select("+passwordHash")
    .session(session)
    .lean()
    .exec()) as unknown as StoredUser[];

  const plan = buildPreparationPlan(storedUsers);

  if (plan.missing.length > 0) {
    await userModel.insertMany(
      plan.missing.map((account) => insertedDocument(account, startupNow)),
      { session, timestamps: false }
    );
  }

  for (const { account, version } of plan.drifted) {
    const result = await userModel.updateOne(
      {
        _id: account.id,
        emailNormalized: account.emailNormalized,
        version
      },
      {
        $set: {
          ...catalogOwnedFields(account),
          updatedAt: startupNow
        },
        $inc: { version: 1 }
      },
      { session, timestamps: false }
    );
    if (result.matchedCount !== 1) {
      throw new DevelopmentDemoConcurrentWriteError();
    }
  }

  return {
    inserted: plan.missing.length,
    repaired: plan.drifted.length,
    unchanged: plan.unchanged
  };
}

function buildPreparationPlan(
  storedUsers: readonly StoredUser[]
): PreparationPlan {
  const accountById = new Map(
    DEVELOPMENT_DEMO_ACCOUNTS.map((account) => [account.id, account])
  );
  const accountByEmail = new Map(
    DEVELOPMENT_DEMO_ACCOUNTS.map((account) => [
      account.emailNormalized,
      account
    ])
  );
  const storedById = new Map<string, StoredUser>();

  for (const stored of storedUsers) {
    const accountForId = accountById.get(String(stored._id));
    const accountForEmail =
      typeof stored.emailNormalized === "string"
        ? accountByEmail.get(stored.emailNormalized)
        : undefined;
    if (!accountForId || !accountForEmail || accountForId !== accountForEmail) {
      throw new DevelopmentDemoCollisionError();
    }
    storedById.set(accountForId.id, stored);
  }

  const missing: DevelopmentDemoAccount[] = [];
  const drifted: { account: DevelopmentDemoAccount; version: number }[] = [];
  let unchanged = 0;

  for (const account of DEVELOPMENT_DEMO_ACCOUNTS) {
    const stored = storedById.get(account.id);
    if (!stored) {
      missing.push(account);
      continue;
    }
    if (isCanonical(stored, account)) {
      unchanged += 1;
      continue;
    }
    if (!Number.isInteger(stored.version) || Number(stored.version) < 1) {
      throw new Error(`Development demo account ${account.id} has an invalid version.`);
    }
    drifted.push({ account, version: Number(stored.version) });
  }

  return { missing, drifted, unchanged };
}

function isCanonical(
  stored: StoredUser,
  account: DevelopmentDemoAccount
): boolean {
  return (
    stored.name === account.name &&
    stored.email === account.email &&
    stored.emailNormalized === account.emailNormalized &&
    stored.passwordHash === account.passwordHash &&
    stored.role === account.role &&
    stored.active === account.active &&
    stored.accountKind === account.accountKind &&
    stored.title === account.title &&
    stored.managerId === account.managerId &&
    equalStringArrays(stored.authorizedClientIds, account.authorizedClientIds)
  );
}

function equalStringArrays(
  stored: unknown,
  canonical: readonly string[]
): boolean {
  return (
    Array.isArray(stored) &&
    stored.length === canonical.length &&
    stored.every((value, index) => value === canonical[index])
  );
}

function insertedDocument(account: DevelopmentDemoAccount, startupNow: Date) {
  return {
    _id: account.id,
    ...catalogOwnedFields(account),
    version: 1,
    createdAt: startupNow,
    updatedAt: startupNow
  };
}

function catalogOwnedFields(account: DevelopmentDemoAccount) {
  return {
    name: account.name,
    email: account.email,
    emailNormalized: account.emailNormalized,
    passwordHash: account.passwordHash,
    role: account.role,
    active: account.active,
    accountKind: account.accountKind,
    title: account.title,
    managerId: account.managerId,
    authorizedClientIds: [...account.authorizedClientIds]
  };
}

function isRetryableConvergenceError(error: unknown): boolean {
  if (error instanceof DevelopmentDemoConcurrentWriteError) return true;
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  return (
    candidate.code === 11000 ||
    (typeof candidate.message === "string" && candidate.message.includes("E11000")) ||
    (candidate.cause !== undefined && isRetryableConvergenceError(candidate.cause))
  );
}
