export type ProgressBarProps =
  | {
      value: number;
      label?: string;
      valueText?: string;
    }
  | {
      value?: undefined;
      label: string;
      valueText?: never;
    };

export function ProgressBar(props: ProgressBarProps) {
  const bounded = props.value === undefined ? undefined : Math.min(100, Math.max(0, props.value));
  const label = props.label ?? `${bounded}% complete`;

  return (
    <div
      className={`ui-progress${bounded === undefined ? " ui-progress--indeterminate" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuetext={bounded === undefined ? undefined : props.valueText}
      {...(bounded === undefined
        ? {}
        : {
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": bounded
      })}
    >
      <span className="ui-progress__value" style={bounded === undefined ? undefined : { width: `${bounded}%` }} />
    </div>
  );
}
