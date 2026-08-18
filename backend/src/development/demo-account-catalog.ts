import { type Role, ROLE_CODES } from "../domain/roles.js";
import type { AccountKind } from "../domain/demo-identities.js";

export const DEVELOPMENT_DEMO_PASSWORD = "LisnoDemo2026!";
export const DEVELOPMENT_DEMO_PASSWORD_HASH =
  "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O";

export interface DevelopmentDemoAccount {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  accountKind: AccountKind;
  title: string;
  managerId: string | null;
  authorizedClientIds: readonly string[];
}

const account = (
  id: string,
  name: string,
  email: string,
  role: Role,
  title: string,
  managerId: string | null = null,
  authorizedClientIds: readonly string[] = []
): DevelopmentDemoAccount =>
  Object.freeze({
    id,
    name,
    email,
    emailNormalized: email,
    passwordHash: DEVELOPMENT_DEMO_PASSWORD_HASH,
    role,
    active: true,
    accountKind: "development_demo",
    title,
    managerId,
    authorizedClientIds: Object.freeze([...authorizedClientIds])
  });

export const DEVELOPMENT_DEMO_ACCOUNTS = Object.freeze([
  account("user-super-admin", "Aditi Rao", "super-admin@lisno.example", "super_admin", "Super Admin"),
  account("user-admin", "Arjun Patel", "admin@lisno.example", "admin", "Admin"),
  account("user-estimator-sales", "Priya Sharma", "sales@lisno.example", "estimator_sales", "Estimator / Sales"),
  account("user-designer-ananya", "Ananya Rao", "ananya@lisno.example", "designer", "Senior Designer", "user-manager-aarav", ["user-client-aurora", "user-client-celeste"]),
  account("user-procurement", "Nisha Verma", "procurement@lisno.example", "procurement", "Procurement"),
  account("user-finance-head", "Rohan Gupta", "finance-head@lisno.example", "finance_head", "Finance Head"),
  account("user-site-manager", "Imran Khan", "site-manager@lisno.example", "site_manager", "Site Manager"),
  account("user-worker-electrician", "Aman Electrician", "worker-electrician@lisno.example", "worker_electrician", "Electrician"),
  account("user-worker-plumber", "Bharat Plumber", "worker-plumber@lisno.example", "worker_plumber", "Plumber"),
  account("user-worker-carpenter", "Charan Carpenter", "worker-carpenter@lisno.example", "worker_carpenter", "Carpenter"),
  account("user-worker-painter", "Deepak Painter", "worker-painter@lisno.example", "worker_painter", "Painter"),
  account("user-worker-civil", "Eshan Civil", "worker-civil@lisno.example", "worker_civil", "Civil Worker"),
  account("user-worker-other", "Farah Worker", "worker-other@lisno.example", "worker_other", "Other Worker"),
  account("user-manager-aarav", "Aarav Mehta", "aarav@lisno.example", "design_manager", "Design Manager"),
  account("user-head", "Devika Menon", "head@lisno.example", "design_head", "Design Head"),
  account("user-client-aurora", "Rhea Kapoor", "client@aurora.example", "client", "Aurora Living")
] satisfies readonly DevelopmentDemoAccount[]);

if (DEVELOPMENT_DEMO_ACCOUNTS.map(({ role }) => role).join(",") !== ROLE_CODES.join(",")) {
  throw new Error("Development demo accounts must remain in ROLE_CODES order.");
}
