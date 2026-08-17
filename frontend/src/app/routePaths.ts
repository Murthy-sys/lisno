import type { Role } from "../api/types";

const roleHomePaths: Record<Role, string> = {
  super_admin: "/admin/users",
  admin: "/admin/users",
  designer: "/designer",
  procurement: "/home",
  finance_head: "/home",
  site_manager: "/home",
  worker_electrician: "/home",
  worker_plumber: "/home",
  worker_carpenter: "/home",
  worker_painter: "/home",
  worker_civil: "/home",
  worker_other: "/home",
  design_manager: "/manager",
  design_head: "/head",
  estimator_sales: "/estimator-sales",
  client: "/client"
};

export function roleHomePath(role: Role): string {
  return roleHomePaths[role];
}

const returnPathOrigin = "https://lisno.local";

function hasEncodedTraversal(pathname: string): boolean {
  if (/%(?![0-9a-f]{2})/i.test(pathname)) return true;

  let decoded = pathname;
  for (let depth = 0; depth < 8 && /%[0-9a-f]{2}/i.test(decoded); depth += 1) {
    decoded = decodeURIComponent(decoded);
  }

  if (/%[0-9a-f]{2}/i.test(decoded) || decoded.includes("\\")) return true;
  return decoded.split("/").some((segment) => segment === "." || segment === "..");
}

export function safeReturnPath(
  role: Role,
  candidate?: string | null
): string {
  const home = roleHomePath(role);
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return home;
  }

  try {
    decodeURI(candidate);
    const parsed = new URL(candidate, returnPathOrigin);
    if (
      parsed.origin !== returnPathOrigin ||
      hasEncodedTraversal(parsed.pathname) ||
      (parsed.pathname !== home && !parsed.pathname.startsWith(`${home}/`))
    ) {
      return home;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return home;
  }
}
