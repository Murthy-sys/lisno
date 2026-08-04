# Lisno UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Deliver Phase 1 of the approved application-wide redesign: a tested semantic visual system, reusable controls and asynchronous feedback, an accessible role-aware shell, and aligned authentication screens without changing domain behavior or the Lisno Quotation identity.

**Architecture:** Add semantic CSS layers alongside the legacy stylesheet, then migrate only the shell and authentication boundaries to new role-neutral primitives. Keep domain decisions in feature components, centralize common role wording, and let a single feedback provider own polite announcements and non-blocking success toasts. Preserve every existing route, permission, query, dialog, and mobile-drawer behavior while correcting nested landmarks and session-expiry feedback.

**Tech Stack:** React 19, TypeScript 5.8, React Router 7, TanStack Query 5, React Hook Form, Lucide React, CSS/Tailwind 4, Vitest, Testing Library, MSW, axe-core.

**Approved design:** `docs/superpowers/specs/2026-08-04-app-wide-ui-system-design.md`

---

## Scope and non-negotiable constraints

- This plan implements **Phase 1 only**. Targeted estimate-plan replacement is Phase 2 and must use its own reviewed plan before implementation.
- Preserve the visible words and asset identity **Lisno Quotation**. Do not replace or redraw the brand.
- Preserve the currently approved login composition and copy. Phase 1 may connect it to shared semantics, reduced motion, and stable busy accessibility, but may not visually redesign it again.
- Do not add a runtime or development dependency.
- Do not change backend contracts, permissions, KPI formulas, approval rules, extraction behavior, or feature-route workflows.
- Keep the existing `--color-lisno-*` tokens and legacy selectors working for unmigrated screens. New shared components use semantic tokens; later feature phases remove legacy styles incrementally.
- Do not append another feature-specific override block to `styles/index.css`. New foundation rules live in `tokens.css`, `base.css`, `motion.css`, `primitives.css`, or `shell.css`.
- Use Lucide for interface icons. No emoji, handcrafted SVG, or decorative CSS illustration.
- Every changed behavior follows RED → GREEN → REFACTOR. Run the named failing test before implementation and include the observed assertion in the execution notes.
- Commit only the files named in each task. The worktree may contain unrelated user changes; never stage them.
- Treat every command block as independent. Run bare frontend `npm` blocks with `frontend/` as the working directory; run root-level inspection blocks with the repository root as the working directory; blocks beginning `cd ..` intentionally start in `frontend/` before committing from the repository root.

## Phase 1 public contracts

Keep these signatures stable through later phases. A task may add a narrowly required optional property, but must not rename these states or variants.

```ts
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "destructive";
export type ButtonSize = "compact" | "default" | "large";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  busyLabel?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
}
```

`Button` keeps its accessible name and dimensions stable while `busy`; `busyLabel` is visible supplementary status, not a replacement accessible name. A busy button is disabled, has `aria-busy="true"`, and uses a progress cursor. An ordinarily disabled button keeps the default cursor.

```ts
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: React.ReactNode;
  tooltip?: string;
  variant?: ButtonVariant;
  busy?: boolean;
}

export interface TooltipProps {
  label: string;
  children: React.ReactElement;
  placement?: "top" | "right" | "bottom" | "left";
}

export interface SpinnerProps {
  size?: "small" | "medium";
  className?: string;
}
```

```ts
export interface FieldControlProps {
  id: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

export interface FieldProps {
  id: string;
  className?: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  describedBy?: string;
  required?: boolean;
  children: (controlProps: FieldControlProps) => React.ReactNode;
}
```

`Input`, `Select`, `Textarea`, `Checkbox`, and `FileInput` forward refs and native attributes so React Hook Form registrations continue to work.

```ts
export type SurfaceVariant = "default" | "subtle" | "raised" | "interactive";

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  variant?: SurfaceVariant;
  padding?: "compact" | "default" | "spacious";
}

export interface PageHeaderProps {
  id: string;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface SectionHeaderProps {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 2 | 3;
}

export type ProgressBarProps =
  | {
      value: number;
      label?: string;
      valueText?: string;
    }
  | {
      value?: undefined;
      label: string;
      valueText?: never;
    };
```

```ts
export type FeedbackTone = "info" | "success" | "warning" | "error";

export interface StateAction {
  label: string;
  onAction: () => void;
}

export interface PageStateProps {
  state: "loading" | "empty" | "error";
  message: string;
  statusLabel?: string;
  skeleton?: React.ReactNode;
  action?: StateAction;
}

export interface SectionStateProps extends PageStateProps {
  title?: string;
}
```

`PageState`, `SectionState`, and the `AsyncState` compatibility wrapper render a `section` or `div`, never `main`. The route or shell owns the one `main` landmark.

```ts
export interface SuccessFeedback {
  title: string;
  message?: string;
  durationMs?: number;
}

export interface FeedbackApi {
  announce(message: string): void;
  success(input: SuccessFeedback): string;
  dismiss(id: string): void;
}
```

The provider owns one always-mounted, `aria-atomic="true"`, polite `role="status"` region for application mutation announcements. Page/section loading components may own separately named scoped statuses; one event is sent to exactly one owner. The provider deduplicates consecutive identical announcements and accepts `announce("")` to clear without announcing. Toast cards are non-live, do not move focus, and are used only for short non-critical success confirmations.

```ts
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  label: string;
  to: string;
  end: boolean;
  icon: LucideIcon;
}

export function roleHomePath(role: Role): string;
export function navigationForRole(role: Role): readonly NavigationItem[];
```

Navigation labels and destinations are fixed:

| Role | Label | Destination |
|---|---|---|
| Designer | Workspace | `/designer` |
| Design Manager | Team | `/manager` |
| Design Head | Organization | `/head` |
| Estimator/Sales | Leads & estimates | `/estimator-sales` |
| Client | My projects | `/client` |

## Task 0: Checkpoint the approved login redesign

**Files:**

- Commit: `frontend/src/auth/LoginPage.tsx`
- Commit: `frontend/src/auth/LoginPage.test.tsx`
- Commit: `frontend/src/styles/index.css`

This is a checkpoint of already approved work, so it intentionally has no new RED step. Do not edit these files in this task.

- [ ] **Step 1: Confirm the checkpoint scope**

```bash
git status --short
git diff --stat -- frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/styles/index.css
git diff --check -- frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/styles/index.css
```

Expected: exactly those three production/test files are modified for the login redesign, and the scoped diff check exits `0`. If another file is dirty, leave it unstaged.

- [ ] **Step 2: Run the login regression gate**

```bash
cd frontend
npm test -- src/auth/LoginPage.test.tsx src/App.test.tsx src/test/accessibility.test.tsx
```

Expected: the login and application tests pass. If `accessibility.test.tsx` exposes a known unrelated fixture failure, record its exact test name and run the login accessibility case with `-t "keeps login fields"`; do not weaken an assertion.

- [ ] **Step 3: Record the pre-Phase 1 full-suite baseline**

```bash
npm test
```

Expected: PASS, or record every exact failing test name and first causal error before any foundation code exists. Preserve this output for comparison in Task 14; do not change a test merely to make the baseline green.

- [ ] **Step 4: Record the unchanged backend baseline**

```bash
cd backend
npm run typecheck
npm test
npm run build
```

Expected: PASS, or record the exact failing command/test and first causal error before Phase 1 frontend work. This establishes whether any final backend failure is genuinely pre-existing.

- [ ] **Step 5: Commit only the approved login baseline**

```bash
cd ..
git add frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/styles/index.css
git diff --cached --check
git diff --cached --stat
git commit -m "feat: refine Lisno sign-in experience"
```

Expected: the commit contains only the three named files.

## Task 1: Add semantic color, typography, spacing, elevation, focus, and motion layers

**Files:**

- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`
- Create: `frontend/src/styles/motion.css`
- Create: `frontend/src/styles/primitives.css`
- Create: `frontend/src/styles/shell.css`
- Create: `frontend/src/styles/tokens.test.ts`
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Write a failing semantic-token contract test**

Create `src/styles/tokens.test.ts`. Read the actual CSS files with `readFileSync` and assert:

```ts
const expectedColors = {
  "--color-brand-midnight": "#111a39",
  "--color-brand-midnight-raised": "#192448",
  "--color-brand-violet": "#5a45d6",
  "--color-brand-violet-bright": "#8e7cff",
  "--color-canvas": "#f4f5fa",
  "--color-surface": "#ffffff",
  "--color-surface-subtle": "#f8f8fc",
  "--color-text": "#171b2d",
  "--color-text-muted": "#626a7d",
  "--color-border": "#dde1eb",
  "--color-border-strong": "#c8cedc",
  "--color-success": "#18795c",
  "--color-warning": "#8a5b12",
  "--color-danger": "#b33a4a",
  "--color-info": "#315ab8"
} as const;
```

Also assert these named foundation groups exist:

- spacing: `--space-1` through `--space-10` for 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px;
- radius: `--radius-control: 10px`, `--radius-field: 14px`, `--radius-surface: 20px`, `--radius-pill: 999px`;
- motion: `--duration-fast: 140ms`, `--duration-settle: 220ms`, `--duration-overlay: 320ms`, and one shared easing curve;
- focus: `--focus-ring-color` and `--focus-ring`;
- elevation: three shadow tokens only—soft, raised, and overlay;
- type: interface, editorial, tabular-number, page-title, section-title, body, and metadata tokens.

Add a small hex-to-RGB luminance helper in the test and assert at least these WCAG contrast pairs:

```ts
expect(contrast("#ffffff", "#5a45d6")).toBeGreaterThanOrEqual(4.5);
expect(contrast("#ffffff", "#111a39")).toBeGreaterThanOrEqual(4.5);
expect(contrast("#171b2d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
expect(contrast("#626a7d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
expect(contrast("#ffffff", "#18795c")).toBeGreaterThanOrEqual(4.5);
expect(contrast("#ffffff", "#b33a4a")).toBeGreaterThanOrEqual(4.5);
```

Assert `motion.css` has a `prefers-reduced-motion: reduce` query that sets transition/animation duration effectively to zero and stops continuous animations.

- [ ] **Step 2: Run the token test and observe RED**

```bash
npm test -- src/styles/tokens.test.ts
```

Expected: FAIL because the CSS layer files and semantic variables do not exist.

- [ ] **Step 3: Add the five CSS layers**

Implement:

- `tokens.css`: only `:root` custom properties for approved colors, type scale, spacing, radii, shadows, z-index levels, content widths, focus, and motion;
- `base.css`: box sizing, `html/body/#root`, interface font, canvas/text colors, sensible media defaults, tabular `.ui-numeric`, `.sr-only`, selection, and the global `:focus-visible` ring;
- `motion.css`: reusable spinner/pulse/route-enter keyframes and reduced-motion overrides;
- `primitives.css`: an intentionally empty documented layer import point in this task; component tasks populate it;
- `shell.css`: an intentionally empty documented layer import point in this task; shell tasks populate it.

Use the Tailwind-compatible layer order as the first statement in `styles/index.css`, before every import:

```css
@layer theme, base, components, shell, utilities;
```

Then import Tailwind and every foundation file into an explicit layer before the existing `@theme` block:

```css
@import "tailwindcss";
@import "./tokens.css" layer(theme);
@import "./base.css" layer(base);
@import "./motion.css" layer(components);
@import "./primitives.css" layer(components);
@import "./shell.css" layer(shell);
```

Remove the existing later `@layer base { ... }` block and the duplicate unlayered `.sr-only` rule from `index.css`; transfer their still-valid reset behavior to `base.css` using semantic tokens. This is the one intentional legacy-base migration in Phase 1 and prevents later equal-specificity rules from overriding the new focus/canvas system. Do not wrap or mass-edit the thousands of unlayered feature rules: new foundation markup uses `.ui-*` selectors that do not collide, while the late approved login block continues to win where intentionally scoped.

Extend `tokens.test.ts` to assert the exact first layer declaration/import sequence, the absence of the old later base block, and semantic `:focus-visible` ownership in `base.css`.

- [ ] **Step 4: Run GREEN and static checks**

```bash
npm test -- src/styles/tokens.test.ts
npm run typecheck
```

Expected: PASS. Inspect the computed contrast values printed by a failed assertion if any pair is below `4.5`; fix the consuming foreground/background choice, not the assertion threshold.

- [ ] **Step 5: Commit the semantic foundation**

```bash
cd ..
git add frontend/src/styles/index.css frontend/src/styles/tokens.css frontend/src/styles/base.css frontend/src/styles/motion.css frontend/src/styles/primitives.css frontend/src/styles/shell.css frontend/src/styles/tokens.test.ts
git diff --cached --check
git commit -m "feat: add semantic UI foundation"
```

## Task 2: Build Button, Spinner, IconButton, and Tooltip primitives

**Files:**

- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Button.test.tsx`
- Create: `frontend/src/components/ui/Spinner.tsx`
- Create: `frontend/src/components/ui/IconButton.tsx`
- Create: `frontend/src/components/ui/IconButton.test.tsx`
- Create: `frontend/src/components/ui/Tooltip.tsx`
- Create: `frontend/src/components/ui/Tooltip.test.tsx`
- Modify: `frontend/src/styles/primitives.css`

- [ ] **Step 1: Write failing Button and Spinner tests**

Cover all public variants/sizes and these behavior contracts:

```tsx
render(<Button leadingIcon={<Plus />} trailingIcon={<ArrowRight />}>Create project</Button>);
expect(screen.getByRole("button", { name: "Create project" })).toHaveClass("ui-button--primary");

rerender(<Button busy busyLabel="Creating project">Create project</Button>);
const button = screen.getByRole("button", { name: "Create project" });
expect(button).toBeDisabled();
expect(button).toHaveAttribute("aria-busy", "true");
expect(button).toHaveTextContent("Creating project");
expect(button.querySelector("[aria-hidden='true']")).toBeInTheDocument();
```

Also assert:

- `type="button"` is the default but an explicit `type="submit"` is preserved;
- native `onClick`, `name`, `value`, `form`, `aria-*`, and the forwarded ref reach the `<button>`;
- `busy` prevents activation even if `disabled` was not provided;
- busy markup retains the original label in the accessibility tree and uses an overlaid visible status so the button width is stable;
- `Spinner` is `aria-hidden` by default and receives only size/class props, never a second live region.

Read `primitives.css` in the same suite and assert busy controls use `cursor: progress`, ordinarily disabled controls use `cursor: default`, icon controls have a `44px` minimum target, and control transitions use `--duration-fast` rather than literal durations.

- [ ] **Step 2: Write failing IconButton and Tooltip tests**

Cover:

- `IconButton` requires `label`, renders a 44px target class, and uses `aria-label={label}`;
- busy `IconButton` remains named by `label`, is disabled, and sets `aria-busy`;
- a tooltip appears on pointer hover and keyboard focus;
- it closes on pointer leave, blur, and Escape;
- Escape does not move focus or activate the child;
- `aria-describedby` is added while the tooltip exists, but the tooltip never replaces the control's accessible name;
- an existing child `onFocus`, `onBlur`, `onPointerEnter`, `onPointerLeave`, or `onKeyDown` handler still runs;
- tooltip IDs are unique when two controls have the same label.

- [ ] **Step 3: Run the primitive tests and observe RED**

```bash
npm test -- src/components/ui/Button.test.tsx src/components/ui/IconButton.test.tsx src/components/ui/Tooltip.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the control primitives**

Use `forwardRef`. Build class names locally without adding a class-name package. Render both layers in the same CSS grid cell at all times so the intrinsic width is the larger of the settled and busy labels before a request begins:

```tsx
<button
  ref={ref}
  type={type ?? "button"}
  className={classes}
  {...rest}
  disabled={disabled || busy}
  aria-busy={busy || undefined}
  data-busy={busy || undefined}
>
  <span className="ui-button__stack">
    <span className="ui-button__content">{leadingIcon}{children}{trailingIcon}</span>
    <span className="ui-button__busy" aria-hidden="true">
      <Spinner />
      {busyLabel ?? "Working…"}
    </span>
  </span>
</button>
```

The original content becomes visually hidden with opacity while busy, not `display:none` or `aria-hidden`, so its accessible name remains stable. The busy layer uses `visibility`/opacity to remain in intrinsic sizing without becoming visible when settled. It is always `aria-hidden`; asynchronous status is announced by the owning form/section or `FeedbackProvider`.

Implement tooltip state without a portal or focus trap. Merge event handlers and `aria-describedby` rather than overwriting child props. Use `role="tooltip"`, an ID from `useId`, and no interactive content inside the tooltip.

Add semantic CSS for:

- primary, secondary, quiet, destructive;
- compact/default/large and full-width;
- 140ms hover/focus/press transitions and maximum 1px press movement;
- stable busy overlay and progress cursor;
- disabled default cursor;
- 44px icon control;
- visible focus ring;
- tooltip placement, 220ms settle, and reduced-motion behavior.

- [ ] **Step 5: Run GREEN, accessibility, and type checks**

```bash
npm test -- src/components/ui/Button.test.tsx src/components/ui/IconButton.test.tsx src/components/ui/Tooltip.test.tsx
npm run typecheck
```

Expected: PASS with no act warnings.

- [ ] **Step 6: Commit the control primitives**

```bash
cd ..
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/Button.test.tsx frontend/src/components/ui/Spinner.tsx frontend/src/components/ui/IconButton.tsx frontend/src/components/ui/IconButton.test.tsx frontend/src/components/ui/Tooltip.tsx frontend/src/components/ui/Tooltip.test.tsx frontend/src/styles/primitives.css
git diff --cached --check
git commit -m "feat: add shared action controls"
```

## Task 3: Build accessible form primitives with React Hook Form compatibility

**Files:**

- Create: `frontend/src/components/ui/Field.tsx`
- Create: `frontend/src/components/ui/Field.test.tsx`
- Modify: `frontend/src/styles/primitives.css`

- [ ] **Step 1: Write failing label, hint, and error-association tests**

Render fields through the `children(controlProps)` contract and assert:

```tsx
render(
  <Field
    id="project-name"
    label="Project name"
    hint="Use the client-facing name."
    error="Project name is required."
    required
  >
    {(controlProps) => <Input {...controlProps} />}
  </Field>
);

const input = screen.getByRole("textbox", { name: /Project name/i });
expect(input).toBeRequired();
expect(input).toHaveAttribute("aria-invalid", "true");
expect(input).toHaveAccessibleDescription(
  "Use the client-facing name. Project name is required."
);
```

Also cover:

- no `aria-invalid` when `error` is absent;
- only the hint ID when there is a hint but no error;
- only the error ID when there is an error but no hint;
- the visual required marker is `aria-hidden` while the label still exposes required semantics through the control;
- an error includes text plus a Lucide icon so color is not the only signal;
- consumer-provided `aria-describedby` is merged after field hint/error IDs rather than discarded.

- [ ] **Step 2: Write failing native-control and ref tests**

Add a React Hook Form harness that registers `Input`, `Select`, `Textarea`, `Checkbox`, and `FileInput`, submits values, and focuses an invalid input through its forwarded ref. Assert native attributes (`autoComplete`, `inputMode`, `accept`, `multiple`, `rows`, `value`) reach the underlying element.

Use role-appropriate assertions:

```tsx
expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
  "autocomplete",
  "email"
);
expect(screen.getByRole("checkbox", { name: "Client approved" })).toBeChecked();
expect(screen.getByLabelText("Upload plan")).toHaveAttribute("accept", ".pdf,image/*");
```

- [ ] **Step 3: Run the form tests and observe RED**

```bash
npm test -- src/components/ui/Field.test.tsx
```

Expected: FAIL because `Field` and the forwarded native controls do not exist.

- [ ] **Step 4: Implement Field and native controls**

In `Field.tsx`:

- create deterministic `${id}-hint` and `${id}-error` IDs;
- join hint, error, and the `describedBy` prop with a small `joinIds` helper;
- render a semantic label and supporting/error paragraphs;
- merge `className` with the stable `ui-field` hook so scoped authentication/feature layouts can migrate without wrapper duplication;
- pass only control-owned accessibility props to the render function;
- export `Input`, `Select`, `Textarea`, `Checkbox`, and `FileInput` with `forwardRef`;
- use a dedicated checkbox layout class while keeping a native checkbox;
- keep file input native and visible; do not build a fake file picker in the foundation.

Add semantic field CSS with a 44px minimum control height, 14px radius, visible hover/focus/invalid states, readable disabled state, and error icon/text. Use `--color-*`, spacing, radius, focus, and duration tokens only.

- [ ] **Step 5: Run GREEN and type checks**

```bash
npm test -- src/components/ui/Field.test.tsx
npm run typecheck
```

Expected: PASS. React Hook Form must not log ref warnings.

- [ ] **Step 6: Commit the form primitives**

```bash
cd ..
git add frontend/src/components/ui/Field.tsx frontend/src/components/ui/Field.test.tsx frontend/src/styles/primitives.css
git diff --cached --check
git commit -m "feat: add accessible form primitives"
```

## Task 4: Build surfaces, headers, status, and progress primitives

**Files:**

- Create: `frontend/src/components/ui/Surface.tsx`
- Create: `frontend/src/components/ui/Surface.test.tsx`
- Create: `frontend/src/components/ui/PageHeader.tsx`
- Create: `frontend/src/components/ui/PageHeader.test.tsx`
- Create: `frontend/src/components/ui/SectionHeader.tsx`
- Create: `frontend/src/components/ui/SectionHeader.test.tsx`
- Create: `frontend/src/components/ui/StatusBadge.test.tsx`
- Create: `frontend/src/components/ui/ProgressBar.test.tsx`
- Modify: `frontend/src/components/ui/StatusBadge.tsx`
- Modify: `frontend/src/components/ui/ProgressBar.tsx`
- Modify: `frontend/src/styles/primitives.css`

- [ ] **Step 1: Write failing structure tests**

Assert `Surface`:

- defaults to a `div`, `default` variant, and default padding;
- supports only `div`, `section`, or `article` through `as`;
- forwards HTML attributes/ref to the chosen element;
- does not add hover/lift behavior to non-interactive variants;
- adds an explicit interactive class only for `variant="interactive"`.

Assert `PageHeader` renders exactly one `h1` with the provided `id`, keeps breadcrumb before title, metadata after description, and actions in a labelled action group. Assert `SectionHeader` defaults to `h2`, can render `h3`, and associates its surrounding header with the supplied ID.

Representative assertion:

```tsx
render(
  <PageHeader
    id="team-title"
    eyebrow="Design manager"
    title="Team delivery pulse"
    description="Priorities across your direct reports."
    metadata={<StatusBadge tone="success" label="On track" />}
    actions={<Button>Assign estimate</Button>}
  />
);
expect(screen.getByRole("heading", { level: 1, name: "Team delivery pulse" }))
  .toHaveAttribute("id", "team-title");
expect(screen.getByRole("group", { name: "Page actions" })).toBeVisible();
```

- [ ] **Step 2: Write failing status and progress tests**

For `StatusBadge`, cover all tones and require:

- visible humanized label;
- a tone-specific Lucide icon with `aria-hidden="true"`;
- optional reason available to assistive technology;
- no raw backend underscore value transformation inside the primitive—the caller supplies final copy.

For `ProgressBar`, cover `0`, `42`, `100`, values below/above range, optional determinate `valueText`, and indeterminate mode. Assert a determinate bar has `aria-valuemin`, `aria-valuemax`, bounded `aria-valuenow`, and defaults its label to the bounded percentage when no label is supplied. An indeterminate bar omits `aria-valuenow` and requires a caller-supplied stage through `label`; add an `@ts-expect-error` type contract showing `<ProgressBar />` without `value` or `label` is rejected.

- [ ] **Step 3: Run the structure tests and observe RED**

```bash
npm test -- src/components/ui/Surface.test.tsx src/components/ui/PageHeader.test.tsx src/components/ui/SectionHeader.test.tsx src/components/ui/StatusBadge.test.tsx src/components/ui/ProgressBar.test.tsx
```

Expected: FAIL because the new primitives and the strengthened status/progress semantics are absent.

- [ ] **Step 4: Implement the structural primitives**

Use semantic class prefixes (`ui-surface`, `ui-page-header`, `ui-section-header`, `ui-status`, `ui-progress`) and approved tokens. Apply:

- 16–20px compact/default staff padding and 24–32px spacious/client padding through the three `Surface` padding variants;
- soft edge/shadow for raised surfaces;
- at most 2px transform only for interactive surfaces;
- responsive header action wrapping without changing source order;
- tabular numerals for progress;
- low-chroma status backgrounds, readable foregrounds, icon plus text;
- no `role="status"` on a static badge.

Implement the `ProgressBarProps` discriminated union from the public-contract section. Existing indeterminate caller `DesignUploadDialog` already supplies “Upload in progress,” while determinate callsites remain source-compatible. Keep `ProgressBar` as the exported compatibility name; later feature phases may alias it as `Progress` without breaking current imports.

- [ ] **Step 5: Run GREEN and type checks**

```bash
npm test -- src/components/ui/Surface.test.tsx src/components/ui/PageHeader.test.tsx src/components/ui/SectionHeader.test.tsx src/components/ui/StatusBadge.test.tsx src/components/ui/ProgressBar.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit structure and status primitives**

```bash
cd ..
git add frontend/src/components/ui/Surface.tsx frontend/src/components/ui/Surface.test.tsx frontend/src/components/ui/PageHeader.tsx frontend/src/components/ui/PageHeader.test.tsx frontend/src/components/ui/SectionHeader.tsx frontend/src/components/ui/SectionHeader.test.tsx frontend/src/components/ui/StatusBadge.tsx frontend/src/components/ui/StatusBadge.test.tsx frontend/src/components/ui/ProgressBar.tsx frontend/src/components/ui/ProgressBar.test.tsx frontend/src/styles/primitives.css
git diff --cached --check
git commit -m "feat: add shared content structure"
```

## Task 5: Build asynchronous, empty, and persistent message states

**Files:**

- Create: `frontend/src/components/ui/InlineMessage.tsx`
- Create: `frontend/src/components/ui/InlineMessage.test.tsx`
- Create: `frontend/src/components/ui/NoticeBanner.tsx`
- Create: `frontend/src/components/ui/Skeleton.tsx`
- Create: `frontend/src/components/ui/Skeleton.test.tsx`
- Create: `frontend/src/components/ui/EmptyState.tsx`
- Create: `frontend/src/components/ui/PageState.tsx`
- Create: `frontend/src/components/ui/SectionState.tsx`
- Create: `frontend/src/components/ui/AsyncState.test.tsx`
- Create: `frontend/src/auth/AuthRouteState.tsx`
- Create: `frontend/src/auth/AuthRouteState.test.tsx`
- Modify: `frontend/src/components/ui/AsyncState.tsx`
- Modify: `frontend/src/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/styles/primitives.css`

Use these additional concrete contracts:

```ts
export interface InlineMessageProps {
  tone: FeedbackTone;
  label?: string;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  role?: "status" | "alert";
}

export type NoticeBannerProps = InlineMessageProps;

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  shape?: "text" | "circle" | "block";
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export interface AuthRouteStateProps extends PageStateProps {
  title: string;
}
```

- [ ] **Step 1: Write failing feedback-state tests**

Cover:

- `InlineMessage` uses icon plus text for every tone;
- error defaults to `role="alert"`, while other tones are static unless the caller explicitly supplies `role="status"`;
- `NoticeBanner` is a labelled region when `label` is supplied and keeps its action after the copy in DOM order;
- `EmptyState` has one heading, explanatory description, optional valid action, and no live role;
- `Skeleton` is always `aria-hidden="true"`, cannot receive an accessible label, and renders all three shape classes.

- [ ] **Step 2: Write failing page/section/compatibility tests**

Cover loading, empty, error, and retry for `PageState` and `SectionState`:

- neither renders a `main`;
- loading owns `aria-busy="true"`, contains aria-hidden skeletons, and exposes one stable polite message;
- loading's live node has the supplied `statusLabel` (default “Content status”) so it remains distinguishable from global application announcements;
- a caller-supplied `skeleton` replaces the default visual inside an `aria-hidden="true"` wrapper so later route migrations can match the incoming layout;
- error exposes one alert and a shared `Button` retry action;
- empty uses the same quiet, non-live presentation language as `EmptyState`; richer callers use `EmptyState` directly when they have both a title and description;
- `AsyncState` preserves its current prop union and visible copy while delegating to `SectionState`;
- `AuthRouteState` renders exactly one `main`, one stable `PageHeader`/`h1`, and one local state region;
- `/login` restoration retains “Welcome back,” `/signup` restoration retains “Create your client account,” and a protected/root restoration uses “Opening your workspace”;
- a protected route restoration failure retains “Opening your workspace,” exposes retry, and does not clear the still-valid token;
- `/login`, `/signup`, `/`, wildcard, and authenticated shell states never create zero or two `main` landmarks or headings after settling.
- every state root exposes `data-page-state` or `data-section-state` so route focus can stop waiting when a legacy route reaches a terminal state before its Phase 3–5 header migration.

Add or update a router assertion:

```tsx
expect(screen.getAllByRole("main")).toHaveLength(1);
expect(screen.getByRole("status")).toHaveTextContent("Restoring your session");
```

- [ ] **Step 3: Run the state tests and observe RED**

```bash
npm test -- src/components/ui/InlineMessage.test.tsx src/components/ui/Skeleton.test.tsx src/components/ui/AsyncState.test.tsx src/auth/AuthRouteState.test.tsx src/app/router.test.tsx
```

Expected: FAIL because the state primitives are missing and `AsyncState` currently renders `main` directly.

- [ ] **Step 4: Implement the feedback and state primitives**

Implement small role-neutral components; do not embed role copy in them. Use Lucide `Info`, `CircleCheck`, `TriangleAlert`, `CircleAlert`, and `Inbox` as appropriate.

For loading states:

- render the skeleton visual separately with `aria-hidden="true"`;
- keep one `.sr-only` or visibly subtle status message in the owning busy region;
- do not use both `aria-live` and a duplicate nested status for the same text;
- stop skeleton/spinner animation in reduced motion.

Refactor `AsyncState` to return `SectionState`, use the internal status label “Content status,” and map its legacy `actionLabel`/`onAction` pair to `action`.

Build `AuthRouteState` from `PageHeader` plus `PageState`:

```tsx
<main className="auth-route-state" id="main-content">
  <PageHeader id="auth-route-title" title={title} />
  <PageState ... />
</main>
```

Use it in `ProtectedRoute` and the three pre-auth route gates in `router.tsx` with the exact stable headings asserted above. Do not wrap state rendered inside `AppShell`; the shell already owns `main#main-content`.

- [ ] **Step 5: Run GREEN and the routing regression**

```bash
npm test -- src/components/ui/InlineMessage.test.tsx src/components/ui/Skeleton.test.tsx src/components/ui/AsyncState.test.tsx src/auth/AuthRouteState.test.tsx src/app/router.test.tsx src/App.test.tsx
npm run typecheck
```

Expected: PASS with exactly one main landmark in every tested state.

- [ ] **Step 6: Commit asynchronous and message states**

```bash
cd ..
git add frontend/src/components/ui/InlineMessage.tsx frontend/src/components/ui/InlineMessage.test.tsx frontend/src/components/ui/NoticeBanner.tsx frontend/src/components/ui/Skeleton.tsx frontend/src/components/ui/Skeleton.test.tsx frontend/src/components/ui/EmptyState.tsx frontend/src/components/ui/PageState.tsx frontend/src/components/ui/SectionState.tsx frontend/src/components/ui/AsyncState.tsx frontend/src/components/ui/AsyncState.test.tsx frontend/src/auth/AuthRouteState.tsx frontend/src/auth/AuthRouteState.test.tsx frontend/src/auth/ProtectedRoute.tsx frontend/src/app/router.tsx frontend/src/app/router.test.tsx frontend/src/styles/primitives.css
git diff --cached --check
git commit -m "feat: add shared asynchronous states"
```

## Task 6: Add one feedback provider, polite live region, and success toast viewport

**Files:**

- Create: `frontend/src/components/feedback/FeedbackProvider.tsx`
- Create: `frontend/src/components/feedback/FeedbackProvider.test.tsx`
- Create: `frontend/src/components/feedback/ToastViewport.tsx`
- Modify: `frontend/src/app/providers.tsx`
- Modify: `frontend/src/test/render.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.test.tsx`
- Modify: `frontend/src/styles/primitives.css`

- [ ] **Step 0: Create the feedback component directory**

```bash
mkdir -p src/components/feedback
```

Run from `frontend/`. This creates only the missing directory; add every file in the task with `apply_patch`.

- [ ] **Step 1: Write failing provider tests**

Use a small consumer harness and fake timers. Assert:

- the provider always renders exactly one empty polite `role="status"` with `aria-atomic="true"` before any feedback;
- that live region has the stable accessible name “Application announcements”;
- `announce("Project saved.")` updates that same node rather than mounting another live region;
- two consecutive identical announcements produce one mutation/announcement;
- a different message is announced normally;
- `announce("")` clears the same node without creating an announcement and resets deduplication for a future event;
- `success({ title, message })` returns a unique ID, adds one visible toast, and announces the success once;
- the toast itself has no `role="status"`, `role="alert"`, or `aria-live`;
- the default success toast leaves after 5 seconds, a custom `durationMs` is respected, and `dismiss(id)` removes only the named toast;
- showing or dismissing feedback never moves focus;
- `useFeedback()` outside the provider throws a clear developer error.

Do not expose `error()` or `warning()` toast methods. Those states stay persistent through `InlineMessage` or `NoticeBanner`.

- [ ] **Step 2: Run the provider test and observe RED**

```bash
npm test -- src/components/feedback/FeedbackProvider.test.tsx
```

Expected: FAIL because the provider and viewport do not exist.

- [ ] **Step 3: Implement the feedback boundary**

In `FeedbackProvider.tsx`:

- keep announcement state separate from toast state;
- use a monotonic ref counter for IDs (for example `feedback-1`), not random values;
- retain the most recently announced non-empty text in a ref, ignore an identical consecutive call, and clear both the node and dedup ref when passed an empty string;
- have `success()` announce `title` followed by `message` with one separating space when a message exists;
- render one `.sr-only` live region for the application lifetime;
- clear toast timers on explicit dismiss and provider unmount;
- memoize the API value.

In `ToastViewport.tsx`:

- render a fixed, non-layout-shifting region labelled "Notifications";
- render title, optional message, and a labelled dismiss `IconButton`;
- do not add a live role to the viewport or cards;
- cap visible cards at three; dismiss the oldest visual card if a fourth success arrives, while preserving the announcement that already occurred.

Wrap providers in this order in production `AppProviders` and the `renderApp` test path:

```tsx
<QueryClientProvider client={queryClient}>
  <FeedbackProvider>
    <AuthProvider>{children}</AuthProvider>
  </FeedbackProvider>
</QueryClientProvider>
```

Update both helpers in `test/render.tsx`: `renderApp` keeps its existing MemoryRouter placement and adds `FeedbackProvider` outside `AuthProvider`; `renderWithQuery` adds `FeedbackProvider` inside `QueryClientProvider` but intentionally remains auth-free because it is the low-level query-component helper. Both paths must expose the same feedback semantics as production without introducing new authentication side effects.

Because the always-mounted application status now coexists with local feature statuses, make existing status queries deterministic in the same commit:

- give the design review announcement `aria-label="Design review updates"` and query that name in `DesignSectionReview.test.tsx`;
- give the project upload confirmation `aria-label="Project updates"` and query that name in `ProjectWorkspace.test.tsx`;
- query “Content status” within `main#main-content` in `router.test.tsx`;
- run `rg 'get(By|findBy)Role\\("status"' frontend/src --glob '*test.ts*'` and update only tests rendered through `renderApp` or `renderWithQuery` that would now be ambiguous.

This is an accessibility naming adjustment, not a domain-message or workflow change.

- [ ] **Step 4: Run GREEN and provider-consumer regressions**

```bash
npm test -- src/components/feedback/FeedbackProvider.test.tsx src/App.test.tsx src/auth/LoginPage.test.tsx src/app/router.test.tsx src/features/client/DesignSectionReview.test.tsx src/features/designer/ProjectWorkspace.test.tsx
npm run typecheck
```

Expected: PASS. Existing queries and authentication render under the new provider without duplicate status text.

- [ ] **Step 5: Commit feedback infrastructure**

```bash
cd ..
git add frontend/src/components/feedback/FeedbackProvider.tsx frontend/src/components/feedback/FeedbackProvider.test.tsx frontend/src/components/feedback/ToastViewport.tsx frontend/src/app/providers.tsx frontend/src/test/render.tsx frontend/src/app/router.test.tsx frontend/src/features/client/DesignSectionReview.tsx frontend/src/features/client/DesignSectionReview.test.tsx frontend/src/features/designer/ProjectWorkspace.tsx frontend/src/features/designer/ProjectWorkspace.test.tsx frontend/src/styles/primitives.css
git diff --cached --check
git commit -m "feat: add application feedback provider"
```

## Task 7: Centralize role-specific common-state wording and count grammar

**Files:**

- Create: `frontend/src/content/roleFeedback.ts`
- Create: `frontend/src/content/roleFeedback.test.ts`

This task establishes the typed source of truth. Phase 1 does not rewrite feature dashboards solely to consume it; the route migrations in Phases 3–5 import these messages when they replace each route's loading, empty, conflict, and replacement states.

Use this contract:

```ts
export type RoleFeedbackRequest =
  | { situation: "workspaceLoading" | "clearState" | "conflict" }
  | { situation: "requestedChanges" | "replacementReady"; count: number };

export function getRoleFeedback(
  role: Role,
  request: RoleFeedbackRequest
): string;
```

- [ ] **Step 0: Create the shared content directory**

```bash
mkdir -p src/content
```

Run from `frontend/`. Add the TypeScript files with `apply_patch`, not shell redirection.

- [ ] **Step 1: Write the failing fixed-copy matrix tests**

Assert the approved messages for `workspaceLoading`, `clearState`, and `conflict` for all five roles. These strings are the source of truth:

| Role | Workspace loading | Clear state | Conflict |
|---|---|---|---|
| Designer | Loading your projects, priorities, and client feedback… | You’re clear—no urgent tasks need attention. | A newer version is available. Review the refreshed values before saving again. |
| Design Manager | Loading your team, workload, and approval queue… | No team actions need attention right now. | The record changed. Review the latest details before trying again. |
| Design Head | Loading managers, team health, and evaluation coverage… | All teams are currently within delivery thresholds. | This inspection changed while it was open. Refresh to continue. |
| Estimator/Sales | Loading leads, estimates, and client feedback… | No client feedback needs action. | The request changed. Review the latest targets before resubmitting. |
| Client | Loading your projects and items for review… | Nothing needs your review right now. | This item was updated. We’ve refreshed the latest version for you. |

- [ ] **Step 2: Write failing zero/singular/plural tests**

Use `it.each` for counts `0`, `1`, and `2` for every role and both count situations. Required client replacement forms are:

```ts
getRoleFeedback("client", { situation: "replacementReady", count: 0 });
// "No updated images are waiting for review."
getRoleFeedback("client", { situation: "replacementReady", count: 1 });
// "Image updated — please review and approve."
getRoleFeedback("client", { situation: "replacementReady", count: 2 });
// "2 images updated — please review and approve."
```

Required Estimator/Sales forms are:

```text
No client feedback needs section updates.
Client feedback to resolve in 1 section.
Client feedback to resolve in 2 sections.
No replacements are ready to send.
1 replacement is ready to send.
2 replacements are ready to send.
```

Use these exact remaining forms for counts `0`, `1`, and `2`:

| Role/situation | 0 | 1 | 2 |
|---|---|---|---|
| Designer requested changes | No client-requested section updates are open. Approved sections remain locked. | Client requested an update to 1 section. Approved sections remain locked. | Client requested updates to 2 sections. Approved sections remain locked. |
| Designer replacement ready | No updated sections are ready to submit. | 1 updated section is ready to submit. | 2 updated sections are ready to submit. |
| Design Manager requested changes | No revised sections are waiting for review. | Review is waiting for 1 revised section. | Review is waiting for 2 revised sections. |
| Design Manager replacement ready | No revised sections are ready for delivery review. | 1 revised section is ready for delivery review. | 2 revised sections are ready for delivery review. |
| Design Head requested changes | No requested revisions are affecting delivery health. | 1 requested revision is affecting delivery health. | 2 requested revisions are affecting delivery health. |
| Design Head replacement ready | No updated sections are moving through approval. | 1 updated section is moving back through approval. | 2 updated sections are moving back through approval. |
| Client requested changes | No image changes are awaiting an update. | Changes sent for 1 section. We’ll notify you when the updated image is ready. | Changes sent for 2 sections. We’ll notify you when the updated images are ready. |

Client forms must never introduce “queue,” “extracted drawing,” “immutable revision,” or a raw backend status.

Also assert negative and non-integer counts throw a developer-facing `RangeError`; silently pluralizing invalid counts would hide caller bugs.

- [ ] **Step 3: Run the content tests and observe RED**

```bash
npm test -- src/content/roleFeedback.test.ts
```

Expected: FAIL because the content map does not exist.

- [ ] **Step 4: Implement the typed content map**

Use a complete `Record<Role, ...>` so TypeScript fails if a role is omitted. Keep count interpolation in one helper that handles exactly zero, singular, and plural. Do not import React or UI components into this module.

- [ ] **Step 5: Run GREEN and type checks**

```bash
npm test -- src/content/roleFeedback.test.ts
npm run typecheck
```

Expected: PASS for all five roles and all count forms.

- [ ] **Step 6: Commit role feedback content**

```bash
cd ..
git add frontend/src/content/roleFeedback.ts frontend/src/content/roleFeedback.test.ts
git diff --cached --check
git commit -m "feat: centralize role feedback language"
```

## Task 8: Introduce typed role navigation, the polished shared shell, and skip link

**Files:**

- Create: `frontend/src/app/routePaths.ts`
- Create: `frontend/src/components/layout/navigation.ts`
- Create: `frontend/src/components/layout/navigation.test.tsx`
- Create: `frontend/src/components/layout/SkipLink.tsx`
- Create: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/MobileHeader.tsx`
- Modify: `frontend/src/styles/shell.css`

- [ ] **Step 1: Write failing route-path and navigation matrix tests**

In `navigation.test.tsx`, assert `roleHomePath` and `navigationForRole` cover every `Role` and return exactly one real destination per role using the approved table. Assert:

- labels are role-specific, not the generic “Workspace” for every role;
- `end` is `true` on every stable home;
- each icon is a Lucide component and is rendered with `aria-hidden="true"` by `Sidebar`;
- returned arrays are readonly/frozen in development so callers cannot mutate global navigation state;
- no parameterized route or invented destination appears in permanent navigation.

- [ ] **Step 2: Write failing shell and skip-link tests**

Render `AppShell` through `renderApp` for at least Designer, Estimator/Sales, and Client fixtures. Assert:

```tsx
expect(screen.getByRole("link", { name: "Skip to main content" }))
  .toHaveAttribute("href", "#main-content");
expect(screen.getAllByRole("main")).toHaveLength(1);
expect(screen.getByRole("main")).toHaveAttribute("data-role", role);
expect(screen.getByRole("navigation", { name: "Primary navigation" }))
  .toBeVisible();
```

For each role, assert the correct link label and active state (`aria-current="page"`). Assert the existing brand asset is unchanged and remains exposed by `BrandLogo` with its current accessible image name “Lisno”; visually it continues to present the Lisno Quotation identity. Identity/email remain visible, and the sign-out control retains the accessible name “Sign out.” `BrandLogo.tsx` is intentionally not modified.

Add a `SkipLink` unit assertion that custom `targetId` and children work while defaults are `main-content` and “Skip to main content.” Focus the link, press Enter, and assert the target receives focus while the anchor retains its real fragment `href`.

- [ ] **Step 3: Run the navigation/shell tests and observe RED**

```bash
npm test -- src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx
```

Expected: FAIL because role navigation and the authenticated skip link do not exist.

- [ ] **Step 4: Move route ownership and implement typed navigation**

Move `roleHomePath` from `auth/ProtectedRoute.tsx` to `app/routePaths.ts`. Update imports in `ProtectedRoute.tsx`, `LoginPage.tsx`, `router.tsx`, and `Sidebar.tsx` atomically; do not leave a compatibility re-export in auth.

Import `LucideIcon` as a type from `lucide-react`, then build `navigationForRole` from a complete `Record<Role, readonly NavigationItem[]>` using Lucide icons:

- Designer: `LayoutDashboard`;
- Design Manager: `UsersRound`;
- Design Head: `Building2`;
- Estimator/Sales: `BriefcaseBusiness`;
- Client: `FolderKanban`.

`Sidebar` maps this array to `NavLink`s. Preserve `onNavigate` so a mobile selection closes the drawer. Add `aria-current` through `NavLink`, retain the restrained arrow as decorative, and use the shared `IconButton` for sign out.

- [ ] **Step 5: Implement the new shell composition**

Update `AppShell` to render in this order:

```tsx
<div className="ui-app-shell" data-role={auth.user.role}>
  <SkipLink />
  <aside className="ui-sidebar-rail" aria-label="Application sidebar">...</aside>
  <MobileHeader ... />
  <main id="main-content" className="ui-workspace" data-role={auth.user.role}>
    <Outlet />
  </main>
</div>
```

Give `main#main-content` `tabIndex={-1}`. `SkipLink` keeps a real `href="#main-content"` and handles activation by focusing the resolved target; it does not create or focus an extra wrapper. This makes the keyboard contract deterministic in browsers and JSDOM.

Use `shell.css` for the new prefixed shell classes:

- midnight sidebar and midnight-raised hover surfaces;
- violet active rail, icon, and focus treatment;
- calm porcelain/canvas workspace;
- staff content measure up to roughly 1440px and client content measure up to roughly 1120px via `data-role`;
- desktop sidebar with a scroll-safe account footer;
- mobile header/drawer trigger below the existing responsive breakpoint;
- focus-visible skip link above every overlay except modal/drawer layers;
- safe-area padding and no horizontal page scroll at 320px;
- semantic tokens only—no new literal feature colors, radii, or shadows.

Keep legacy shell selectors in `index.css` temporarily because unmigrated markup may still rely on them; the JSX touched in this task uses the new prefixed classes.

- [ ] **Step 6: Run GREEN, routing, and type checks**

```bash
npm test -- src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/app/router.test.tsx src/auth/LoginPage.test.tsx
npm run typecheck
```

Expected: PASS. Role redirects still use the same destinations after the import move.

- [ ] **Step 7: Commit navigation and shell**

```bash
cd ..
git add frontend/src/app/routePaths.ts frontend/src/components/layout/navigation.ts frontend/src/components/layout/navigation.test.tsx frontend/src/components/layout/SkipLink.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/auth/ProtectedRoute.tsx frontend/src/auth/LoginPage.tsx frontend/src/app/router.tsx frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/MobileHeader.tsx frontend/src/styles/shell.css
git diff --cached --check
git commit -m "feat: redesign the role-aware application shell"
```

## Task 9: Share overlay mechanics between Dialog and the mobile Drawer

**Files:**

- Create: `frontend/src/components/ui/overlay.ts`
- Create: `frontend/src/components/ui/Drawer.tsx`
- Create: `frontend/src/components/ui/Drawer.test.tsx`
- Modify: `frontend/src/components/ui/Dialog.tsx`
- Modify: `frontend/src/components/ui/Dialog.test.tsx`
- Modify: `frontend/src/components/layout/MobileHeader.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/styles/primitives.css`
- Modify: `frontend/src/styles/shell.css`

Use this Drawer contract:

```ts
export interface DrawerProps {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
  side?: "left" | "right";
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}
```

- [ ] **Step 1: Strengthen failing overlay-mechanics tests**

Before refactoring, extend `Dialog.test.tsx` and add `Drawer.test.tsx` to require:

- initial focus goes to `[data-dialog-initial-focus]`, otherwise the first focusable child, otherwise the overlay container;
- Tab and Shift+Tab wrap inside only the topmost overlay;
- Escape closes only the topmost dismissible overlay;
- Escape and backdrop/close controls do nothing while `busy`;
- the trigger regains focus after close when it still exists;
- body scroll locks on first overlay, stays locked when nested overlays close out of order, and restores the exact previous inline `overflow` value after the last closes;
- React Strict Mode mount/unmount does not underflow the lock count or leave a listener behind;
- opening a Drawer does not hide its accessible title or create a second `main`;
- reduced-motion CSS removes Drawer/Dialog movement without removing content.

Keep every current Dialog assertion passing, including `alertdialog`, `contentInert`, description, optional close button, and busy-close behavior.

- [ ] **Step 2: Run overlay tests and observe RED**

```bash
npm test -- src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx src/components/layout/AppShell.test.tsx
```

Expected: existing simple Dialog behavior may pass, but shared/nested/topmost Drawer contracts fail.

- [ ] **Step 3: Implement `overlay.ts` as the single behavior owner**

Export the shared focusable selector and a `useOverlay` hook. The module owns:

- a module-level overlay stack with stable instance IDs;
- one document keydown listener while the stack is non-empty;
- topmost-only Escape and Tab handling;
- reference-counted body scroll locking with idempotent release;
- initial focus after mount;
- restoration to explicit `returnFocusRef`, otherwise the element focused before open, only when still connected;
- stable refs for `onClose` and `busy` so the listener does not churn.

Do not make background content globally `aria-hidden` in this task; the existing modal contract uses `aria-modal`, and hiding the React root would also hide a portal-free overlay. Preserve `contentInert` exactly where Dialog callers explicitly request it.

- [ ] **Step 4: Build Drawer and refactor Dialog**

`Drawer` returns `null` when closed and renders its required `id` on a labelled `role="dialog"`, with `aria-modal="true"`, backdrop, shared `IconButton`, and content when open. Apply `data-overlay-root` for stack debugging/tests. `MobileHeader` passes `id="mobile-navigation"`, and its trigger's `aria-controls` uses the same value.

Refactor `Dialog` to call `useOverlay` and use shared `IconButton`/`Button` semantics while preserving its public props and existing class names as compatibility aliases. Remove its private scroll-lock counter and document listener.

Replace `MobileHeader`'s local focus trap, Escape listener, and scroll-lock effect with `Drawer`. The navigation link and logout callbacks close the Drawer. Preserve `aria-expanded`, `aria-controls`, title “Navigation,” and trigger focus restoration.

- [ ] **Step 5: Run GREEN and shell regression**

```bash
npm test -- src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx src/components/layout/AppShell.test.tsx src/app/router.test.tsx
npm run typecheck
```

Expected: PASS, with the existing mobile-navigation test still wrapping focus and closing on Escape.

- [ ] **Step 6: Commit overlay foundation**

```bash
cd ..
git add frontend/src/components/ui/overlay.ts frontend/src/components/ui/Drawer.tsx frontend/src/components/ui/Drawer.test.tsx frontend/src/components/ui/Dialog.tsx frontend/src/components/ui/Dialog.test.tsx frontend/src/components/layout/MobileHeader.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/styles/primitives.css frontend/src/styles/shell.css
git diff --cached --check
git commit -m "refactor: share accessible overlay behavior"
```

## Task 10: Add deterministic route focus and list-removal focus helpers

**Files:**

- Create: `frontend/src/components/layout/RouteFocusManager.tsx`
- Create: `frontend/src/components/layout/RouteFocusManager.test.tsx`
- Create: `frontend/src/components/ui/focus.ts`
- Create: `frontend/src/components/ui/focus.test.ts`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`

Use these contracts:

```ts
export interface RouteFocusManagerProps {
  mainId?: string;
  headingSelector?: string;
}

export function focusAfterRemoval(
  remaining: readonly HTMLElement[],
  removedIndex: number,
  fallbackHeading?: HTMLElement | null
): void;
```

- [ ] **Step 1: Write failing route-focus tests**

Build a small `MemoryRouter` harness with two routes, persistent shell navigation, and route headings that render immediately or after a controlled promise. Assert:

- initial hydration does not steal focus;
- PUSH navigation, including `/login` → `/signup`, focuses the destination `h1` after it renders;
- REPLACE focuses the destination `h1` only when location state contains `{ routeFocus: true }`;
- an automatic redirect using unmarked REPLACE does not steal focus;
- the manager adds `tabindex="-1"` to a heading that was not otherwise focusable;
- POP restores the originating shell link/control when that exact element is still connected;
- POP falls back to the restored route `h1` when the saved element no longer exists;
- background rerender/refetch with an unchanged `location.key` does not move focus;
- opening/closing a Dialog without navigation remains governed by Dialog restoration, not the route manager;
- a terminal `PageState`/`SectionState` without an `h1` focuses `main#main-content` and stops observing, while a loading state continues waiting for its eventual heading;
- no extra live region or duplicate page-title announcement is mounted.

Use fake timers or a controlled `MutationObserver`; do not use arbitrary sleeps.

- [ ] **Step 2: Write failing removal-focus tests**

For `focusAfterRemoval`, create real buttons/headings in the document and assert this order:

1. the next item now occupying `removedIndex`;
2. otherwise the previous final item;
3. otherwise the owning section heading;
4. no throw when no target exists.

Ignore disconnected and disabled elements in the `remaining` array.

- [ ] **Step 3: Run the focus tests and observe RED**

```bash
npm test -- src/components/layout/RouteFocusManager.test.tsx src/components/ui/focus.test.ts
```

Expected: FAIL because the manager and helper do not exist.

- [ ] **Step 4: Implement route focus without timing guesses**

`RouteFocusManager` uses `useLocation()` and `useNavigationType()` and returns `null`. It should:

- save the active element against the current `location.key` in effect cleanup;
- skip the first location effect;
- on POP, restore the saved element only if `isConnected` and focusable;
- for PUSH, and only marked REPLACE, find the destination heading inside `main#main-content`;
- if the heading is not rendered yet, observe only the main subtree with `MutationObserver`, focus as soon as it exists, and disconnect;
- if the observer sees `[data-page-state="error"]`, `[data-page-state="empty"]`, `[data-section-state="error"]`, or `[data-section-state="empty"]` before a legacy route has migrated its stable header, focus the already focusable main and disconnect;
- disconnect observers on route change/unmount;
- add `tabindex="-1"` to the route heading if needed and call `focus({ preventScroll: true })`;
- never run for an unchanged location key.

Render `<RouteFocusManager />` once at the top of `AppRoutes`, adjacent to `Routes` and inside the active BrowserRouter/MemoryRouter. It must not render a landmark or wrapper. Root placement covers authentication links as well as authenticated shell routes. Automatic `<Navigate replace>` redirects remain unmarked; user-triggered programmatic replace calls that should focus their result pass `state: { routeFocus: true }`.

Implement `focusAfterRemoval` as a synchronous DOM helper. Later feature phases call it after successful mutations; Phase 1 tests and freezes the selection rule now.

- [ ] **Step 5: Run GREEN and routing regressions**

```bash
npm test -- src/components/layout/RouteFocusManager.test.tsx src/components/ui/focus.test.ts src/components/layout/AppShell.test.tsx src/app/router.test.tsx
npm run typecheck
```

Expected: PASS with no focus changes during background rerenders.

- [ ] **Step 6: Commit focus management**

```bash
cd ..
git add frontend/src/components/layout/RouteFocusManager.tsx frontend/src/components/layout/RouteFocusManager.test.tsx frontend/src/components/ui/focus.ts frontend/src/components/ui/focus.test.ts frontend/src/components/layout/AppShell.test.tsx frontend/src/app/router.tsx frontend/src/app/router.test.tsx
git diff --cached --check
git commit -m "feat: manage route and removal focus"
```

## Task 11: Make session expiry, safe return, and logout progress explicit

**Files:**

- Modify: `frontend/src/app/routePaths.ts`
- Create: `frontend/src/app/routePaths.test.ts`
- Modify: `frontend/src/auth/AuthProvider.tsx`
- Modify: `frontend/src/auth/AuthProvider.test.tsx`
- Modify: `frontend/src/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/app/router.test.tsx`

Extend auth with:

```ts
export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "signing_out"
  | "unauthenticated"
  | "error";

interface AuthContextValue {
  // existing members remain
  sessionExpired: boolean;
}

export function safeReturnPath(
  role: Role,
  candidate?: string | null
): string;
```

- [ ] **Step 1: Write failing safe-return tests**

Assert `safeReturnPath`:

- preserves the role home and nested paths under the same role prefix;
- falls back to `roleHomePath(role)` for a different role's path;
- rejects absolute URLs, protocol-relative URLs, backslash variants, encoded traversal, and malformed input;
- strips or rejects a candidate hash/query that would escape the role prefix;
- never throws for `null`, `undefined`, or an empty string.

Representative cases:

```ts
expect(safeReturnPath("client", "/client/projects/project-1"))
  .toBe("/client/projects/project-1");
expect(safeReturnPath("client", "/manager"))
  .toBe("/client");
expect(safeReturnPath("designer", "//evil.example/designer"))
  .toBe("/designer");
```

- [ ] **Step 2: Write failing auth/session tests**

Extend `AuthProvider.test.tsx` and router/login coverage to require:

- a 401 received during an established authenticated session sets `sessionExpired=true`, aborts/cancels protected queries, clears the token and user, and redirects through `ProtectedRoute`;
- a 401 during initial token restoration does **not** claim that a mid-session expiry occurred;
- a stale 401 for a replaced token does not expire the new session;
- explicit logout does not set `sessionExpired`;
- explicit logout enters `signing_out`, removes protected content, shows the scoped “Signing out…” page status while cache cancellation completes, and then becomes unauthenticated without an unhandled rejection even if cancellation rejects (the cache still clears in `finally`);
- the real router integration does not require the initiating sidebar button to remain mounted after `signing_out`; it asserts the protected shell/button disappear and the one-main signing-out state takes ownership;
- login shows the persistent warning exactly: “Your session expired. Sign in again.”;
- the warning is not a toast and remains until a successful sign-in or a fresh non-expiry auth flow;
- successful reauthentication returns to `location.state.from` only when `safeReturnPath` permits it, otherwise to the user's role home;
- unauthorized-role navigation redirects to the user's home without rendering forbidden content;
- `/` and wildcard redirects remain correct for authenticated and unauthenticated users.

Update the test harness to expose `sessionExpired` in an `<output>` so concurrency tests can verify it without reaching into provider internals.

- [ ] **Step 3: Write a failing Sidebar unit test for duplicate activation**

Render `Sidebar` directly inside MemoryRouter and FeedbackProvider, make `onLogout` a controlled promise, and assert one activation:

```tsx
const button = screen.getByRole("button", { name: "Sign out" });
await user.click(button);
expect(button).toBeDisabled();
expect(button).toHaveAttribute("aria-busy", "true");
expect(button).toHaveAccessibleName("Sign out");
expect(button).toHaveTextContent("Signing out…");
await user.click(button);
expect(onLogout).toHaveBeenCalledTimes(1);
```

This unit test owns the button's stable busy state. The provider/router integration in Step 2 owns the subsequent unmount and full-page signing-out loader; do not assert that both UIs remain visible simultaneously.

- [ ] **Step 4: Run the auth tests and observe RED**

```bash
npm test -- src/app/routePaths.test.ts src/auth/AuthProvider.test.tsx src/auth/LoginPage.test.tsx src/components/layout/AppShell.test.tsx src/app/router.test.tsx
```

Expected: FAIL because expiry reason, safe return, persistent warning, and logout busy behavior are absent.

- [ ] **Step 5: Implement expiry as provider state without weakening concurrency**

In `AuthProvider`:

- mirror current `status`/`user` in refs used by the event handler;
- treat `lisno:unauthorized` as mid-session expiry only when the accepted token belonged to an established authenticated session;
- use one internal session-termination helper with an explicit `reason: "logout" | "expired"`; only `expired` retains `sessionExpired=true`, while only `logout` enters the visible `signing_out` transition;
- reuse the existing generation, abort, cache cancellation, and token-ownership safeguards;
- for explicit logout, clear the token/user, enter `signing_out`, await the cache-cleanup attempt, contain its internal cancellation error after the `finally` clear, and reach `unauthenticated` in `finally` so protected content is absent while progress remains visible;
- clear `sessionExpired` on explicit logout and after successful login/signup;
- do not broaden the unauthorized event or alter `api/client.ts` token checks.

Implement `safeReturnPath` with `new URL(candidate, fixedLocalOrigin)`: require the parsed origin to equal the fixed origin, require the normalized pathname to equal the role home or start with `${roleHome}/`, and return only `pathname + search + hash`. Catch parsing errors and fall back to the role home. Do not compare unnormalized strings.

In `ProtectedRoute`, render `AuthRouteState` with heading “Signing out” and loading message “Signing out…” for `signing_out`, then preserve `state={{ from: location.pathname }}` on the unauthenticated login redirect. In `LoginPage`, capture `location.state?.from` before awaiting login, show a warning `NoticeBanner` when expiry is true, and navigate to `safeReturnPath(user.role, from)` after success with `replace: true` and `state: { routeFocus: true }`. The warning text is persistent local content, not a success toast.

In `Sidebar`, replace the icon-only logout action with the shared `Button` or an equally visible labelled control. Track local pending state, use stable child text “Sign out,” visible busy text “Signing out…,” and await `onLogout`. The subsequent protected-route `PageState` is the single live announcement for this event. Preserve the mobile drawer close path after logout.

- [ ] **Step 6: Run GREEN and concurrency regressions**

```bash
npm test -- src/app/routePaths.test.ts src/api/client.test.ts src/auth/AuthProvider.test.tsx src/auth/LoginPage.test.tsx src/components/layout/AppShell.test.tsx src/app/router.test.tsx
npm run typecheck
```

Expected: PASS, including all pre-existing token replacement and cache-isolation tests.

- [ ] **Step 7: Commit authentication feedback**

```bash
cd ..
git add frontend/src/app/routePaths.ts frontend/src/app/routePaths.test.ts frontend/src/auth/AuthProvider.tsx frontend/src/auth/AuthProvider.test.tsx frontend/src/auth/ProtectedRoute.tsx frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/app/router.test.tsx
git diff --cached --check
git commit -m "feat: clarify session and logout feedback"
```

## Task 12: Align signup and login with shared controls without changing the approved login design

**Files:**

- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/auth/SignupPage.tsx`
- Modify: `frontend/src/auth/SignupPage.test.tsx`
- Modify: `frontend/src/styles/primitives.css`
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Add failing login visual-contract and stable-name tests**

Lock the approved content before migrating markup. Assert all of these remain visible:

- “Design operations, in focus”;
- “From first sketch to final handoff.”;
- “Keep every project, decision, deadline, and approved design moving in one shared workspace.”;
- “Clear ownership. Timely reviews. Beautiful outcomes.”;
- “Welcome back”;
- the unchanged brand asset through `getByRole("img", { name: "Lisno" })`, while its visible Lisno Quotation identity remains intact.

Change the pending test contract from a changing accessible name to a stable one:

```tsx
const button = screen.getByRole("button", { name: "Sign in" });
expect(button).toBeDisabled();
expect(button).toHaveAttribute("aria-busy", "true");
expect(button).toHaveTextContent("Signing in…");
expect(screen.getByRole("status", { name: "Sign-in status" }))
  .toHaveTextContent("Signing in. Please wait.");
```

Assert the button's bounding class/content wrapper is identical before and during pending state so busy feedback cannot change layout width.

- [ ] **Step 2: Add failing signup shared-control tests**

Retain every current signup behavior test, then add:

- all six controls render through shared Field/native primitives and keep their current accessible labels/autocomplete values;
- the first invalid field still receives focus;
- API field errors remain connected by `aria-describedby` and entered values remain;
- both password toggles are 44px `IconButton`s with stable accessible names/pressed state;
- submit uses stable accessible name “Create client account,” visible “Creating account…” while pending, `aria-busy="true"`, and duplicate prevention;
- the signup page still has exactly one `main` and does not introduce a second competing brand headline.

- [ ] **Step 3: Run auth-screen tests and observe RED**

```bash
npm test -- src/auth/LoginPage.test.tsx src/auth/SignupPage.test.tsx src/App.test.tsx
```

Expected: the newly strengthened shared-component/stable-name assertions fail against local native markup.

- [ ] **Step 4: Migrate login controls while preserving its DOM hooks and visual scope**

Replace the local field/button/toggle markup with `Field`, `Input`, `Button`, and `IconButton`. Preserve IDs, autocomplete values, React Hook Form refs, `login-page--signin`, `login-submit`, `className="field"` through the Field slot, password wrapper hooks, status text, validation focus, demo-account behavior, copy, and brand assets.

Use:

```tsx
<Button
  type="submit"
  className="login-submit"
  fullWidth
  busy={isSubmitting}
  busyLabel="Signing in…"
  trailingIcon={
    <ArrowRight className="login-submit__arrow" aria-hidden="true" />
  }
>
  Sign in
</Button>
```

Do not set a changing `aria-label`; the original child remains the accessible name by the Button contract.

- [ ] **Step 5: Migrate signup and consolidate auth styling**

Migrate Signup to `Field`, forwarded controls, `IconButton`, `Button`, `InlineMessage`, and shared busy/status patterns. Add a scoped `login-page--signup` hook if needed, but keep the existing quieter signup composition and workflow.

Mark the successful signup's programmatic replace navigation with `state: { routeFocus: true }` so the root `RouteFocusManager` focuses the client dashboard heading; automatic auth/role redirects remain unmarked.

Move only genuinely shared auth primitive rules from the late login block into `primitives.css`. Keep the approved login presentation rules scoped in `index.css`; do not recolor, rewrite, or flatten the login art direction. Rewrite the obsolete `.login-submit__spinner` selector to the stable `.login-submit .ui-spinner` slot, and adapt the scoped login gap/alignment rules to `.ui-button__stack` without changing computed dimensions. Keep `.login-submit__arrow` on the supplied trailing icon. Replace any newly migrated control literal values with semantic tokens while retaining computed appearance, and add CSS-text assertions for these slot selectors.

- [ ] **Step 6: Run GREEN, accessibility, and responsive CSS assertions**

```bash
npm test -- src/auth/LoginPage.test.tsx src/auth/SignupPage.test.tsx src/App.test.tsx src/test/accessibility.test.tsx
npm run typecheck
```

Expected: PASS. If the broad accessibility file has a fixture failure unrelated to auth, run both named login/signup accessibility cases and record the broad failure for the final gate.

- [ ] **Step 7: Commit authentication alignment**

```bash
cd ..
git add frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/auth/SignupPage.tsx frontend/src/auth/SignupPage.test.tsx frontend/src/styles/primitives.css frontend/src/styles/index.css
git diff --cached --check
git commit -m "refactor: align authentication UI controls"
```

## Task 13: Close the Phase 1 accessibility matrix

**Files:**

- Create: `frontend/qa/ui-foundation.html`
- Create: `frontend/src/test/fixtures/FoundationQaPage.tsx`
- Create: `frontend/src/test/fixtures/foundationQaEntry.tsx`
- Create: `frontend/src/components/ui/foundationAccessibility.test.tsx`
- Modify: `frontend/src/test/accessibility.test.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/styles/tokens.test.ts`

- [ ] **Step 0: Create the non-production QA fixture directories**

```bash
mkdir -p qa src/test/fixtures
```

Run from `frontend/`. The QA HTML is a Vite development entry, is not linked from `AppRoutes`, and is not a user-facing product mock. It exists only to render deterministic foundation states for browser accessibility and visual verification.

- [ ] **Step 1: Write a failing shared-primitive axe test**

Write the test against a new `FoundationQaPage` fixture with a `state` prop (`"default" | "loading" | "empty" | "error" | "conflict" | "session-expired" | "toast" | "drawer"`). The representative gallery contains:

- every Button variant, an ordinary disabled Button, and a busy Button;
- IconButton plus Tooltip;
- valid and invalid Field controls;
- every StatusBadge tone and determinate/indeterminate progress;
- Surface, PageHeader, SectionHeader;
- InlineMessage, NoticeBanner, EmptyState, loading skeleton, and a success toast.

Run `axe.run` without disabling any rule and assert no violations for every state. Keep the gallery under one explicit `main` and one `h1`. Do not snapshot class-name output; behavior and semantics are the contract.

- [ ] **Step 2: Expand the failing role landing matrix**

In `test/accessibility.test.tsx`:

- add `estimator_sales` to the `userFor` type and `it.each` role matrix;
- fixture `/api/v1/leads?…` with an empty paginated result and `/api/v1/estimates` with an empty array;
- expect heading “Lead workspace” for Estimator/Sales;
- assert every authenticated role has one `main#main-content`, one `h1`, its correct navigation label, and the sign-out control;
- remove `{ rules: { "color-contrast": { enabled: false } } }` from the axe helper;
- retain every existing dialog, drawer, combobox, crop, and review accessibility case.

- [ ] **Step 3: Add a keyboard skip-link regression test**

Tab to “Skip to main content,” press Enter, and assert `main#main-content` receives focus. This should exercise Task 8's real fragment `href`, activation handler, and `tabIndex={-1}` target without introducing another focusable wrapper.

- [ ] **Step 4: Strengthen direct contrast and reduced-motion assertions**

Extend `tokens.test.ts` to verify:

- primary/destructive/success text pairings meet `4.5:1`;
- focus ring against canvas, surface, and midnight reaches `3:1` for meaningful control graphics;
- muted body text is never used below its tested surface contrast;
- `prefers-reduced-motion` covers `.ui-spinner`, `.ui-skeleton`, `.ui-drawer`, `.modal`, `.ui-tooltip`, `.ui-button`, and route-enter hooks;
- no foundation CSS file introduces a literal hex value outside `tokens.css` (allow documented transparent `rgb()` alpha compositions that derive from semantic colors only when CSS color mixing is unsupported).

- [ ] **Step 5: Run the accessibility tests and observe RED**

```bash
npm test -- src/components/ui/foundationAccessibility.test.tsx src/test/accessibility.test.tsx src/components/layout/AppShell.test.tsx src/styles/tokens.test.ts
```

Expected: new Estimator/Sales, skip-link focus, full axe, or foundation gallery assertions fail before the final fixes.

- [ ] **Step 6: Make the smallest semantic/style corrections**

Implement `FoundationQaPage` with the same primitives exercised by the test and no domain API calls. `foundationQaEntry.tsx` reads `state` from the query string, imports `styles/index.css`, and mounts the fixture. It also imports the existing `axe-core` development dependency and exposes:

```ts
window.__lisnoRunAxe = () =>
  axe.run(
    document.querySelector<HTMLIFrameElement>("iframe")?.contentDocument ??
      document.body
  );
```

`qa/ui-foundation.html` loads that module. When a same-origin `target` query parameter is supplied, the entry renders a labelled iframe for that actual app path instead of the gallery; reject absolute/cross-origin targets. This allows real-browser axe/color-contrast checks on login, signup, and authenticated routes without adding a production route or dependency.

Declare the development-only Window property in the entry file so typecheck remains strict; do not add it to product API types.

Then fix only Phase 1 foundation, shell, or auth selectors/components. Do not begin feature-page redesign in response to a legacy feature violation. If a pre-existing feature-only axe violation appears, retain its exact rule, selector, and baseline evidence for the Phase 1 QA artifact created in Task 14, then keep the shared foundation test strict.

If this step changes a production component or CSS file, add the focused failing assertion beside its owning Task 1–12 test, run that owning suite, and commit the fix separately with `fix: ...` before continuing. Step 8 stages only the four accessibility-matrix files listed for this task.

- [ ] **Step 7: Run GREEN and the complete focused foundation suite**

```bash
npm test -- src/styles/tokens.test.ts src/content/roleFeedback.test.ts src/components/ui src/components/feedback src/components/layout src/auth src/app/router.test.tsx src/App.test.tsx src/test/accessibility.test.tsx
npm run typecheck
npm run build
```

Expected: all Phase 1 tests pass, type checking exits `0`, and the production build succeeds.

- [ ] **Step 8: Commit accessibility coverage**

```bash
cd ..
git add frontend/qa/ui-foundation.html frontend/src/test/fixtures/FoundationQaPage.tsx frontend/src/test/fixtures/foundationQaEntry.tsx frontend/src/components/ui/foundationAccessibility.test.tsx frontend/src/test/accessibility.test.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/styles/tokens.test.ts
git diff --cached --check
git commit -m "test: enforce UI foundation accessibility"
```

## Task 14: Perform responsive browser QA and the final Phase 1 regression gate

**Files:**

- Create: `docs/qa/2026-08-04-ui-foundation.md`
- Modify only if QA exposes a Phase 1 defect: files already owned by Tasks 1–13 and their focused tests

- [ ] **Step 0: Create the QA artifact directory if needed**

```bash
mkdir -p docs/qa
```

Run from the repository root. Create and update the Markdown artifact with `apply_patch`.

- [ ] **Step 1: Establish a clean Phase 1 implementation boundary**

```bash
git status --short
git log --oneline -14
git diff --check
```

Expected: no uncommitted implementation changes. If unrelated user files are dirty, list them in the QA artifact and leave them untouched.

- [ ] **Step 2: Start the existing local application without resetting data**

Use the repository's configured local Mongo/backend; **do not run `npm run seed`** because it is a destructive demo-data reset. In separate terminals:

```bash
cd backend
npm run dev:backend
```

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

The backend-only development script is sufficient for Phase 1 UI QA and avoids starting OCR work. Confirm `/api/v1/health` and the Vite URL respond. Use the existing deterministic accounts when present (all use the repository-documented demo password): Designer `ananya@lisno.example`, Design Manager `aarav@lisno.example`, Design Head `head@lisno.example`, Estimator/Sales `sales@lisno.example`, and Client `client@aurora.example`. If the local database is not provisioned, do not reset or fabricate it. Record the environment blocker and stop before marking Phase 1 complete; fixture-backed tests may continue, but they do not waive authenticated browser evidence. The environment owner must provision or explicitly authorize a safe demo database before this gate can pass.

- [ ] **Step 3: Use the in-app browser for the responsive visual matrix**

Before browser control, read and follow the `browser:control-in-app-browser` skill.

First open `/qa/ui-foundation.html?state=<state>` for every deterministic state (`default`, `loading`, `empty`, `error`, `conflict`, `session-expired`, `toast`, and `drawer`) at `320`, `768`, and `1440`. These are component QA states, not product mocks or alternate design proposals.

Then capture login, signup, and authenticated shell/home states for all five roles at every required width: `320`, `390`, `768`, `1024`, and `1440`.

At each viewport verify and record:

- no horizontal page scroll;
- no clipped headings, forms, actions, or identity text;
- one clear primary action and restrained violet emphasis;
- midnight/porcelain surface hierarchy and readable status colors;
- Lisno Quotation identity unchanged;
- login brand panel appears only at the approved responsive widths and the mobile composition remains calm;
- signup is visually subordinate to login while fully usable;
- desktop sidebar, mobile top bar, Drawer, active rail, account footer, and workspace measure behave as specified;
- touch targets are at least 44px;
- skip-link, focus ring, keyboard traversal, Drawer Escape/focus restoration, and sign-out pending behavior work;
- loading, error, empty, and session-expired messages do not shift layout or duplicate announcements.

For real-browser accessibility, open `/qa/ui-foundation.html?target=<encoded-app-path>` for login, signup, and each authenticated role home, then call `await window.__lisnoRunAxe()`. Run the same hook on every direct foundation state. Require zero violations for the direct foundation states, login, signup, and all shell-owned selectors. A violation wholly inside an unmigrated feature subtree is recorded with its selector and assigned to that route's Phase 3–5 migration; it cannot be caused or worsened by the Phase 1 diff. Because this executes axe in the real browser, the color-contrast rule must remain enabled; JSDOM results do not substitute for this step. Record violation IDs, selectors, and contrast data for every failure.

Repeat representative login, shell, Drawer, spinner, skeleton, tooltip, and button checks with `prefers-reduced-motion: reduce`. At 200% and 400% zoom/reflow, verify login, signup, sidebar/Drawer, and a role home do not overlap or hide focused controls.

- [ ] **Step 4: Record evidence, not subjective approval**

Create `docs/qa/2026-08-04-ui-foundation.md` with:

- commit SHA tested;
- browser/runtime and API health status;
- a table of route, role, viewport, state, result, and screenshot path/reference;
- keyboard/focus results;
- reduced-motion and zoom/reflow results;
- console/network errors;
- exact known baseline failures, if any;
- defects fixed during QA and the focused test added for each.

Do not write “looks good.” Record observable pass/fail evidence such as `scrollWidth === clientWidth`, focus target names, landmark counts, and screenshot references.

- [ ] **Step 5: Fix any Phase 1 QA defect with a regression test**

For each defect:

1. add a focused failing component/style contract test;
2. run it and observe RED;
3. apply the smallest token/component/shell/auth correction;
4. run GREEN plus the owning task suite;
5. add the evidence to the QA artifact;
6. commit the code/test fix separately using `fix: ...`.

Do not use visual QA to begin Phase 2 or migrate an unrelated feature page.

- [ ] **Step 6: Run full frontend verification**

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Expected: all commands exit `0`. If the full suite has a failure that was present in the Task 0 baseline, record the exact before/after test name and output in the QA artifact; Phase 1 tests, typecheck, and build must still be green. Any new failure blocks completion.

- [ ] **Step 7: Run backend non-regression verification**

Phase 1 changes no backend code, but verify the compatibility boundary:

```bash
cd ../backend
npm run typecheck
npm test
npm run build
```

Expected: all commands exit `0`, or an exact pre-existing environment/test failure is documented with evidence and no Phase 1 causal diff.

- [ ] **Step 8: Run final repository checks and commit the QA record**

```bash
cd ..
git diff --check
git status --short
git add docs/qa/2026-08-04-ui-foundation.md
git diff --cached --check
git commit -m "docs: record UI foundation verification"
git status --short
```

Expected: QA evidence is committed separately, no implementation file is accidentally staged, and no new uncommitted Phase 1 work remains.

## Phase 1 completion gate

Phase 1 is complete only when all of the following are true:

- The approved login baseline is preserved and its accessible busy name is stable.
- Shared components consume semantic tokens and pass focused, contrast, reduced-motion, and axe tests.
- Every role receives the correct real navigation destination, and a complete typed/tested common-state wording source exists for the route migrations in Phases 3–5.
- Authenticated routes have one shell-owned `main`; settled routes have one `h1`; authentication restoration retains a stable `h1`; legacy feature loading/error states expose terminal focus fallbacks until their Phase 3–5 route-header migrations. Skip link, deterministic root route focus, and Drawer/Dialog behavior pass.
- Session restoration, mid-session expiry, safe return, unauthorized-role redirect, logout, `/`, and wildcard behavior pass.
- Signup uses the shared field, error, busy, and button contracts.
- Browser QA covers the required viewport, keyboard, reduced-motion, and reflow matrix with evidence.
- Focused suites, frontend typecheck/build, and all new tests pass; the full frontend/backend results are recorded without hiding unrelated baseline failures.

The following components remain deliberately deferred to their first feature-route consumers: `BackLink`, `Breadcrumbs`, `Tabs`, `Disclosure`, and `MetricCard`. They must use this foundation in Phases 3–5 instead of becoming unused Phase 1 abstractions.

After this gate, write and review the separate Phase 2 implementation plan for request-scoped targeted estimate-plan replacement. Do not implement the old broad republish path as a temporary UI fallback.
