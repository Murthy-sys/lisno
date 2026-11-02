import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/assets/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/assets/lisno-logo.svg", import.meta.url),
  new URL("../dist/assets/lisno-logo.svg", import.meta.url)
);

// Package every template asset and its font licence; compiled rendering must not
// depend on source files, host fonts or a network connection.
await cp(
  new URL("../src/assets/estimate-proposal/", import.meta.url),
  new URL("../dist/assets/estimate-proposal/", import.meta.url),
  { recursive: true }
);
