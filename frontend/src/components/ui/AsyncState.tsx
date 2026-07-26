import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

type AsyncStateProps =
  | { state: "loading"; message: string }
  | {
      state: "empty" | "error";
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    };

export function AsyncState(props: AsyncStateProps) {
  const Icon =
    props.state === "loading"
      ? LoaderCircle
      : props.state === "error"
        ? AlertCircle
        : Inbox;

  return (
    <main
      className="async-state"
      {...(props.state === "loading"
        ? { role: "status", "aria-live": "polite" as const }
        : props.state === "error"
          ? { role: "alert" }
          : {})}
    >
      <Icon
        className={props.state === "loading" ? "async-state__spinner" : ""}
        aria-hidden="true"
      />
      <p>{props.message}</p>
      {"onAction" in props && props.onAction ? (
        <button type="button" className="button button--secondary" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </main>
  );
}
