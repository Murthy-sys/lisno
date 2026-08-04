import { PageHeader } from "../components/ui/PageHeader";
import { PageState, type PageStateProps } from "../components/ui/PageState";

export interface AuthRouteStateProps extends PageStateProps {
  title: string;
}

export function AuthRouteState({ title, ...stateProps }: AuthRouteStateProps) {
  return (
    <main className="auth-route-state" id="main-content">
      <PageHeader id="auth-route-title" title={title} />
      <PageState {...stateProps} />
    </main>
  );
}
