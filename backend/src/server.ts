import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";

const env = loadEnvironment();
createApp({
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: 900
  }
}).listen(env.PORT, () => {
  console.log(`Lisno API listening on port ${env.PORT}`);
});
