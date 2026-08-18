import { authorizeDevelopmentDemoStartup } from "../../src/development/demo-account-authorization.js";

const DEVELOPMENT_DEMO_MONGODB_URI =
  "mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0";

export function developmentDemoAuthentication() {
  return authorizeDevelopmentDemoStartup(
    { NODE_ENV: "development" },
    DEVELOPMENT_DEMO_MONGODB_URI,
    "127.0.0.1"
  );
}
