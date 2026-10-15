import type { AuthenticatedSession } from "../contracts/session";
import { resolveAuthorizedFeature, type FeatureDestination, type FeatureId } from "./registry";

export const procurementNavigationColors = Object.freeze({
  rail: "#eeefe6", ink: "#30382b", muted: "#626958", active: "#525f40",
  activeInk: "#fffdf6", border: "#dde0d3", header: "#faf9f5"
});

export interface ProcurementNavigationLink {
  readonly kind: "link";
  readonly id: FeatureId;
  readonly label: string;
  readonly destination: FeatureDestination;
  readonly selected: boolean;
}

export interface ProcurementNavigationGroup {
  readonly kind: "group";
  readonly id: "procurement-group";
  readonly label: "Procurement";
  readonly selected: boolean;
  readonly children: readonly ProcurementNavigationLink[];
}

export type ProcurementNavigationEntry = ProcurementNavigationLink | ProcurementNavigationGroup;

const procurementChildren = [
  { id: "procurement", label: "Projects" },
  { id: "procurement-vendors", label: "Vendors" },
  { id: "my-requests", label: "All my requests" }
] as const;

/** Presentation labels follow web; destinations and visibility remain canonical. */
export function resolveProcurementNavigation(
  session: AuthenticatedSession,
  activeFeature?: FeatureId
): readonly ProcurementNavigationEntry[] {
  if (session.user.role !== "procurement") return [];
  const link = (id: FeatureId, label: string): ProcurementNavigationLink[] => {
    const destination = resolveAuthorizedFeature(id, session.user.role, session.authorization);
    return destination ? [{ kind: "link", id, label, destination, selected: activeFeature === id }] : [];
  };
  const children = procurementChildren.flatMap(({ id, label }) => link(id, label));
  return [
    ...link("execution", "Execution"),
    ...link("messages", "Project messages"),
    ...(children.length ? [{
      kind: "group" as const, id: "procurement-group" as const, label: "Procurement" as const,
      selected: children.some((child) => child.selected), children
    }] : []),
    ...link("work-order-approvals", "Work order approvals"),
    ...link("access-self", "My access requests"),
    ...link("work", "Home")
  ];
}
