import type { TaskRisk } from "../../api/types";
import { StatusBadge } from "../ui/StatusBadge";

const labels = {
  gray: "Not started risk",
  green: "Green risk",
  yellow: "Yellow risk",
  red: "Red risk"
} as const;

const tones = {
  gray: "neutral",
  green: "success",
  yellow: "warning",
  red: "danger"
} as const;

export function RiskBadge({ risk }: { risk: TaskRisk }) {
  return (
    <StatusBadge
      label={labels[risk.level]}
      reason={risk.reason}
      tone={tones[risk.level]}
    />
  );
}
