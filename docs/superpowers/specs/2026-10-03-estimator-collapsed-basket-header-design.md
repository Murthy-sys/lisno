# Estimator collapsed Main Basket header alignment

Date: 2026-10-03  
Status: Approved and implemented

## Goal and current behavior

Keep each collapsed Main Basket header in the Estimator item builder as one coherent control: basket icon and name at the start, item count and subtotal at the end, and the disclosure chevron aligned with them. The supplied screenshot shows collapsed Functional Lights and Painting headers with the name and totals pushed right, a stray plus sign at the left, the chevron on a second row, and the Painting subtotal clipped.

The header button in `ConfiguredEstimateBuilder.tsx` renders five children: basket SVG, name, count, subtotal, and chevron SVG. `estimator-dashboard.css` gives that button five grid columns. Its older base rule adds a `::before` minus sign, and a more specific `[aria-expanded="false"]::before` rule changes it to plus. The later visual styling uses `content: none` on the less-specific base pseudo selector. On collapsed buttons, the plus rule wins, producing six grid items and the observed layout shift. Expanded headers do not receive the more specific plus rule, explaining why POP / Gypsum remains aligned in the screenshot.

## Scope and requirements

- Remove the legacy plus/minus pseudo-element in both collapsed and expanded states so the five rendered children occupy the five intended columns. Retain the current SVG basket icon and disclosure chevron.
- Preserve the button's full-width click target, keyboard focus treatment, `aria-expanded`, count, subtotal, and existing expand/collapse behavior.
- Keep basket name, count, subtotal, and chevron readable and aligned at desktop and phone widths. A long basket name may wrap within its own column; it must not push the count, subtotal, or chevron outside the basket or create a second row solely for the chevron.
- Limit the change to the Estimator Main Basket header CSS. Leave Sub-Basket rows, recommendation alert/modal, saved line data, estimate totals, and backend/API behavior intact.

## Assumptions, constraints, and risk

- The screenshot's collapsed headers are the target. Existing SVGs are the intended disclosure affordance; no new icon or markup is needed.
- The worktree already contains approved, uncommitted recommendation changes in the same stylesheet and builder. Preserve those diffs and edit only the relevant header rules.
- The main risk is a selector with higher specificity reintroducing the pseudo-element at a responsive breakpoint. Check computed `::before` content and grid child positions in both states at desktop and 390 px.
- There is no data, permission, financial, API, migration, dependency, or persistence impact.

## Acceptance criteria

1. Collapsed Functional Lights, Painting, and other Main Basket headers show the basket SVG, name, count, subtotal, and chevron in the intended order without a stray plus/minus glyph or wrapped chevron.
2. Expanded headers remain aligned; toggling via pointer and keyboard updates content visibility and `aria-expanded` as before.
3. At desktop and 390 px, long names fit or wrap within the name column, amounts remain visible, and neither the header nor document overflows horizontally.
4. Focused frontend checks, rendered collapsed/expanded screenshots, `git diff --check`, and a final dirty-path review pass. No unrelated file change or external action is made.

## Open decisions

None. The five-column header already establishes the intended layout; correcting the collapsed pseudo-element's cascade is the smallest compatible fix.
