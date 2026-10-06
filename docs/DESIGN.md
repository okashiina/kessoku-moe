# DESIGN.md — "Midnight Aurora"

## October 2026: mobile landing composition

The `/` landing keeps the pink Kessoku gig-poster identity, local Nunito and
Comfortaa fonts, and real catalog artwork. Phone layouts now have their own
composition rather than a stacked version of the desktop scroll scene.

- Hero: two-line headline, three visible covers in fixed fan positions, paper
  edges and tape, then a full-width play action. Content sets the height; no
  viewport-height spacer or sticky text/poster collision. Desktop keeps the
  split composition with small transform-only poster parallax.
- Navigation: the shared app dock starts after entering the app; the landing
  uses its own header and content links. This prevents a fixed dock covering
  the first screen. Landing content clears landscape notches and the footer
  clears the home indicator.
- Phone sections: consistent 24px gutters, smaller section spacing, compact
  anime/reader rows, selected headliner artwork beside its information. Long
  titles wrap; multiplication signs can break without changing the title.
- Companion preview: four native buttons in a two-column grid, 44px minimum
  targets with 8px gaps, visible selected state and a polite live reply. AniList
  preview uses the same pink UI treatment. Sync copy precedes its illustration
  in the reading order on all devices.
- Cartoon preview: retain native catalog scrolling and previous/next controls;
  omit the oversized decorative ticket on phones. Show the actual catalog.
- Reduced motion: preserves the same hero layout and disables mobile parallax.
  No new dependency or changes to playback, providers, or catalog fetching.
- Landing fonts use small static Latin weights derived from the bundled OFL
  faces. This preserves Nunito/Comfortaa while avoiding a WebKit rendering case
  that displays variable fonts at their thin default weight. Non-Latin glyphs
  fall back to the existing variable-font language subsets.

Verification and limits: `docs/landing-mobile-redesign.md`.

## September 2026: Kessoku setlist redesign

The landing and anime browse now use a gig-poster editorial direction chosen with
the owner: dark, cute, a little rock; preserve the existing logo, pink and Bocchi
identity. Landing is expressive; browsing stays quiet and quick. This section
supersedes the older page-specific patterns below for `/` and `/browse`.

- Landing: Nunito 800 display type, Comfortaa wordmark, ink `#17141c`, pale pink
  `#f591ba`, warm text `#f4ecef`. Tilted real anime covers, native scroll parallax,
  interactive headliner selection, feature spreads, a pink closing plate.
- Browse: sticky sort/filter controls, progressively disclosed genre/year/season/
  format/status filters, a double-width opening artwork and a fluid poster grid.
  Two columns on phones, three on tablets, five on desktop. Query parameters
  retain filters; changing sort preserves scroll; pagination focuses the results.
- Shared cards: 8px corners, separate 44px bookmark buttons outside title links.
  Shared rails have 44px previous/next controls and never steal focus on hover.
- Header: compact menu below 1024px, 44px logo target, safe-area top padding.
  Search keeps 16px input text at every width to avoid mobile focus zoom.
- Mobile secondary actions: Join room and Notifications live inside the account
  dropdown. An unread dot stays on the avatar, whose hit area is 44px. The
  dropdown uses a translucent functional surface, a solid reduced-transparency
  fallback, and a scrollable height bounded by the visual viewport and dock.
  Desktop keeps the room launcher and notification bell in the header.
- The installed iOS PWA renders web UI. Native Apple Liquid Glass requires a
  separately installed native app (for example Expo/React Native on iOS 26+);
  Universal Links can open that app once installed. CSS glass here is a web
  approximation and does not call native iOS material APIs.
- Motion uses the existing Framer Motion dependency. Reduced motion removes hero
  parallax; native rail scrolling remains usable. No generated video or new runtime.
- Nunito and Comfortaa are now served locally from `public/fonts`, with the
  original OFL licenses and all supplied language subsets. Font declarations live
  in `styles/fonts.css`; the Latin subsets are preloaded in `_document.tsx`.
  This fixes missing Google Fonts after Next.js production font optimization.

The October 2026 release adds a cartoon promo and poster preview to the landing,
Home-style cartoon discovery, and a persistent mobile dock. Home and Cartoon share
the featured banner. Catalog rails use native scrolling with 44px arrow controls.
Landing reduced-motion preferences hydrate safely; Nunito and Comfortaa remain
local assets. Release details are recorded in STREAMING-ROADMAP.md.

