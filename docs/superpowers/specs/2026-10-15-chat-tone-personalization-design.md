# Ask Lisno tone and name personalization

Status: specification approved by the user. This is an addition to the approved free rules assistant; the local connection and reported 503 repair continue independently.

## Goal and evidence

Respond naturally to clear expressions of frustration, concern, urgency, greeting and thanks, and use the authenticated user's preferred account name sparingly. This is deterministic wording recognition, not a claim to know someone's emotional state or a mental-health assessment.

The existing Python provider already recognizes a small set of whole-message social replies (`backend/src/services/project-assistant-python.ts`). It does not reliably handle tone followed by a project question. Private Ask Lisno reauthorizes the current profile before delivery (`ask-lisno.service.ts`); shared runs have an authenticated initiating client in `project-assistant-runtime.ts`. Personalizing a shared answer with the viewing user's name would be incorrect.

## Requirements and boundaries

- Keep the Python rules service, zero cloud AI calls and no model runtime. Names stay in Node and never enter the Python protocol. No new packages or account fields.
- Recognize only explicit, bounded wording, such as “I'm frustrated”, “I'm worried”, “this is urgent”, and “thank you”. Neutral or ambiguous wording stays neutral. Do not infer mood from capitalization, punctuation, spelling, demographic characteristics or project facts.
- Preserve the underlying question: “I'm worried, may I know my project status?” still retrieves authorized project status. Acknowledge once, then present verified facts. Do not assert unrecorded delays, reasons, promises or deadlines.
- Preserve full original text for privacy, mutation and negation checks. Tone handling cannot relax project authorization, convert unsupported instructions into supported reads, or omit a required shared-message fragment.
- Use the fresh authenticated account's first display-name token only when suitable in a greeting, thanks or explicit concern acknowledgment. Trim and reject control/markup content; use a neutral reply when no safe name is available. Do not extract names from a message or guess them.
- Shared replies address only the initiating client whose messages were selected for that run. Every viewer sees the same published response. If authorship is ambiguous, omit the name. Avoid generating @mentions or additional notifications.
- No persistent mood classification, emotional profile, new logs, analytics, diagnosis or schema migration. All existing project-price and internal-information restrictions remain authoritative.
- Preserve mobile/web layout and message contracts. Both clients render the same server-produced wording. Ordinary human messages and OCR stay unchanged.
- Unavailable transport remains an honest service failure. Tone/name handling cannot manufacture project answers or conceal errors.

## Recommended implementation

Use a small deterministic Node-side presentation helper after validated provider output and fresh authorization/source checks. Extend only the conservative tone-prefix rules required to route the remaining question through the existing Node/Python planner. Preserve the existing response shape, immutable shared publication and idempotency. Do not add an LLM, sentiment service or viewer-side personalization.

## Acceptance and verification

1. Greeting and thanks can include the authenticated name once; empty/unsafe names yield normal neutral wording.
2. Explicit frustration/concern/urgency plus status/timeline/estimate still returns the correct authorized facts, with a short suitable acknowledgment.
3. Quoted, negated or third-person mood wording does not mislabel the user. Unknown wording asks for clarification without claiming emotional understanding.
4. Mixed internal-price, write, negated and foreign-project requests retain existing protections and cannot be reduced to a safe fragment.
5. Private account changes and shared requester/viewer differences cannot leak or misattribute a name. Two asymmetric identities/projects cover these cases.
6. No raw name or new sensitive field is sent to Python; no cloud API or model path is introduced; no mood is persisted.
7. Real Node-to-Python tests and web/native rendered tests cover greeting, concern plus project question, shared attribution, neutral fallback and service failure.

## Risks, compatibility and rollback

Rules cover a bounded vocabulary and will miss subtle tone. First-token names may not suit every naming convention, so use names sparingly and keep neutral fallback. The existing backend protocol and persisted response schema remain unchanged. Rollback removes the presentation/prefix additions without a migration or changing stored business data. No production deployment is authorized by this specification.

## Open decisions

None required for specification approval. The conservative defaults above are recommended; the separate task plan will name exact ownership and checks after approval.
