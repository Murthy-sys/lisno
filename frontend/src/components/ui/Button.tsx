import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "compact" | "default" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  busyLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "default",
    busy = false,
    busyLabel,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className,
    disabled,
    type,
    children,
    ...rest
  },
  ref
) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth && "ui-button--full-width",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-busy={busy || undefined}
    >
      <span className="ui-button__stack">
        <span className="ui-button__content">
          {leadingIcon ? <span className="ui-button__icon" aria-hidden="true">{leadingIcon}</span> : null}
          <span>{children}</span>
          {trailingIcon ? <span className="ui-button__icon" aria-hidden="true">{trailingIcon}</span> : null}
        </span>
        <span className="ui-button__busy" aria-hidden="true">
          <Spinner />
          <span>{busyLabel ?? "Working…"}</span>
        </span>
      </span>
    </button>
  );
});
