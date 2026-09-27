import type { AuthorizationSnapshot, Role } from "../../api/authorization-contract";
import {
  NAVIGATION_GROUPS,
  ROUTE_REGISTRY,
  type NavigationGroupChild,
  type NavigationItem
} from "../../app/routeRegistry";
import { hasFrontendPermission } from "../../auth/authorization";

export type { NavigationItem } from "../../app/routeRegistry";

export interface NavigationGroup {
  readonly kind: "group";
  readonly id: keyof typeof NAVIGATION_GROUPS;
  readonly label: string;
  readonly icon: typeof NAVIGATION_GROUPS.procurement.icon;
  readonly children: readonly NavigationGroupChild[];
}

export type NavigationEntry = NavigationItem | NavigationGroup;

export function isNavigationGroup(item: NavigationEntry): item is NavigationGroup {
  return "kind" in item && item.kind === "group";
}

export function navigationForAuthorization(
  role: Role,
  authorization: AuthorizationSnapshot
): readonly NavigationEntry[] {
  if (authorization.role !== role) return Object.freeze([]);

  type PendingGroup = Omit<NavigationGroup, "children"> & { children: NavigationGroupChild[] };
  const items: Array<NavigationItem | PendingGroup> = [];
  const groups = new Map<keyof typeof NAVIGATION_GROUPS, PendingGroup>();

  for (const entry of ROUTE_REGISTRY) {
    if (entry.permission !== null && !hasFrontendPermission(authorization, entry.permission)) continue;

    const navigation = entry.navigation;
    if (navigation && (navigation.roles as readonly Role[]).includes(role)) {
      const labels: Readonly<Partial<Record<Role, string>>> | undefined =
        "labels" in navigation ? navigation.labels : undefined;
      items.push(Object.freeze({ ...navigation.item, label: labels?.[role] ?? navigation.item.label }));
    }

    if (!("groupNavigation" in entry)) continue;
    const groupNavigation = entry.groupNavigation;
    if (!(groupNavigation.roles as readonly Role[]).includes(role)) continue;
    if ("permission" in groupNavigation && groupNavigation.permission &&
        !hasFrontendPermission(authorization, groupNavigation.permission)) continue;
    const definition = NAVIGATION_GROUPS[groupNavigation.group];
    let group = groups.get(groupNavigation.group);
    if (!group) {
      group = { kind: "group", id: groupNavigation.group, label: definition.label, icon: definition.icon, children: [] };
      groups.set(groupNavigation.group, group);
      items.push(group);
    }
    group.children.push(Object.freeze({ ...groupNavigation.item }));
  }

  return Object.freeze(items.map((item) => isNavigationGroup(item)
    ? Object.freeze({ ...item, children: Object.freeze([...item.children]) })
    : item));
}
