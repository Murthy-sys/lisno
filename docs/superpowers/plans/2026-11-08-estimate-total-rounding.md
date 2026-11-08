# Final estimate total rounding implementation

1. Add integer-paise rounding and reconciliation helpers in backend and shared estimation domains; test identical boundary and overflow behavior.
2. Persist the optional signed adjustment from staff, quotation and tier/dimensions writers; document optional API contracts.
3. Use rounded grand totals in editable previews and saved totals in frozen views; render signed adjustments in all estimate summaries.
4. Preserve adjustment evidence in publication, reviews, revisions, PDFs and finance baselines without rewriting legacy snapshots.
5. Validate save paths, frontend views, PDF/publication and finance behavior with focused suites and both production builds; restart the local non-watching backend after validation.

Validation completed: 196 writer tests, 262 publication/review/PDF tests, downstream assistant/PM/status suites, finance/procurement/domain checks, 219 frontend tests, and production builds. Browser verification confirmed 86.64 + 15.60 - 0.24 = 102 with no horizontal overflow at desktop and 390px widths. No estimate was saved during browser testing.

Known unrelated failure: dashboard test “retains unequal v3 approved baselines and issued task scope after quotation unlock” also fails on a clean committed HEAD. It was excluded only from the focused finance rerun; no workflow behavior or approval gates were changed to accommodate it.
