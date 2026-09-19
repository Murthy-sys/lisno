# Lisno mobile onboarding carousel

Date: 2026-09-18
Status: Approved and implemented on 2026-09-18
Classification: Localized mobile workflow and visual-design change

## Goal

Replace the direct anonymous transition to the current sign-in screen with a premium three-slide Lisno introduction built around interactive, 3D-inspired scenes. The first two slides explain what Lisno helps teams do. The third slide completes the story and presents the only sign-in action. Pressing that action opens the existing sign-in screen unchanged.

The experience should feel purposeful and product-specific: isometric depth, layered lighting, responsive perspective, architectural line work, clear pacing, brand-led motion and concise copy. It must not look like a generic flat illustration carousel, a collection of cards or a game scene unrelated to Lisno. It must not expose backend configuration.

## Current behavior and evidence

- `mobile/src/app/index.tsx` waits for runtime/session restoration, then redirects every anonymous session directly to `/sign-in`.
- `mobile/src/features/auth/SignInScreen.tsx` owns the current login form. Its Local environment badge has already been removed and must not return.
- `mobile/src/features/auth/AuthFrame.tsx`, `mobile/src/ui/brand.tsx` and `mobile/src/ui/tokens.ts` establish the current deep-purple, white, violet and gold brand language, Poppins typography, logo treatment and reduced-motion support.
- Expo Router, React Native Animated, React Native SVG and AsyncStorage are already installed. This flow requires no new dependency, backend endpoint or image download.
- The repository is already dirty with the approved uncommitted `mobile/` implementation and its specification/plan files. `.idea/` is unrelated and remains untouched.

## Recommended experience

Use one horizontally paged native screen with three premium code-native 2.5D compositions. Each scene uses layered React Native views, SVG gradients and isometric geometry, perspective transforms, dynamic shadow planes and native-driver motion. Slide progress drives multi-plane parallax, while one accessible touch interaction on each scene triggers a short product-specific response.

This is the recommended 3D treatment for the app's broad Android target. A true WebGL/Three.js scene would add a new GPU/runtime stack, increase startup and APK cost, and create avoidable low-end-device and lifecycle risk for a three-screen introduction. The layered 2.5D approach produces visible depth and interaction while staying inside the existing native stack. It uses no stock artwork or remote assets.

### Slide 1 — Plan

- Eyebrow: **PLAN**
- Title: **Every project, clearly mapped.**
- Body: **See milestones, tasks and drawings in one shared operating view.**
- Visual direction: an isometric project model floats above a measured blueprint plane. Three floor plates sit at distinct depths with luminous edge lines, soft projected shadows and a gold progress path climbing through the structure. Entering the slide assembles the layers from the plan upward.
- Interaction: tapping **Explore project layers** separates or reunites the floor plates and moves the gold path between phases. The scene responds with small perspective and light shifts rather than an unrelated decorative spin.
- Primary action: **Next**

### Slide 2 — Collaborate

- Eyebrow: **COLLABORATE**
- Title: **Keep every handoff moving.**
- Body: **Bring site teams, office teams, clients and conversations together around the next decision.**
- Visual direction: a spatial coordination orbit places abstract team, client and decision nodes on multiple depth planes around a central Lisno project core. Curved connector paths pass in front of and behind the core, with bloom-like emphasis made from SVG gradients rather than a post-processing engine.
- Interaction: tapping **Trace the handoff** sends a gold pulse through the connected nodes in sequence and briefly brings the active node forward. No profile photos or invented user data appear.
- Primary action: **Next**

### Slide 3 — Deliver

- Eyebrow: **DELIVER**
- Title: **Build with confidence.**
- Body: **Stay close to approvals, procurement, costs and progress—from first scope to final handover.**
- Visual direction: procurement, approval, cost and progress layers form an isometric delivery tower. As the slide enters, the layers lock into place and a completion arc resolves around the Lisno icon, suggesting traceable delivery rather than a generic success checkmark.
- Interaction: tapping **See delivery align** performs one restrained assembly cycle, with depth shadows tightening as the layers resolve. The scene settles before the sign-in action receives focus.
- Primary action: **Sign in to Lisno**

## Interaction and navigation

1. After configuration and session restoration, an authenticated user continues directly to the authorized workspace.
2. A first-time anonymous installation opens the onboarding route instead of `/sign-in`.
3. Slides support horizontal swiping and a large **Next** button on slides one and two. There is no sign-in or skip action on those slides.
4. Three visible progress indicators show the current slide. Their accessibility value announces “Slide 1 of 3”, and so on.
5. The final **Sign in to Lisno** button records completion locally, then replaces the onboarding route with the existing `/sign-in` route. The sign-in screen and authentication behavior remain unchanged.
6. Completion is stored once per app installation under a versioned, non-sensitive AsyncStorage key. Returning anonymous users, including users who explicitly sign out, go directly to sign-in. Clearing app data or changing the key version shows the introduction again.
7. Direct authorized links to `/sign-in`, reset-password and invitation flows remain valid and never require the carousel.
8. Android Back on slide two or three returns to the preceding slide. Back on slide one follows normal Android exit/navigation behavior. The sign-in button uses route replacement so Back does not unexpectedly reopen slide three.
9. If the completion flag cannot be read, show onboarding. If it cannot be written, still open sign-in so storage failure cannot block authentication; a later cold anonymous launch may show onboarding again.
10. Each scene exposes one accessible interaction with a descriptive label. The interaction is supplemental: all product meaning remains present in text, and users can advance without activating it.

