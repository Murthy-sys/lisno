import { createApp } from "./app.js";
import { env } from "./config/env.js";

createApp().listen(env.PORT, () => {
  console.log(`Lisno API listening on port ${env.PORT}`);
});
