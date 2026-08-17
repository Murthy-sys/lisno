import { z } from "zod";

export const ROLE_CODES = [
  "super_admin",
  "admin",
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other",
  "design_manager",
  "design_head",
  "client"
] as const;

export type Role = (typeof ROLE_CODES)[number];
export const roleSchema = z.enum(ROLE_CODES);

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  estimator_sales: "Estimator/Sales",
  designer: "Designer",
  procurement: "Procurement",
  finance_head: "Finance Head",
  site_manager: "Site Manager",
  worker_electrician: "Electrician",
  worker_plumber: "Plumber",
  worker_carpenter: "Carpenter",
  worker_painter: "Painter",
  worker_civil: "Civil Worker",
  worker_other: "Other Worker",
  design_manager: "Design Manager",
  design_head: "Design Head",
  client: "Client"
} as const satisfies Readonly<Record<Role, string>>;

export const WORKER_ROLES = [
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other"
] as const satisfies readonly Role[];

export type WorkerRole = (typeof WORKER_ROLES)[number];
export type RoleFamily = Exclude<Role, WorkerRole> | "worker";

export const OPERATIONAL_ROLES = [
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_CODES.some((role) => role === value);
}

export function isWorkerRole(role: Role): role is WorkerRole {
  return (WORKER_ROLES as readonly Role[]).includes(role);
}

export function roleFamilyFor(role: Role): RoleFamily {
  return isWorkerRole(role) ? "worker" : role;
}