## Visual and responsive behavior

- Use the existing Lisno wordmark and icon assets. Do not generate a replacement logo or use remote images.
- Keep the base deep-purple atmosphere, with slide-specific lighting and controlled violet/gold accents. Use foreground, subject and background depth planes with coherent light direction. Avoid generic rounded cards, stock character art and random floating shapes.
- Drive scene perspective from bounded slide progress and touch state. Use small rotations, translations, scale and opacity changes so depth reads clearly without making text move or causing motion sickness.
- Each active scene has an authored entrance of approximately 550–800 ms and an interaction response under 1.2 seconds. Inactive scenes stop all work; there are no perpetual particle fields or open animation loops.
- Preserve system safe areas and status-bar contrast. Fit the full experience without vertical clipping at 320 dp width and large font settings; allow content to adapt or scroll vertically when height is constrained.
- At 600 dp and above, use a deliberate split composition with illustration and copy balanced side by side or within a wider editorial grid. Do not merely stretch the phone layout.
- Reduced-motion mode removes parallax, perspective travel and staged assembly. It presents the same scene in its completed static state and applies interaction changes immediately.
- Touch targets are at least 48 dp. Swipe is optional rather than required because Next buttons provide an equivalent path. Titles are headers, page state is announced without repeated chatter, and text maintains readable contrast.

## State and architecture

- Add one versioned onboarding-completion adapter under the mobile core/platform boundary, rather than reading AsyncStorage from multiple screens.
- Add a focused onboarding feature component and one Expo Router route. Keep slide content in a typed local model so copy, accessibility labels and visual variants stay aligned.
- Integrate the completion check into the anonymous startup decision without delaying authenticated restoration or displaying onboarding briefly before a known completed state.
- The completion flag contains no identity, environment URL, token or business data. It is intentionally app-wide rather than environment-scoped because it records that the product introduction was seen, not access to a backend.
- No backend, API, authorization, session, query, file, finance, approval or environment contract changes are introduced.

## Scope and non-goals

In scope:

- Three authored slides and premium interactive 2.5D visuals.
- Swipe, buttons, page indicators, Back behavior and reduced motion.
- One-time completion persistence and startup routing.
- Focused tests, typecheck, Android export and rendered emulator checks.

Out of scope:

- Changes to login fields, authentication, password recovery or invitations.
- Backend-driven CMS content, analytics, A/B testing, video, remote image downloads, WebGL/Three.js or new dependencies.
- Reintroducing any Local/Remote label, backend selector or service URL.
- iOS-specific delivery or production deployment/publication.

## Risks and handling

- **Returning users repeatedly blocked by onboarding:** persist completion only when the final sign-in action is pressed; completed users route directly to login.
- **Authenticated startup regression:** session restoration remains authoritative and bypasses onboarding when a valid session exists.
- **Route flash or redirect loop:** resolve the completion flag before choosing the anonymous destination and test first launch, completed launch, direct sign-in, sign-out and storage failure separately.
- **Small screens or large text clipping:** use responsive sizing plus height-aware scrolling and validate compact/expanded widths and enlarged fonts.
- **Motion discomfort or performance:** bound perspective and depth travel, use native transform/opacity animation, stop inactive work, avoid continuous render loops, and provide a static reduced-motion composition. Validate on the available arm64 emulator and preserve API 24 compatibility.
- **Marketing copy outruns the product:** keep copy at the level of Lisno’s established project, task, drawing, team, conversation, approval, procurement, finance and progress domains; do not promise offline completion, automation or unsupported services.

## Acceptance criteria

1. A first-time anonymous launch shows slide one after startup instead of the sign-in form.
2. Exactly three slides render with the approved copy and distinct Lisno-specific isometric compositions that visibly use foreground, subject and background depth.
3. Slides one and two provide Next; only slide three provides **Sign in to Lisno**.
4. Swipe, Next, page indicators and Android Back keep the active index synchronized and accessible. Slide progress produces bounded multi-plane parallax without moving the text hierarchy.
5. Pressing the final action stores completion and route-replaces to the unchanged sign-in screen.
6. A later anonymous launch and explicit logout go directly to sign-in once onboarding is complete; authenticated restoration always bypasses onboarding.
7. Storage read/write failures remain recoverable and never prevent sign-in.
8. No environment label, Local badge, backend selector, URL or connection action appears anywhere in onboarding or sign-in.
9. Each slide provides one optional accessible scene interaction matching the specified behavior. The scene communicates the same meaning when interaction or motion is unavailable.
10. The layout passes rendered checks at representative compact and expanded Android widths, portrait/landscape, large text and reduced motion without clipped copy or inaccessible controls.
11. Focused routing, persistence and interaction tests, mobile typecheck, Android export and emulator visual/interaction smoke pass. Emulator QA checks scene entry, touch response, swipe performance and absence of runaway animation work. No backend migration, deployment, publication, commit or production action occurs.

## Approved decisions

The approved behavior is one-time onboarding per installation. It gives new users the requested introduction while avoiding three compulsory slides every time a returning user signs out. The approved visual implementation is interactive native 2.5D rather than a true WebGL scene so it can retain premium depth across the existing Android support range.
