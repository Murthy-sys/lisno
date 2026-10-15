import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function bundleReactFrom(launchDirectory: string) {
  const options = {
    entryPoints: [require.resolve("react"), require.resolve("react-dom/client")],
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' },
    outdir: resolve(frontendDirectory, "node_modules/.tmp/react-cache-regression"),
    write: false
  };
  const script = `
    const { build } = require(${JSON.stringify(require.resolve("esbuild"))});
    const { loadConfigFromFile } = require(${JSON.stringify(require.resolve("vite"))});
    const { createHash } = require("node:crypto");
    const { basename } = require("node:path");
    loadConfigFromFile(
      { command: "serve", mode: "development" },
      ${JSON.stringify(resolve(frontendDirectory, "vite.config.ts"))},
      ${JSON.stringify(frontendDirectory)}
    ).then(({ config }) => build({
      ...${JSON.stringify(options)},
      ...config.optimizeDeps?.esbuildOptions
    })).then(({ outputFiles }) => {
      process.stdout.write(JSON.stringify(outputFiles.map(({ path, contents }) => ({
        name: basename(path),
        hash: createHash("sha256").update(contents).digest("hex")
      })).sort((left, right) => left.name.localeCompare(right.name))));
    }).catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: launchDirectory,
    encoding: "utf8",
    timeout: 10_000
  });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("Vite React dependency cache", () => {
  it("produces identical React modules from repository and frontend launch directories", () => {
    // Vite's dependency cache version does not include the launch directory.
    // Different chunk names behind that same version can mix React instances.
    const repositoryOutput = bundleReactFrom(resolve(frontendDirectory, ".."));
    const frontendOutput = bundleReactFrom(frontendDirectory);

    expect(repositoryOutput).toEqual(frontendOutput);
  });
});
