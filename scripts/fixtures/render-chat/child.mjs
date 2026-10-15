// Synthetic lifecycle fixture. It never imports application code or opens a DB.
const behavior = process.argv[2];
if (behavior === "fail") process.exit(23);
if (behavior === "ignore-term") process.on("SIGTERM", () => {});
else process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
setInterval(() => {}, 1_000);
process.send?.({ ready: true });
