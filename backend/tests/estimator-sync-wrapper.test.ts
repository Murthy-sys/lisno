import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("safe synchronization entrypoint wrappers", () => {
  let directory: string;
  let schedulerSource: string;
  let entrypointSource: string;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(await realpath(tmpdir()), "lisno-sync-wrapper-test-"));
    schedulerSource = await readFile(path.join(repositoryRoot, "scripts/estimator-sync-scheduler-wrapper.sh"), "utf8");
    entrypointSource = await readFile(path.join(repositoryRoot, "scripts/sync-estimator-prod-to-demo.sh"), "utf8");
  });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  async function fixture(name: string) {
    const root = path.join(directory, name);
    await mkdir(path.join(root, "scripts"), { recursive: true });
    const wrapper = path.join(root, "scheduler-wrapper.sh");
    await writeFile(wrapper, schedulerSource, { mode: 0o700 });
    return { root, wrapper, entrypoint: path.join(root, "scripts/sync-estimator-prod-to-demo.sh") };
  }

  it("forces scheduled execution to preview even when apply flags are supplied", async () => {
    const { root, wrapper, entrypoint } = await fixture("scheduler repository with spaces");
    const recorded = path.join(root, "arguments.txt");
    await writeFile(entrypoint, '#!/bin/bash\nset -euo pipefail\nprintf "%s\\n" "$@" > "$FIXTURE_LOG"\n', { mode: 0o700 });
    const result = spawnSync("/bin/bash", [wrapper, "--apply", "--plan-digest", "untrusted"], {
      cwd: directory, encoding: "utf8", env: { PATH: "/usr/bin:/bin", LISNO_SYNC_REPOSITORY: root, FIXTURE_LOG: recorded }, timeout: 10_000
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readFile(recorded, "utf8")).toBe("--dry-run\n");
  });

  it("fails safely if the configured repository entrypoint is missing", async () => {
    const { root, wrapper } = await fixture("missing-entrypoint");
    const result = spawnSync("/bin/bash", [wrapper], {
      encoding: "utf8", env: { PATH: "/usr/bin:/bin", LISNO_SYNC_REPOSITORY: root }, timeout: 10_000
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({ status: "failed", code: "SYNC_ENTRYPOINT_MISSING" });
    expect(result.stderr).not.toContain(root);
  });

  it("propagates failure from the canonical entrypoint without falling back", async () => {
    const { root, wrapper, entrypoint } = await fixture("failed-entrypoint");
    await writeFile(entrypoint, "#!/bin/bash\nexit 17\n", { mode: 0o700 });
    const result = spawnSync("/bin/bash", [wrapper], {
      encoding: "utf8", env: { PATH: "/usr/bin:/bin", LISNO_SYNC_REPOSITORY: root }, timeout: 10_000
    });
    expect(result.status).toBe(17);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("resolves the backend independent of current directory and keeps credentials out of arguments and output", async () => {
    const { root, entrypoint } = await fixture("canonical repository with spaces");
    const backend = path.join(root, "backend");
    const operation = path.join(backend, "src/operations/estimator-sync");
    await mkdir(operation, { recursive: true });
    // This fixture CLI never imports application code or creates a DB connection.
    await writeFile(path.join(operation, "cli.ts"), 'process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), credentialPresent: Boolean(process.env.LISNO_SYNC_SOURCE_URI) }) + "\\n");\n');
    await writeFile(path.join(backend, "package.json"), '{"type":"module"}\n');
    await symlink(path.join(repositoryRoot, "backend/node_modules"), path.join(backend, "node_modules"));
    await writeFile(entrypoint, entrypointSource, { mode: 0o700 });
    const result = spawnSync("/bin/bash", [entrypoint, "--dry-run", "--initialization", "review with spaces.json"], {
      cwd: directory, encoding: "utf8", timeout: 15_000,
      env: { PATH: "/usr/bin:/bin", LISNO_SYNC_SOURCE_URI: "mongodb://fixture-user:fixture-secret@source.invalid/fixture" }
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ cwd: backend, args: ["--dry-run", "--initialization", "review with spaces.json"], credentialPresent: true });
    expect(result.stdout + result.stderr).not.toContain("fixture-secret");
    expect(result.stdout + result.stderr).not.toContain("mongodb://");
  });
});
