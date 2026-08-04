import {
  cloneElement,
  useId,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement
} from "react";

export interface TooltipProps {
  label: string;
  children: ReactElement;
  placement?: "top" | "right" | "bottom" | "left";
}

type TooltipChildProps = {
  "aria-describedby"?: string;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

export function Tooltip({ label, children, placement = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const child = children as ReactElement<TooltipChildProps>;
  const describedBy = [child.props["aria-describedby"], open ? id : undefined]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <span className="ui-tooltip-wrapper">
      {cloneElement(child, {
        "aria-describedby": describedBy,
        onFocus: (event: FocusEvent<HTMLElement>) => {
          child.props.onFocus?.(event);
          setOpen(true);
        },
        onBlur: (event: FocusEvent<HTMLElement>) => {
          child.props.onBlur?.(event);
          setOpen(false);
        },
        onPointerEnter: (event: PointerEvent<HTMLElement>) => {
          child.props.onPointerEnter?.(event);
          setOpen(true);
        },
        onPointerLeave: (event: PointerEvent<HTMLElement>) => {
          child.props.onPointerLeave?.(event);
          setOpen(false);
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          child.props.onKeyDown?.(event);
          if (event.key === "Escape") setOpen(false);
        }
      })}
      {open ? (
        <span id={id} className={`ui-tooltip ui-tooltip--${placement}`} role="tooltip">
          {label}
        </span>
      ) : null}
    </span>
  );
}
