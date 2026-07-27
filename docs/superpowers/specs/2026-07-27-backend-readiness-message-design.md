# Backend Readiness Message Design

## Problem

The backend's `npm run dev` command stays active because it runs `tsx watch`, but
successful startup produces no output. This makes a healthy, running backend look
like it is still starting.

## Design

After MongoDB connects and Express successfully begins listening, the server will
write one line to standard output:

```text
Backend ready at http://localhost:3000
```

The message will use the validated `PORT` environment value. It will not be
printed when MongoDB connection or HTTP listening fails. Existing startup error
reporting and watch-mode behavior will remain unchanged.

The output function will be injectable through `startServer` dependencies, with
`process.stdout.write` as the production default. This keeps the behavior
testable without globally intercepting process output.

## Testing

A server bootstrap test will assert that:

- the readiness message is written after successful listening;
- the message contains the configured port;
- failed listening does not produce a readiness message.

The complete backend test suite, TypeScript typecheck, and production build will
be run after implementation.

## Scope

This change adds startup feedback only. It does not change ports, MongoDB
connection behavior, process lifetime, or file-watching behavior.
