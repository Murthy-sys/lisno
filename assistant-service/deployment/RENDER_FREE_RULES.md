# Ask Lisno rules chat on the existing Render service

This setup runs the existing Node backend and a separate, lightweight Python rules process in the same `lisno` Render service and monorepo. Keep the existing Free plan, Oregon region and `https://lisno.onrender.com` address. OCR remains separate and unchanged. Chat uses no model, Gemini, other cloud AI API, or Mac service.

The assistant supports bounded project questions, greetings, progress, recorded schedules and existing published/approved customer estimates. It asks for clarification for unsupported wording. It cannot generate arbitrary Gemini-style answers, price new work, disclose Configuration prices, or change project records.

## 1. Make the reviewed source available

The Render-connected Git branch must contain the completed changes. Local files do not automatically reach Render. No commit, push or deployment was performed as part of this implementation. Review and publish the intended files through your normal release process before changing the service commands. Preserve the earlier Node Python adapter and web/native crash repairs already in this workspace; the new rules package depends on that existing adapter.

Required new runtime files are:

- `scripts/render-build.sh` and `scripts/render-start.mjs`
- `assistant-service/rules-requirements.lock`
- `assistant-service/src/lisno_assistant/rules_settings.py`, `rules_planner.py`, `rules_app.py`, `rules_main.py`
- Existing `assistant-service/src/lisno_assistant/contracts.py`, `planner.py`, and package `__init__.py`

Include the reviewed web/mobile chat changes in their normal application releases too. The backend scripts do not build or publish those applications.

## 2. Record existing settings and configure the same service

In Render, open **lisno → Settings**. Privately record the current root directory, build/start commands, health path and last working deployment. Preserve all unrelated environment values, database/storage settings and URLs. Do not paste credentials into chat or screenshots.

Use these Build & Deploy settings together:

These commands require a native Node service. If the existing runtime is Docker, do not apply native build/start settings to it; retain the working deployment until its packaging has been checked.

| Setting | Value |
| --- | --- |
| Runtime | Keep the existing Node runtime |
| Root Directory | Empty, meaning the repository root |
| Build Command | `bash scripts/render-build.sh` |
| Start Command | `node scripts/render-start.mjs` |
| Health Check Path | `/api/v1/health` |
| Compute Plan | Free |
| Region | Keep Oregon |

