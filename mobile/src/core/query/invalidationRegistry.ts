import type { RequestScope } from "../../contracts/http";

export const QUERY_FAMILIES = [
  "viewer",
  "dashboard",
  "projects",
  "project-hierarchy",
  "tasks",
  "workflow",
  "kpi",
  "design",
  "design-plans",
  "leads",
  "estimates",
  "estimate-responses",
  "plan-review",
  "operations",
  "procurement",
  "vendors",
  "vendor-suggestions",
  "finance-buckets",
  "finance-ledger",
  "finance-portfolio",
  "management",
  "users",
  "access-self",
  "access-review",
  "knowledge",
  "knowledge-context",
  "chat",
  "notifications"
] as const;

export type QueryFamily = (typeof QUERY_FAMILIES)[number];

export type InvalidationEvent =
  | "project-initiated"
  | "task-changed"
  | "design-workflow-changed"
  | "estimate-decision-changed"
  | "plan-review-changed"
  | "operational-task-changed"
  | "procurement-changed"
  | "finance-entry-changed"
  | "management-changed"
  | "user-changed"
  | "access-changed"
  | "knowledge-changed"
  | "chat-changed"
  | "notification-changed";

const EVENT_FAMILIES = Object.freeze({
  "project-initiated": ["projects", "dashboard", "leads"],
  "task-changed": ["project-hierarchy", "tasks", "workflow", "kpi", "dashboard"],
  "design-workflow-changed": [
    "workflow",
    "projects",
    "design",
    "design-plans",
    "estimate-responses",
    "finance-buckets",
    "finance-ledger",
    "finance-portfolio",
    "dashboard"
  ],
  "estimate-decision-changed": [
    "estimates",
    "estimate-responses",
    "plan-review",
    "workflow",
    "projects",
    "finance-buckets",
    "finance-portfolio",
    "dashboard"
  ],
  "plan-review-changed": [
    "plan-review",
    "estimates",
    "estimate-responses",
    "workflow",
    "projects"
  ],
  "operational-task-changed": [
    "operations",
    "tasks",
    "projects",
    "finance-buckets",
    "finance-portfolio",
    "dashboard"
  ],
  "procurement-changed": [
    "procurement",
    "vendors",
    "vendor-suggestions",
    "knowledge",
    "knowledge-context",
    "finance-buckets",
    "finance-ledger",
    "finance-portfolio",
    "projects",
    "dashboard"
  ],
  "finance-entry-changed": [
    "finance-buckets",
    "finance-ledger",
    "finance-portfolio",
    "dashboard"
  ],
  "management-changed": ["management", "kpi", "projects", "dashboard"],
  "user-changed": ["users", "management", "dashboard"],
  "access-changed": [
    "access-self",
    "access-review",
    "projects",
    "project-hierarchy",
    "workflow",
    "design",
    "procurement",
    "finance-buckets",
    "chat",
    "dashboard"
  ],
  "knowledge-changed": [
    "knowledge",
    "knowledge-context",
    "procurement",
    "vendors",
    "vendor-suggestions"
  ],
  "chat-changed": ["chat", "notifications"],
  "notification-changed": ["notifications"]
} as const satisfies Readonly<Record<InvalidationEvent, readonly QueryFamily[]>>);

const ACCESS_RETAINED_FAMILIES = new Set<QueryFamily>([
  "viewer",
  "access-self",
  "access-review"
]);

export type ScopedQueryPrefix = readonly [
  environmentId: string,
  userId: string,
  family: QueryFamily
];

export function scopedQueryPrefix(
  scope: Pick<RequestScope, "environmentId" | "userId">,
  family: QueryFamily
): ScopedQueryPrefix {
  if (!scope.userId) {
    throw new Error("Private query keys require an authenticated user.");
  }

  return Object.freeze([scope.environmentId, scope.userId, family]);
}

export function invalidationPrefixes(
  scope: Pick<RequestScope, "environmentId" | "userId">,
  event: InvalidationEvent
): readonly ScopedQueryPrefix[] {
  return Object.freeze(
    EVENT_FAMILIES[event].map((family) => scopedQueryPrefix(scope, family))
  );
}

export function invalidationFamilies(
  event: InvalidationEvent
): readonly QueryFamily[] {
  return EVENT_FAMILIES[event];
}

export function purgeFamilies(event: InvalidationEvent): readonly QueryFamily[] {
  if (event !== "access-changed") return Object.freeze([]);
  return Object.freeze(
    QUERY_FAMILIES.filter((family) => !ACCESS_RETAINED_FAMILIES.has(family))
  );
}

export function purgePrefixes(
  scope: Pick<RequestScope, "environmentId" | "userId">,
  event: InvalidationEvent
): readonly ScopedQueryPrefix[] {
  return Object.freeze(
    purgeFamilies(event).map((family) => scopedQueryPrefix(scope, family))
  );
}
