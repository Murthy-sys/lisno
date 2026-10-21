import { ProfileScreen } from "../features/profile/ProfileScreen";
import { StartupRouteGate } from "../navigation/StartupRouteGate";

export default function ProfileRoute() {
  return <StartupRouteGate><ProfileScreen /></StartupRouteGate>;
}
