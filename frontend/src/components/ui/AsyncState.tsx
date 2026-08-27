import { SectionState } from "./SectionState";

type AsyncStateProps =
  | { state: "loading"; message: string }
  | {
      state: "empty" | "error";
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    };

export function AsyncState(props: AsyncStateProps) {
  return (
    <SectionState
      state={props.state}
      message={props.message}
      statusLabel="Content status"
      action={
        "onAction" in props && props.onAction && props.actionLabel
          ? { label: props.actionLabel, onAction: props.onAction }
          : undefined
      }
    />
  );
}
