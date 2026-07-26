export function ProgressBar({
  value,
  label = value === undefined ? "Progress" : `${value}% complete`
}: {
  value?: number;
  label?: string;
}) {
  const bounded =
    value === undefined ? undefined : Math.min(100, Math.max(0, value));
  return (
    <div
      className={`progress${bounded === undefined ? " progress--indeterminate" : ""}`}
      role="progressbar"
      aria-label={label}
      {...(bounded === undefined
        ? {}
        : {
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": bounded
          })}
    >
      <span style={bounded === undefined ? undefined : { width: `${bounded}%` }} />
    </div>
  );
}
