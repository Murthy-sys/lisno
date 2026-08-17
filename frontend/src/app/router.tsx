import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigationType,
} from "react-router-dom";

import type { Role } from "../api/types";
import { roleHomePath, safeReturnPath } from "./routePaths";
import { AuthRouteState } from "../auth/AuthRouteState";
import { useAuth } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
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
    heading: "Finance Head workspace",
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

const neutralHomeRoles: Role[] = [
  "super_admin",
  "admin",
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other"
];

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
          element={
            <ProtectedRoute allowedRoles={neutralHomeRoles}>
              <CurrentRoleLanding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/designer"
          element={
            <ProtectedRoute allowedRoles={["designer"]}>
              <DesignerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/designer/projects/:projectId"
          element={
            <ProtectedRoute allowedRoles={["designer"]}>
              <ProjectWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager"
          element={
            <ProtectedRoute allowedRoles={["design_manager"]}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/designers/:designerId"
          element={
            <ProtectedRoute allowedRoles={["design_manager", "design_head"]}>
              <DesignerDetail />
            </ProtectedRoute>
          }
        />
        <Route path="/manager/projects/:projectId" element={<ProtectedRoute allowedRoles={["design_manager"]}><ManagementProjectWorkspace /></ProtectedRoute>} />
        <Route
          path="/head"
          element={
            <ProtectedRoute allowedRoles={["design_head"]}>
              <HeadDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/head/designers/:designerId" element={<ProtectedRoute allowedRoles={["design_head"]}><DesignerDetail /></ProtectedRoute>} />
        <Route path="/head/projects/:projectId" element={<ProtectedRoute allowedRoles={["design_head"]}><ManagementProjectWorkspace /></ProtectedRoute>} />
        <Route
          path="/estimator-sales"
          element={<ProtectedRoute allowedRoles={["estimator_sales"]}><LeadDashboard /></ProtectedRoute>}
        />
        <Route path="/estimator-sales/leads/:leadId" element={<ProtectedRoute allowedRoles={["estimator_sales"]}><LeadDetail /></ProtectedRoute>} />
        <Route path="/estimator-sales/leads/:leadId/estimate" element={<ProtectedRoute allowedRoles={["estimator_sales"]}><LeadEstimateWorkspace /></ProtectedRoute>} />
        <Route
          path="/client"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/client/projects/:projectId" element={<ProtectedRoute allowedRoles={["client"]}><ClientProject /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
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
