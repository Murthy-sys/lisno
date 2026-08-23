import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import type { ReactNode } from "react";

import type { Role } from "../api/types";
import { roleHomePath, safeReturnPath } from "./routePaths";
import {
  registeredRoute,
  type RegisteredFrontendPath
} from "./routeRegistry";
import { AccessDeniedPage } from "../auth/AccessDeniedPage";
import { AuthRouteState } from "../auth/AuthRouteState";
import { useAuth } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
import { PermissionRoute } from "../auth/PermissionRoute";
import { SignupPage } from "../auth/SignupPage";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { AppShell } from "../components/layout/AppShell";
import { RouteFocusManager } from "../components/layout/RouteFocusManager";
import { StatusBadge } from "../components/ui/StatusBadge";
import { DesignerDashboard } from "../features/designer/DesignerDashboard";
import { ProjectWorkspace } from "../features/designer/ProjectWorkspace";
import { ManagerDashboard } from "../features/manager/ManagerDashboard";
import { DesignerDetail } from "../features/manager/DesignerDetail";
import { ManagementProjectWorkspace } from "../features/manager/ManagementProjectWorkspace";
import { HeadDashboard } from "../features/head/HeadDashboard";
import { ClientDashboard } from "../features/client/ClientDashboard";
import { ClientProject } from "../features/client/ClientProject";
import { LeadDashboard } from "../features/leads/LeadDashboard";
import { LeadDetail } from "../features/leads/LeadDetail";
import { LeadEstimateWorkspace } from "../features/leads/LeadEstimateWorkspace";
import { UserDirectoryPage } from "../features/admin/UserDirectoryPage";
import { AdminProjectsPage } from "../features/admin/AdminProjectsPage";
import { AdminProjectDetailPage } from "../features/admin/AdminProjectDetailPage";
import { AccessRequestInboxPage } from "../features/access/AccessRequestInboxPage";
import { MyAccessRequestsPage } from "../features/access/MyAccessRequestsPage";
import { NeutralHomePage } from "../features/home/NeutralHomePage";

interface RoleHomeContent {
  heading: string;
  eyebrow: string;
  description: string;
  status: string;
}

const roleHomeContent: Record<Role, RoleHomeContent> = {
  super_admin: {
    heading: "Super Admin workspace",
    eyebrow: "Organization administration",
    description: "Your global administration tools are being prepared.",
    status: "Ready for staged access"
  },
  admin: {
    heading: "Admin workspace",
    eyebrow: "Project administration",
    description: "Your project administration tools are being prepared.",
    status: "Ready for staged access"
  },
  designer: {
    heading: "Designer workspace",
    eyebrow: "My design operations",
    description:
      "Your active projects, upcoming tasks, risk signals, and KPI story will live here.",
    status: "Ready for project work"
  },
  design_manager: {
    heading: "Design manager workspace",
    eyebrow: "Team design operations",
    description:
      "Designer workload, deadlines, performance, and evaluations will live here.",
    status: "Ready for team oversight"
  },
  design_head: {
    heading: "Design head workspace",
    eyebrow: "Organization design operations",
    description:
      "Manager teams, organization health, and evaluation coverage will live here.",
    status: "Ready for organization review"
  },
  estimator_sales: { heading: "Estimator / Sales workspace", eyebrow: "Lead operations", description: "Your leads and estimates will live here.", status: "Ready for lead work" },
  procurement: {
    heading: "Procurement workspace",
    eyebrow: "Project procurement",
    description: "Your authorized procurement work will appear here.",
    status: "Ready for staged access"
  },
  finance_head: {
    heading: "Finance Manager workspace",
    eyebrow: "Project finance",
    description: "Your authorized finance work will appear here.",
    status: "Ready for staged access"
  },
  site_manager: {
    heading: "Site Manager workspace",
    eyebrow: "Project execution",
    description: "Your authorized execution work will appear here.",
    status: "Ready for staged access"
  },
  worker_electrician: {
    heading: "Electrician workspace",
    eyebrow: "Site work",
    description: "Your assigned electrical work will appear here.",
    status: "Ready for staged access"
  },
  worker_plumber: {
    heading: "Plumber workspace",
    eyebrow: "Site work",
    description: "Your assigned plumbing work will appear here.",
    status: "Ready for staged access"
  },
  worker_carpenter: {
    heading: "Carpenter workspace",
    eyebrow: "Site work",
    description: "Your assigned carpentry work will appear here.",
    status: "Ready for staged access"
  },
  worker_painter: {
    heading: "Painter workspace",
    eyebrow: "Site work",
    description: "Your assigned painting work will appear here.",
    status: "Ready for staged access"
  },
  worker_civil: {
    heading: "Civil Worker workspace",
    eyebrow: "Site work",
    description: "Your assigned civil work will appear here.",
    status: "Ready for staged access"
  },
  worker_other: {
    heading: "Other Worker workspace",
    eyebrow: "Site work",
    description: "Your assigned project work will appear here.",
    status: "Ready for staged access"
  },
  client: {
    heading: "Client workspace",
    eyebrow: "My projects",
    description:
      "Approved plans, floor progress, and project delivery updates will live here.",
    status: "Ready for approved updates"
  }
};

