import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import type { ButtonVariant } from "./Button";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: ReactNode;
  tooltip?: string;
  variant?: ButtonVariant;
  busy?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tooltip, variant = "primary", busy = false, className, disabled, type, ...rest },
  ref
) {
  const classes = ["ui-icon-button", `ui-icon-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  const button = (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      {...rest}
      aria-label={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-busy={busy || undefined}
    >
      {busy ? <Spinner /> : icon}
    </button>
  );

  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button;
});
