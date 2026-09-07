import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { InlineMessage } from "./InlineMessage";
import { BrandLoadingMark } from "./BrandLoadingMark";

export interface StateAction {
  label: string;
  onAction: () => void;
}

export interface PageStateProps {
  state: "loading" | "empty" | "error";
  message: string;
  statusLabel?: string;
  skeleton?: ReactNode;
  action?: StateAction;
}

function DefaultLoadingVisual() {
  return (
    <div className="lisno-page-loader">
      <BrandLoadingMark />
    </div>
  );
}

export function StateContent({
  state,
  message,
  statusLabel = "Content status",
  skeleton,
  action
}: PageStateProps) {
  if (state === "loading") {
    return (
      <>
        <div className="ui-state__skeleton" aria-hidden="true">
          {skeleton ?? <DefaultLoadingVisual />}
        </div>
        <p className="lisno-loading-message" role="status" aria-label={statusLabel}>
          {message}
        </p>
      </>
    );
  }

  if (state === "error") {
    return (
      <InlineMessage
        tone="error"
        action={
          action ? (
            <Button variant="secondary" onClick={action.onAction}>
              {action.label}
            </Button>
          ) : undefined
        }
      >
        {message}
      </InlineMessage>
    );
  }

  return (
    <div className="ui-state__empty">
      <Inbox aria-hidden="true" />
      <p>{message}</p>
      {action ? (
        <Button variant="secondary" onClick={action.onAction}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function PageState(props: PageStateProps) {
  return (
    <section
      className={`ui-page-state ui-page-state--${props.state}`}
      data-page-state={props.state}
      aria-busy={props.state === "loading" || undefined}
    >
      <StateContent {...props} />
    </section>
  );
}
