import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider, useRouteError } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";

import { AppRoutes } from "../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { LoadingProvider } from "../../components/ui/GlobalRequestLoader";
import { installEnterpriseTransport, readEnterpriseScenario } from "./enterpriseTransport";
import "../../styles/index.css";
import "../../styles/brand.css";
import "../../styles/role-themes.css";
import "../../styles/access-administration.css";
import "../../styles/invitations.css";
import "../../styles/client-responses.css";
import "../../styles/estimate-delivery.css";
import "../../styles/designer-design-plans.css";
import "../../styles/admin-home.css";
import "../../styles/designer-home.css";

const scenario = readEnterpriseScenario(window.location.search);
const transport = installEnterpriseTransport(scenario);
const errors: string[] = [];
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false }, mutations: { retry: false } } });
function QaRouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  useEffect(() => { errors.push(message); }, [message]);
  return <pre role="alert">Synthetic QA render failed: {message}</pre>;
}
const router = createMemoryRouter([{ path: "*", element: <AppRoutes />, errorElement: <QaRouteError /> }], { initialEntries: [scenario.route] });
class QaErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { errors.push(`${error.message}\n${info.componentStack ?? ""}`); }
  render() { return this.state.message ? <pre role="alert">Synthetic QA render failed: {this.state.message}</pre> : this.props.children; }
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <QaErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LoadingProvider><FeedbackProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></FeedbackProvider></LoadingProvider>
    </QueryClientProvider>
  </QaErrorBoundary>
);

function computed(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
    const css = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return { selector, text: element.textContent?.trim().slice(0, 100), width: bounds.width, height: bounds.height, fontFamily: css.fontFamily, fontSize: css.fontSize, lineHeight: css.lineHeight, backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage, color: css.color };
  });
}
const report = {
  scenario,
  requests: transport.requests,
  errors,
  navigate: (route: string) => router.navigate(route),
  inspect: () => ({
    route: router.state.location.pathname + router.state.location.search,
    viewport: { width: innerWidth, height: innerHeight },
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflowingElements: Array.from(document.querySelectorAll<HTMLElement>("#root *, [data-overlay-root] *")).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).position !== "fixed" && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 30).map((el) => ({ tag: el.tagName, className: el.className, text: el.textContent?.trim().slice(0, 60) })),
    rails: computed(".ui-sidebar-rail, .ui-drawer, .ui-drawer__panel, .ui-sidebar__inner"),
    typography: computed("h1, h2, .page-header__eyebrow, .button--primary"),
    fetching: queryClient.isFetching(),
    requests: [...transport.requests], errors: [...errors]
  }),
  axe: async () => { const result = await axe.run(document.body); return { violations: result.violations, incomplete: result.incomplete, passes: result.passes.length }; }
};
Object.assign(window, { enterpriseQa: report });
declare global { interface Window { enterpriseQa: typeof report } }
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); router.dispose(); queryClient.clear(); transport.restore(); });
