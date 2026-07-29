# Task 1 report: failing disclosure tests

## Files changed

- `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx` (created)

No production files were modified.

## Test command

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

## Output summary

- Result: failed as expected: 1 failed, 1 passed (2 tests total).
- The client-disclosure test fails at the initial collapsed-state assertion: `Bengaluru` is rendered in the `Aurora Villa` card before its disclosure is opened.
- The non-client manager regression test passes: manager metadata and the assignment control remain immediately visible, with no project disclosure button.

## Expected failure reason

The existing client implementation renders location, client identity, item count, estimate breakdown, status, and available decision controls immediately in every estimate card. It has no estimate-level disclosure button, independent expanded state, or controlled panel IDs. The new client test therefore correctly fails before the requested feature is implemented.

## Self-review

- Fixtures use two client estimates with the required IDs, projects, totals, and statuses; the ready estimate includes a valid `FC01` catalogue line item for the section-breakdown assertion.
- The client test verifies both initial collapse and independent expand/collapse behavior, scopes overlapping content with `within(...)`, and verifies unique explicit panel IDs.
- The manager test protects the existing always-visible non-client workflow.
- Test expectations use Indian-formatted currency literals (`₹1,18,000` and `₹2,36,000`) and the final failure is behavioral rather than a fixture, API, selector, or formatting error.
- `git diff --cached --check` completed cleanly before commit.

## Commit

`b5a6f90c19b93077fc70a653ad3a5ab267ee4bde` — `test: cover collapsible client estimate cards`
