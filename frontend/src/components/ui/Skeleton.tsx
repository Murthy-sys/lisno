import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  shape?: "text" | "circle" | "block";
}

export function Skeleton({
  shape = "text",
  className,
  "aria-label": _ariaLabel,
  "aria-labelledby": _ariaLabelledBy,
  ...rest
}: SkeletonProps) {
  const classes = ["ui-skeleton", `ui-skeleton--${shape}`, className]
    .filter(Boolean)
    .join(" ");

  return <span {...rest} className={classes} aria-hidden="true" />;
}
