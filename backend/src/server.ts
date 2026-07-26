import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createLocalStorage } from "./storage/local-storage.js";

const env = loadEnvironment();
createApp({
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: 900
  },
  storage: createLocalStorage(env.UPLOADS_DIR),
  maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024)
}).listen(env.PORT, () => {
  console.log(`Lisno API listening on port ${env.PORT}`);
});
