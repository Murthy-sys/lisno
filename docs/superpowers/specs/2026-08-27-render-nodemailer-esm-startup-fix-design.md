# Render Nodemailer ESM Startup Fix

## Goal

Make the compiled Lisno backend start successfully on Render under Node.js 24 by
using a Node-compatible ESM entry point for Nodemailer's SMTP connection module.

## Current behavior and evidence

- The Render build succeeds after installing development dependencies.
- `npm start` then exits with `ERR_UNSUPPORTED_DIR_IMPORT`.
- The failing compiled import is:
  `nodemailer/lib/smtp-connection`.
- The source import is in `backend/src/services/smtp-transport.ts`.
- The neighboring Nodemailer address-parser import already uses the explicit
  `index.js` ESM path.
- Nodemailer's SMTP connection module contains an `index.js` entry point, which is
  the path suggested by Node in the Render failure.
- A local module declaration and focused mailer tests currently reference the same
  directory-style specifier and must remain aligned with the runtime import.

## Scope

- Change the runtime SMTP connection import to
  `nodemailer/lib/smtp-connection/index.js`.
- Align the local TypeScript declaration with that exact module specifier.
- Align focused Vitest mocks/unmocks with that exact module specifier.
- Verify compilation, focused invitation/estimate mail tests, and direct loading of
  the built SMTP transport module.

## Non-goals

- Changing SMTP behavior, timeouts, TLS, authentication, or failure classification.
- Enabling SMTP on Render Free, whose common SMTP ports remain blocked.
- Changing the Render instance plan, environment variables, Atlas data, or upload
  persistence.
- Deploying, committing, or pushing without separate explicit authorization.
- Upgrading or downgrading Node.js, Nodemailer, or any dependency.

## Requirements and constraints

- Preserve NodeNext ESM imports and the repository's `.js` suffix convention.
- Keep the runtime import, ambient module declaration, and test mocks identical.
- Do not add dependencies or modify lockfiles.
- Preserve existing SMTP transport security and delivery semantics.
- Preserve all unrelated dirty worktree changes.

## Risks

- Updating only the runtime import would leave TypeScript declarations or mocks
  mismatched and could hide a regression.
- Mailer tests mock a deep Nodemailer path; all exact specifiers must change together.
- Passing startup import verification does not make SMTP usable on Render Free.

## Data, API, and UX impact

- No schema, data, API, authorization, finance, or UI change.
- No external email is sent during verification.
- The only runtime effect is that Node can resolve the existing SMTP transport class
  during backend startup.

## Acceptance criteria

1. The compiled SMTP transport module imports the explicit
   `nodemailer/lib/smtp-connection/index.js` file.
2. TypeScript resolves the deep import without ambient-declaration errors.
3. Invitation and estimate mailer focused tests pass with no real network delivery.
4. Backend typecheck and production build pass.
5. Importing the built SMTP transport module under the repository's supported Node
   runtime succeeds without `ERR_UNSUPPORTED_DIR_IMPORT`.
6. No secrets, dependency changes, Render mutations, email delivery, commit, push, or
   deployment occurs as part of local implementation.

## Assumptions

- Render continues using `npm start` after a successful production build.
- Node.js 24 is an acceptable runtime for the current dependency set.
- The Render screenshot represents the current `feature/phase1_module1` deployment.

## Rollback

- Revert the bounded import/declaration/test-specifier changes.
- No data rollback is required because the fix does not mutate persisted state.

## Open decisions

- None. The Node error supplies the exact compatible file entry point and the
  repository already uses explicit ESM file paths.