If build filters are configured, ensure changes in `backend/**`, `assistant-service/**` and `scripts/render-*` can trigger the intended release. The repository root is required because Render excludes files outside a configured root directory. [Render monorepo documentation](https://render.com/docs/monorepo-support)

Do not apply the existing root `render.yaml`: it describes a different paid/region setup. Do not create another service, start OCR, run a seed, or change the public `PORT` for this setup.

The build script checks for Python 3.11 or newer, runs the established backend install/build, and installs the small pinned rules runtime into `assistant-service/dist/rules-venv`. It does not install model weights or OCR. If the build reports unsupported/missing Python or unavailable binary dependencies, keep the working release and diagnose that build before proceeding. No shell provisioning is required.

## 3. Add server-only environment settings

In **lisno → Environment**, add or update:

| Key | Initial value |
| --- | --- |
| `ASSISTANT_MODE` | `rules` |
| `ASSISTANT_SERVICE_URL` | `http://127.0.0.1:8080` |
| `ASSISTANT_RULES_PORT` | `8080` |
| `ASSISTANT_SERVICE_TOKEN` | A newly generated secret, at least 32 characters |
| `ASK_LISNO_ENABLED` | `false` |
| `PROJECT_CHAT_AI_ENABLED` | `false` |

Generate the token with a password manager or run `openssl rand -hex 32` in your own terminal. Paste the result only into Render's secret environment field. It must contain printable ASCII with no spaces and be 32–512 characters long. Never place it in a browser/mobile environment variable, source file, URL or command argument.

Keep the exact loopback URL above with no trailing slash or path. The Python listener is private to this service, not an extra public endpoint. The launcher passes Python only its token, port and necessary runtime paths. MongoDB, JWT, cloud keys and proxy settings stay outside the Python environment. Existing API flags remain independent; `ASSISTANT_MODE=rules` allows readiness checks even while both flags are false.

No model URL/name/digest or Gemini key is needed for chat. Leave unrelated credentials alone because other existing features may use them.

## 4. Deploy with chat disabled and verify ordinary functionality

Manually deploy the reviewed branch with the settings above. Check the build log for `Backend and model-free Python rules runtime built.` and the runtime log for `[lisno-launcher] rules-ready`.

Verify `/api/v1/health`, login, projects and ordinary human Project Messages in web and mobile before enabling assistant requests. The health route reports Node availability; it does not substitute for the launcher's authenticated Python readiness check.

Launcher status messages contain operational events only:

| Event | Meaning/action |
| --- | --- |
| `rules-ready` | Authenticated rules endpoint passed readiness |
| `rules-invalid-config-disabled` | Check the exact mode, URL, port and token format; assistant flags were disabled for Node |
| `rules-spawn-failed` | Confirm the rules venv was built in this release |
| `rules-readiness-failed` | Check the completed build and port configuration |
| `rules-restarts-exhausted` | Python did not recover within bounded retries; keep chat disabled and investigate |
| `backend-exited` | Existing Node process ended; investigate its normal startup/runtime log |
| `backend-drain-timeout` | Backend cleanup exceeded its shutdown allowance; the launcher force-stopped it and returned failure |

Python can fail while the ordinary Node app stays available. Do not take a healthy Node page as proof that chat is ready.

On shutdown the launcher gives Node 25 seconds to drain, keeping Python available, then allows 2 seconds for Python cleanup. This fits Render's default 30-second shutdown grace. Leave `LISNO_NODE_DRAIN_MS` unset for that default. Only after independently increasing Render's platform shutdown grace may you set this optional launcher value to 25000–295000 milliseconds; allow at least 5 seconds beyond it in the platform setting. Invalid overrides use the default and log `backend-drain-config-invalid-default`. No platform shutdown setting was changed here. [Render graceful shutdown](https://render.com/docs/deploys)

## 5. Enable and test each surface

Set `ASK_LISNO_ENABLED=true`, deploy/restart through Render, and test with a designated synthetic Client/project:

1. `Hi` returns a greeting.
2. **My projects** lists only that Client's projects.
3. Select a project, then use **Project progress** and **Timeline**, or type `Show my project progress` / `Show my project timeline`.
4. Use **Published estimate**, whose request is `Show my estimate`. Confirm the displayed amount matches that project's existing published/approved report and currency units. If no report exists, clarification is expected.
5. Ask `Show configured prices`: no internal price or configuration value should appear.
6. Ask an unsupported question: clarification should render as an answer, not a retry failure.
7. Sign in with a different synthetic Client. Confirm the first Client's projects, prices and history are unavailable.

Then set `PROJECT_CHAT_AI_ENABLED=true` and verify Project Messages with the same synthetic project. Existing timing stays intact: automatic replies wait two minutes for a human reply; an explicit **Ask Lisno** action can request an answer immediately. A human response suppresses a pending automatic answer. Private Ask Lisno conversations never become shared Project Messages. Workers without price access must not see estimate amounts in a shared result.

Use the quick prompts first. The preserved backend project-name parser is conservative; some other wording, including `Show my published estimate`, may prompt for a project name. The tested price prompt is `Show my estimate`, and it still reads only published/approved customer data.

## 6. Check the Free instance remotely

Render currently lists Free web services as **512 MB RAM and 0.1 CPU**. Both processes share this allocation. [Render compute plans](https://render.com/docs/compute-plans)

Local tests cannot establish capacity on the Render instance. Observe the service's **Metrics** CPU/memory charts during ordinary app use and a small sequence of synthetic chat requests. Record baseline and peak memory, successful requests, restarts and errors. The charts report service resource usage; process-level RSS was not measured here. [Render service metrics](https://render.com/docs/service-metrics)

Record first-response and warm-response times in browser network tools without exporting authorization headers or customer payloads. Repeat after a manual restart and after an idle cold start. Confirm both Node and `rules-ready` recover. Keep enough memory headroom for existing backend work; if the combined processes cause memory pressure or ordinary app regressions, disable the assistant flags and roll back the launcher release while investigating. No capacity or latency guarantee has been established.

Render Free services sleep after 15 minutes without inbound traffic and can take about a minute to wake. Free services have no shell access or persistent disk. This rules package does not require either, and it does not send keep-awake pings. These hosting limits apply even when replies are deterministic. [Render Free limitations](https://render.com/docs/free)

## 7. Roll back if needed

First set both assistant feature flags to `false` so normal backend functionality can continue. For full rollback, restore the recorded root/build/start settings and the last verified deployment using Render's deployment controls. Restore matching settings together: old backend-relative commands cannot be used with a new repository-root setting by accident. Confirm health, login, projects and ordinary messages again.

Do not delete the service or stored business data. This change adds no database schema, data migration, seed or backfill. Keep the token server-only; if restoring a model-era release, keep the assistant flags disabled so that release cannot resume a cloud/model chat path.

## Verification status

Local verification passed 743 targeted tests (Python 230, launcher 36, backend 268, web 117, mobile 92), all three TypeScript checks, shell syntax and diff checks. Exact commands, preservation checks and browser/native-rendered evidence are recorded in the [implementation task plan](../../docs/superpowers/plans/2026-10-15-free-render-rules-assistant.md). Actual Render Linux dependency installation, deployed startup/restart, resource headroom, cold-start latency and physical-device behavior remain release checks until performed on the target service. The Mac does not need to stay on after deployment.
