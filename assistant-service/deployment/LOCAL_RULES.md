# Test rules chat locally

The normal backend development command runs one Node API, the separate lightweight Python rules service, and the existing OCR extraction worker. Chat does not run an AI model or use Gemini/OpenAI. Startup does not provision demo accounts or rewrite `.env`. Python chat receives only its internal service token and minimal runtime settings. The token is generated per launch and is never a cloud AI key. OCR retains its existing extraction configuration.

## One-time setup

Run from the repository root with Python 3.11 or newer:

```sh
python3 -m venv assistant-service/dist/rules-venv
assistant-service/dist/rules-venv/bin/python -m pip install --only-binary=:all: -r assistant-service/rules-requirements.lock
```

On this Mac, the installed interpreter is `/opt/homebrew/opt/python@3.11/bin/python3.11` if `python3` is older. The ignored `assistant-service/dist/rules-venv` environment has been prepared. No model dependencies are installed.

## Start

Keep your existing local MongoDB running. This development entrypoint deliberately requires the same loopback `lisno_demo` database as the ordinary development backend and uses its existing accounts. It refuses remote/production databases and does not seed data.

Stop the existing backend terminal with Ctrl+C once before switching to the corrected startup. For backend, chat and OCR together, use the normal command:

```sh
cd backend
npm run dev
```

Wait for `rules-ready`, `Backend ready at http://127.0.0.1:3000`, and `Backend is ready; starting OCR worker.` The existing OCR `.venv` must already be set up. Its API target must be this same loopback backend; a remote or different destination is rejected before child startup.

This command includes the backend, chat and OCR; run it in one terminal only. `npm run dev:backend` is the low-level backend-only command and does not start or connect Python chat. For an intentional chat-only session without extraction, run `node scripts/local-chat.mjs` from the repository root instead. The frontend dev server still runs separately as shown below.

The launcher reads existing backend settings from `backend/.env`, enables both chat surfaces for this process, and supplies a private `http://127.0.0.1:8080` Python connection. An occupied port produces an instruction to stop the existing service; it never kills an unrelated process automatically. Optional `PORT` and `ASSISTANT_RULES_PORT` must be distinct ports between 1024 and 65535.

Keep the existing frontend dev server, or start it in a separate terminal:

```sh
cd frontend
npm run dev
```

Open `http://localhost:5173`, sign in with your existing local client account and open Ask Lisno. The frontend API stays `http://localhost:3000/api/v1`. Try `Hi`, `may i know my project status`, the project-progress prompt and published-estimate prompt. An account without accessible projects receives a clarification. Multiple projects require a selection. Unsupported questions receive a clarification instead of invented information.

The rules also recognize explicit concern, frustration, confusion and urgency. For example, `I'm worried, may I know my project status?` acknowledges the concern and keeps the status question. Greetings and acknowledgments may use the account's safe first name. These are bounded wording rules, not general mood understanding; ambiguous wording stays neutral and no mood profile is stored. Names stay in Node and are not sent to Python.

For mobile, choose the existing local API environment, not the deployed Render environment. iOS Simulator can use `http://localhost:3000/api/v1`; Android Emulator uses `http://10.0.2.2:3000/api/v1`. An Android USB device can use an explicitly configured `adb reverse tcp:3000 tcp:3000` and a local `http://127.0.0.1:3000/api/v1` app URL. The local API intentionally binds loopback; do not expose demo accounts on the LAN. A physical iPhone needs a separately approved secure development connection; its own localhost is not this Mac. Preserve the app's existing development-only HTTP policy.

In Project Messages, use the existing Ask Lisno action as an eligible client. Those replies are shared in that project. Private Ask Lisno conversations stay private.

Press Ctrl+C in the backend terminal to stop its backend, Python chat and OCR worker together. Restart `npm run dev` after backend/Python source edits. This combined command replaces the old backend watcher with an explicitly supervised session and does not invoke bootstrap scripts. Frontend hot reload is unchanged. The combined wrapper reaps its owned children before the outer supervisor deadline, including forced cleanup if a child ignores termination. This preserves OCR's existing termination behavior and leased-job recovery; it does not add an extraction drain protocol. Normal system sleep is allowed after development work. This launcher is for local testing and is not an installed background or login service.

## Move to Render later

Use [the Render Free guide](RENDER_FREE_RULES.md) with the same Python folder and rules entrypoint. Local changes do not deploy themselves. No commit, push or deployment has been performed. Existing OCR extraction remains separate.
