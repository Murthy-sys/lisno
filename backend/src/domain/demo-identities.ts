import { normalizeEmail } from "./email.js";
import type { UserRecord } from "../repositories/types.js";

export const ACCOUNT_KINDS = ["standard", "development_demo"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const RESERVED_DEMO_IDENTITIES = Object.freeze([
  ["user-super-admin", "super-admin@lisno.example"],
  ["user-admin", "admin@lisno.example"],
  ["user-estimator-sales", "sales@lisno.example"],
  ["user-designer-ananya", "ananya@lisno.example"],
  ["user-procurement", "procurement@lisno.example"],
  ["user-finance-head", "finance-head@lisno.example"],
  ["user-site-manager", "site-manager@lisno.example"],
  ["user-worker-electrician", "worker-electrician@lisno.example"],
  ["user-worker-plumber", "worker-plumber@lisno.example"],
  ["user-worker-carpenter", "worker-carpenter@lisno.example"],
  ["user-worker-painter", "worker-painter@lisno.example"],
  ["user-worker-civil", "worker-civil@lisno.example"],
  ["user-worker-other", "worker-other@lisno.example"],
  ["user-manager-aarav", "aarav@lisno.example"],
  ["user-head", "head@lisno.example"],
  ["user-client-aurora", "client@aurora.example"],
  ["user-manager-meera", "meera@lisno.example"],
  ["user-designer-kabir", "kabir@lisno.example"],
  ["user-designer-ishita", "ishita@lisno.example"],
  ["user-designer-vikram", "vikram@lisno.example"],
  ["user-client-celeste", "client@celeste.example"]
].map(([id, emailNormalized]) => Object.freeze({ id, emailNormalized })));

const reservedDemoUserIds = new Set(RESERVED_DEMO_IDENTITIES.map(({ id }) => id));
const reservedDemoEmails = new Set(
  RESERVED_DEMO_IDENTITIES.map(({ emailNormalized }) => emailNormalized)
);

export function isReservedDemoEmail(email: string): boolean {
  return reservedDemoEmails.has(normalizeEmail(email));
}

export function isReservedDevelopmentDemoIdentity(
  user: Pick<UserRecord, "id" | "emailNormalized" | "accountKind">
): boolean {
  return (
    user.accountKind === "development_demo" ||
    reservedDemoUserIds.has(user.id) ||
    reservedDemoEmails.has(normalizeEmail(user.emailNormalized))
  );
}