export function roleHomeContentFor(role: Role): Readonly<RoleHomeContent> {
  return roleHomeContent[role];
}

function RoleLanding({ role }: { role: Role }) {
  const content = roleHomeContentFor(role);
  const auth = useAuth();

  return (
    <section className="role-landing" aria-labelledby="workspace-title">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1 id="workspace-title">{content.heading}</h1>
          <p>Welcome, {auth.user?.name}.</p>
        </div>
        <StatusBadge label={content.status} tone="success" />
      </header>

      <div className="placeholder-card">
        <span className="placeholder-card__index">01</span>
        <div>
          <p className="eyebrow">Role landing</p>
          <h2>Your overview is the next step.</h2>
          <p>{content.description}</p>
        </div>
      </div>
    </section>
  );
}

function CurrentRoleLanding() {
  const auth = useAuth();

  return auth.user ? <RoleLanding role={auth.user.role} /> : null;
}

function LoginRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "restoring") {
    return (
      <AuthRouteState
        title="Welcome back"
        state="loading"
        message="Restoring your session…"
      />
    );
  }
  if (auth.status === "authenticated" && auth.user) {
    const locationState = location.state as { from?: unknown } | null;
    const from = typeof locationState?.from === "string" ? locationState.from : null;
    return (
      <Navigate
        to={safeReturnPath(auth.user.role, from)}
        replace
        state={{ routeFocus: true }}
      />
    );
  }
  return <LoginPage />;
}

function SignupRoute() {
  const auth = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();

  if (auth.status === "restoring") {
    return (
      <AuthRouteState
        title="Create your client account"
        state="loading"
        message="Restoring your session…"
      />
    );
  }
  if (auth.status === "authenticated" && auth.user) {
    const signupState = location.state as { signupRouteFocus?: unknown } | null;
    return (
      <Navigate
        to={roleHomePath(auth.user.role)}
        replace
        state={
          signupState?.signupRouteFocus === true &&
          navigationType === "REPLACE"
            ? { routeFocus: true }
            : undefined
        }
      />
    );
  }
  return <SignupPage />;
}

function HomeRedirect() {
  const auth = useAuth();

  if (auth.status === "restoring") {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="loading"
        message="Restoring your session…"
      />
    );
  }
  if (auth.status === "error") {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="error"
        message="We couldn't restore your session."
        action={{ label: "Try again", onAction: () => void auth.restore() }}
      />
    );
  }
  return (
    <Navigate
      to={
        auth.status === "authenticated" && auth.user
          ? roleHomePath(auth.user.role)
          : "/login"
      }
      replace
    />
  );
}

