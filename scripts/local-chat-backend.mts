import { loadDevelopmentEnvironment } from "../backend/src/config/development-env.js";
import { authorizeDevelopmentDemoStartup } from "../backend/src/development/demo-account-authorization.js";
import { startServer } from "../backend/src/server.js";

try {
  const env = loadDevelopmentEnvironment();
  const bindHost = "127.0.0.1";
  // Same local-only authorization as the existing dev server, without account provisioning.
  const developmentDemoAuthorization = authorizeDevelopmentDemoStartup(env, env.MONGODB_URI, bindHost);
  await startServer({ loadEnvironment: () => env, bindHost, developmentDemoAuthorization });
} catch {
  process.stderr.write("Local backend could not start. Check backend/.env and the local Mongo demo database.\n");
  process.exitCode = 1;
}
