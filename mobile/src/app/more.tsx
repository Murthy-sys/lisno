import { MoreScreen } from "../features/settings/MoreScreen";
import { StartupRouteGate } from "../navigation/StartupRouteGate";

export default function MoreRoute() {
  return <StartupRouteGate><MoreScreen /></StartupRouteGate>;
}