const stagedElements = {
  "/admin/projects": <AdminProjectsPage />,
  "/admin/projects/:projectId": <AdminProjectDetailPage />,
  "/admin/users": <UserDirectoryPage />,
  "/admin/access-requests": <AccessRequestInboxPage />,
  "/access-requests/mine": <MyAccessRequestsPage />
} as const satisfies Partial<Record<RegisteredFrontendPath, ReactNode>>;

function registeredElement(path: RegisteredFrontendPath, children: ReactNode) {
  const route = registeredRoute(path);
  if (route.permission === null) return children;

  return (
    <PermissionRoute
      permission={route.permission}
      presentationRoles={route.presentationRoles}
    >
      {children}
    </PermissionRoute>
  );
}

export function AppRoutes() {
  return (
    <>
      <RouteFocusManager />
      <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route
          path="/home"
          element={registeredElement("/home", <CurrentRoleLanding />)}
        />
        <Route
          path="/designer"
          element={registeredElement("/designer", <DesignerDashboard />)}
        />
        <Route
          path="/designer/projects/:projectId"
          element={registeredElement(
            "/designer/projects/:projectId",
            <ProjectWorkspace />
          )}
        />
        <Route
          path="/manager"
          element={registeredElement("/manager", <ManagerDashboard />)}
        />
        <Route
          path="/manager/designers/:designerId"
          element={registeredElement(
            "/manager/designers/:designerId",
            <DesignerDetail />
          )}
        />
        <Route
          path="/manager/projects/:projectId"
          element={registeredElement(
            "/manager/projects/:projectId",
            <ManagementProjectWorkspace />
          )}
        />
        <Route
          path="/head"
          element={registeredElement("/head", <HeadDashboard />)}
        />
        <Route
          path="/head/designers/:designerId"
          element={registeredElement(
            "/head/designers/:designerId",
            <DesignerDetail />
          )}
        />
        <Route
          path="/head/projects/:projectId"
          element={registeredElement(
            "/head/projects/:projectId",
            <ManagementProjectWorkspace />
          )}
        />
        <Route
          path="/estimator-sales"
          element={registeredElement("/estimator-sales", <LeadDashboard />)}
        />
        <Route
          path="/estimator-sales/leads/:leadId"
          element={registeredElement(
            "/estimator-sales/leads/:leadId",
            <LeadDetail />
          )}
        />
        <Route
          path="/estimator-sales/leads/:leadId/estimate"
          element={registeredElement(
            "/estimator-sales/leads/:leadId/estimate",
            <LeadEstimateWorkspace />
          )}
        />
        <Route
          path="/client"
          element={registeredElement("/client", <ClientDashboard />)}
        />
        <Route
          path="/client/projects/:projectId"
          element={registeredElement(
            "/client/projects/:projectId",
            <ClientProject />
          )}
        />
        <Route
          path="/admin/projects"
          element={registeredElement("/admin/projects", stagedElements["/admin/projects"])}
        />
        <Route
          path="/admin/projects/:projectId"
          element={registeredElement("/admin/projects/:projectId", stagedElements["/admin/projects/:projectId"])}
        />
        <Route
          path="/admin/users"
          element={registeredElement("/admin/users", stagedElements["/admin/users"])}
        />
        <Route
          path="/admin/access-requests"
          element={registeredElement(
            "/admin/access-requests",
            stagedElements["/admin/access-requests"]
          )}
        />
        <Route
          path="/access-requests/mine"
          element={registeredElement(
            "/access-requests/mine",
            stagedElements["/access-requests/mine"]
          )}
        />
        <Route
          path="/access-denied"
          element={registeredElement("/access-denied", <AccessDeniedPage />)}
        />
        <Route
          path="*"
          element={
            <NeutralHomePage
              title="Page not found"
              description="The page you requested does not exist."
            />
          }
        />
      </Route>
      </Routes>
    </>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