The design system for animeflix. Premium dark, cinematic, one electric accent.
Tokens live in [frontend/styles/globals.css](../frontend/styles/globals.css) (CSS
variables) and are mapped to Tailwind in
[frontend/tailwind.config.js](../frontend/tailwind.config.js).

## Color (OKLCH, channels-only vars for alpha support)

CSS vars hold **`L C H` channels only**; Tailwind wraps them as
`oklch(var(--token) / <alpha-value>)` so `bg-canvas/60` etc. work. Neutrals are tinted
toward the brand hue (≈286). Never `#000`/`#fff`.

| Token | OKLCH `L C H` | Role |
| --- | --- | --- |
| `canvas` | `0.145 0.012 286` | page background (near-black, faint violet) |
| `canvas-2` | `0.175 0.014 286` | raised section bg |
| `surface` | `0.205 0.015 286` | cards, inputs, chips |
| `surface-2` | `0.255 0.017 286` | hover / elevated surface |
| `line` | `0.34 0.02 286` | borders, dividers |
| `fg` | `0.97 0.006 286` | primary text |
| `muted` | `0.78 0.018 286` | secondary text |
| `faint` | `0.62 0.02 286` | tertiary / labels |
| `accent` | `0.66 0.21 305` | primary accent (fuchsia-violet): CTA, focus, active |
| `accent.soft` | `0.60 0.19 290` | gradient start (violet) |
| `accent.ink` | `0.99 0.01 305` | text/icon on accent fills |

- **Aurora gradient** (`bg-aurora`): `linear-gradient(135deg, accent.soft, accent)`.
  Used on the primary CTA and as atmospheric page glow only.
- **Atmosphere:** fixed radial glows at the top of `body` (low alpha) so the hero sits
  in light without overpowering poster art.
- Tailwind default palette is **kept** (extend, not override) so legacy `gray-*`/`red-*`
  still render until each surface is restyled.

## Typography
- **Display** (`font-display`): **Bricolage Grotesque** — characterful, editorial.
  Hero titles, section headings, wordmark. Tight leading, weights 600–800.
- **Body/UI** (`font-sans`, default): **Manrope** — clean, geometric, great small.
  Weights 400/500/600/700. Loaded via `<link>` in `_document.tsx`, `display=swap`.
- Hierarchy by scale + weight (≥1.25 step). Body line-height 1.5–1.7, measure ≤72ch.
- Avoid Inter / Roboto / system / Space Grotesk (AI-slop tells).

## Radius, elevation, motion
- Radius: chips/inputs `rounded-full` or `rounded-xl`; cards/player `rounded-2xl`.
- Shadows (token): `card` (resting), `lift` (hover), `glow` (accent bloom on CTA).
- Motion: 150–300ms, `cubic-bezier(0.16,1,0.3,1)` (ease-out-expo). `animate-rise` for
  one orchestrated page-load reveal (stagger via inline `animationDelay`). Hover =
  `transform`/`opacity` only (scale + translateY). All wrapped in
  `@media (prefers-reduced-motion: reduce)` kill-switch in globals.

## Component patterns
- **Header:** sticky, translucent + `backdrop-blur` over scrolling content (the *one*
  sanctioned glass use), gains a hairline border once scrolled. Wordmark + search pill.
- **Hero/Banner:** full-bleed key art, layered gradient **scrims to canvas** (bottom +
  left) for legibility, kicker + display title + meta + genres + description + primary
  (`bg-aurora`) and secondary (outline) CTAs. Reveal on load.
- **Card:** 2:3 poster, `rounded-2xl`, hover lift + `ring-accent/40` + center play
  glyph; score chip top-right; title (2-line clamp) + meta below.
- **Section:** display heading with a small accent tick, horizontal scroll-snap row,
  edges fade, `scrollbar-hide`.
- **Chips (genre):** `rounded-full` surface, border `line`, hover border `accent/50`.

## Bans (enforced)
- No gradient-clipped **text** (`background-clip:text`). Accent on text = solid color.
- No glassmorphism as decoration (header-over-content + small legibility chips only).
- No side-stripe (`border-l/r` colored accent) on cards/lists/callouts.
- No hero-metric template, no identical icon+heading card grids.
- No em dashes in UI copy. SVG icons only (Heroicons here), never emoji.
