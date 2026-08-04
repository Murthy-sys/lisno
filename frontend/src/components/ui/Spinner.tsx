export interface SpinnerProps {
  size?: "small" | "medium";
  className?: string;
}

export function Spinner({ size = "medium", className }: SpinnerProps) {
  const classes = ["ui-spinner", `ui-spinner--${size}`, className].filter(Boolean).join(" ");

  return <span className={classes} aria-hidden="true" />;
}
