# App-wide themed buttons and red-outlined negative actions — specification

Date: 2026-09-23
Status: Approved 2026-09-23 (D1 = sage olive, D2 = red outline for all negative actions)
Classification: Substantial (shared design-system styling across every role and many screens; frontend only, no
API or behavior change)
Related: [Sage sidebar and project cards](2026-09-23-sage-sidebar-and-project-cards-design.md),
[Login sage redesign](2026-09-23-login-screen-sage-redesign-design.md)

## Goal

1. Every button in the application uses the **same themed colors and font**, following the sage theme already
   applied to the login screen, the side navigation, and the project cards.
2. Every **negative action** is shown as **red text with a red outline**. Negative actions include Cancel, Remove,
   Delete, Discard, Reject, Revoke, Archive, Deactivate, and Withdraw.

## Current behavior and evidence

- **Shared component:** `components/ui/Button.tsx` has the variants `primary | secondary | quiet | destructive |
  destructive-outline | success`, styled in `styles/primitives.css:33–90`.
  - primary: filled `--color-brand-violet` (#5a45d6)
  - secondary: white with a navy (midnight) label
  - quiet: violet text
  - destructive: filled red (`--color-danger` #b33a4a)
  - destructive-outline: red text with a red border (already exists)
  - success: filled green
- The font is `var(--type-body)` (Poppins, 0.875rem) at weight 600.
- **Role overrides:** these override the base colors, so buttons differ by role and by screen.
  - `styles/role-themes.css:707–720`: every role shell uses `--role-cta` and `--role-cta-ink` for primary.
  - `styles/role-themes.css:1672–1680`: brown gradients in the knowledge dialog.
  - `styles/admin-home.css:~250–275`: the yellow header primary with a "+" prefix, for example the yellow
    "Initiate project".
  - `styles/designer-home.css` (7 rules), `styles/shell.css` (7), and `styles/client-responses.css` (1).
- **Legacy buttons:** about 35 elements use `className="button button--primary|secondary|success|close|preview|
  download"`, styled in `styles/index.css:252–360` with a separate palette.
- **Native `<button>` elements** with bespoke classes exist in about 70 files. Many are not action buttons: tabs,
  toggles, menu items, icon-only close buttons, and chips.
- **Negative actions today:** about 33 **Cancel** buttons (mostly `quiet` or `secondary`), plus about 25 Remove,
  Delete, Discard, Reject, Revoke, and Archive buttons. Only about 30 elements in about 20 files use
  `destructive` or `destructive-outline`. The rest look like neutral actions.
- **Dirty files:** many feature files already carry unrelated uncommitted work, for example the AI estimator
  knowledge screens, `UserDirectoryPage.tsx`, `UserInvitationsPanel.tsx`, and `access-administration.css`. Edits
  there must be minimal line-level changes that preserve the existing work.

## Proposed behavior

### A. One themed button palette (tokens)

Add button tokens in `styles/global.css` and point every variant at them. Remove the role and screen color
overrides so the tokens decide:

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| **primary** | olive `#3d4a32` | cream `#f6f4ec` | olive | `#2f3a26` |
| **secondary** | white | olive ink `#1f2a1c` | olive at 45% | 6% olive fill |
| **quiet** | transparent | olive `#3d4a32` | none | 8% olive fill |
| **success** | green, unchanged | white | — | darker green |
| **negative** (see B) | white or transparent | red `#b42318` | red `#b42318` | 6% red fill, darker red `#8f1d13` |

- The font is the same for every button: Poppins, `var(--type-body)`, weight 600, no letter-spacing tweaks. Sizes
  stay compact, default, and large, with no per-screen overrides.
- The focus ring is a visible olive ring on light surfaces. On dark olive surfaces it becomes a cream ring.
- Disabled buttons use 0.56 opacity, as today.
- Legacy `.button--primary`, `.button--secondary`, and `.button--success` resolve to the same tokens. Their layouts
  are unchanged.
- The admin header "+" prefix on the primary action is kept; only its color changes from yellow to olive.
- Contrast:
  - cream on olive: 9.9:1
  - olive ink on white: 14:1
  - red #b42318 on white: 6.5:1
  - red border: 3:1 or better

### B. Negative actions are red text with a red outline

1. The `destructive-outline` variant is the single style for negative actions: red text, red 1px border, white or
   transparent background, and a light red hover fill.
2. **Recommended (D2):** `destructive` (filled red) renders with the same red outline style, so every negative
   action looks the same, including final confirmations such as "Remove permanently". Its busy and disabled states
   are unchanged.
3. **Label audit.** Every action button whose visible label starts with one of the following uses the negative
   style:
   - **Cancel** (including "Cancel invitation" and similar)
   - Remove, Delete, Discard, Reject, Revoke, Archive, Deactivate, Withdraw
   - "Close without saving"
4. Button component usages switch to `variant="destructive-outline"`. Native `<button>` negative actions gain the
   shared negative class, `ui-button ui-button--destructive-outline`, keeping their own layout classes.
5. **Not negative** (unchanged):
   - icon-only close (×) buttons and "Close"
   - "Clear filters" and "Clear" (resetting a filter)
   - status labels such as Archived, Rejected, and Withdrawn, which are badges, not buttons
   - tabs, toggles, menus, and links styled as text
6. Behavior is unchanged: same handlers, confirmation dialogs, permissions, accessible names, and busy text. This is
   presentation only.

## Scope and non-goals

- In scope:
  - `styles/global.css` (tokens) and `styles/primitives.css` (variants)
  - `styles/index.css` (legacy `.button*` colors only)
  - button color, font, and weight overrides in `styles/role-themes.css`, `admin-home.css`, `designer-home.css`,
    `shell.css`, and `client-responses.css`
  - every `.tsx` file with a negative-action button (variant or class change only)
  - the login and signup pages, which already use the sage olive and are left as they are
- Non-goals:
  - headers, page bands, badges, links, chips, tabs, and form controls
  - navigation (already done)
  - button layout and sizes
  - icon-only buttons, except negative ones that have a visible label
  - the mobile app

## Invariants

- There is no change to what any button does. Accessible names are unchanged.
- The busy, disabled, and focus-visible states remain visible for every variant.
- Changes to dirty files are limited to the specific button line or rule, and existing uncommitted work is
  preserved.

## Risks

- The change is broad. Role screens with dark bands, such as the header bands on role dashboards, may hold buttons
  that were tuned for light-on-dark. The visual matrix must cover them, and any button sitting on a dark band keeps
  its readable, cream-on-dark treatment.
- Some tests may assert class names or variants, and will need targeted updates.
- Making Cancel red is a deliberate product choice, requested by the user. It makes dismissive and destructive
  actions look the same.

## Acceptance criteria

- AC1: In the running app, primary, secondary, and quiet buttons render with the tokens in A on these screens:
  - Super Admin: dashboard, All Projects, Users, Configuration
  - Admin: My Projects and project detail
  - Designer: workspace and design plans
  - Estimator: leads and estimate
  - Procurement
  - Finance
  - Client
  There is no yellow, violet, or brown CTA left. Checked by screenshots at 1440px and 390px.
- AC2: The font family and weight are identical across all button variants and legacy `.button` elements. This is
  checked by computed style in a rendered check.
- AC3: Every button whose label starts with Cancel, Remove, Delete, Discard, Reject, Revoke, Archive, Deactivate,
  or Withdraw has red text and a red outline. A source audit script lists zero exceptions, and a rendered spot check
  covers five or more dialogs.
- AC4: The not-negative items in B.5 are unchanged.
- AC5: Contrast meets AA for text and 3:1 for borders and focus rings. Hover, focus-visible, disabled, and busy
  states are visible.
- AC6: `cd frontend && npm run typecheck && npm test && npm run build` passes, apart from the 17 known unrelated
  failures. `git diff --check` is clean. No unrelated changes appear in dirty files.

## Open decisions

- **D1 — Theme palette.** *Recommended:* the sage olive palette in A, matching the login screen, navigation, and
  cards. The alternative is to keep the current navy and violet and only unify it.
- **D2 — Final destructive confirmations** such as "Remove permanently". *Recommended:* the red outline, same as
  every other negative action, as you asked. The alternative is to keep a filled red for the final irreversible
  confirmation inside dialogs.

## Implementation note (2026-09-23, during integration)

The approved goal and ACs are unchanged. Integration found stylesheets outside the original "In scope" list that
still override button colors and fonts:

- `styles/estimator-dashboard.css`
- `styles/designer-design-plans.css`, whose filled-red destructive rule contradicts D2
- `features/admin/dashboard/super-admin-dashboard.css`, which is dirty
- `features/admin/admin-project-grid.css`
- `features/messages/projectChat.css`, with a teal primary
- the procurement CSS, at weight 500
- `features/workflow/projectClientActions.css`, whose selector specificity blocks the red negative style
- `features/workflow/workflowStageActions.css`
- the AI-estimator-knowledge CSS files, two of which are dirty

These are brought onto the button tokens so AC1–AC3 hold, with the same color, font, and focus-only edit rules.

`--button-secondary-border` is raised from 45% to about 62% olive, so the border meets the 3:1 in AC5. The
button focus ring uses 60% olive (3.21:1) instead of 40%, which was 2.05:1.
