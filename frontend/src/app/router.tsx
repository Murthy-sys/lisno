import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";

import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
import { ProtectedRoute, roleHomePath } from "../auth/ProtectedRoute";
import { AppShell } from "../components/layout/AppShell";
import { AsyncState } from "../components/ui/AsyncState";
import { StatusBadge } from "../components/ui/StatusBadge";
import { DesignerDashboard } from "../features/designer/DesignerDashboard";
import { ProjectWorkspace } from "../features/designer/ProjectWorkspace";
import { ManagerDashboard } from "../features/manager/ManagerDashboard";
import { DesignerDetail } from "../features/manager/DesignerDetail";
import { ManagementProjectWorkspace } from "../features/manager/ManagementProjectWorkspace";
import { HeadDashboard } from "../features/head/HeadDashboard";
import { ClientDashboard } from "../features/client/ClientDashboard";
import { ClientProject } from "../features/client/ClientProject";

const roleHomeContent: Record<
  Role,
  { heading: string; eyebrow: string; description: string; status: string }
> = {
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
  client: {
    heading: "Client workspace",
    eyebrow: "My projects",
    description:
      "Approved plans, floor progress, and project delivery updates will live here.",
    status: "Ready for approved updates"
  }
};

function RoleLanding({ role }: { role: Role }) {
  const content = roleHomeContent[role];
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

function LoginRoute() {
  const auth = useAuth();

  if (auth.status === "restoring") {
    return <AsyncState state="loading" message="Restoring your session…" />;
  }
  if (auth.status === "authenticated" && auth.user) {
    return <Navigate to={roleHomePath(auth.user.role)} replace />;
  }
  return <LoginPage />;
}

function HomeRedirect() {
  const auth = useAuth();

  if (auth.status === "restoring") {
    return <AsyncState state="loading" message="Restoring your session…" />;
  }
  if (auth.status === "error") {
    return (
      <AsyncState
        state="error"
        message="We couldn't restore your session."
        actionLabel="Try again"
        onAction={() => void auth.restore()}
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
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
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
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
