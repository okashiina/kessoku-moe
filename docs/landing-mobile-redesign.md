# Landing mobile redesign, 6 October 2026

The landing hero previously used `150vh` on phones with both copy and the poster
wall sticky at the same top offset. The new composition places the headline,
visible poster fan, and watch action in normal flow. Desktop keeps its large
split layout and small poster parallax. The shared dock appears in the app,
after the visitor leaves `/`.

The rest of the page uses compact feature links, a two-column phone headliner,
touch-sized companion tone buttons, a simpler AniList example, and real cartoon
covers without the large decorative ticket on phones. The existing data loading,
destinations, installed fonts, and Kessoku palette remain in use.

## Verification

- Release checkout: clean latest `origin/main`, with frozen-lockfile dependency
  installation. `yarn lint` runs the monorepo build prerequisite, including API
  code generation, full Next.js lint/type checking, production optimization and
  PWA generation. Standalone TypeScript: `yarn tsc -p frontend --noEmit`.
- Browser verification script: `scripts/landing/verify-responsive.js`, executed
  through `playwright-cli run-code --filename=scripts/landing/verify-responsive.js`.
  Navigate the browser to the target local server first. The script retains the
  current origin; a blank browser defaults to port 3000.
  Chromium checks 320, 360, 390, 430, 700, 768, 844, 1024, and 1440px widths,
  including landscape, each with normal and reduced motion. All eighteen cases
  pass document overflow, heading bounds, and 44px touch-target checks. The
  watch action fits the first screen in all four tested phone portrait sizes.
- The same eighteen checks and interactive checks pass in WebKit against the
  production server. Engine testing covers rendering differences but does not
  replace a real iPhone Safari or installed-PWA check.
- Screenshot review caught thin variable-font rendering in Windows WebKit even
  though computed `font-weight` reported 800. Landing-only static 400/600/700/800
  Nunito weights and a 700 Comfortaa weight now preserve the intended typography.
  These five files total about 79kB, are derived from existing licensed assets,
  and require no new runtime dependency. Generation script:
  `scripts/landing/build-fonts.py`.
- Interactive checks pass: all three headliner choices, updated cover and text
  destinations, all four companion tone replies, native cartoon next/previous
  scrolling, keyboard rail focus, and visible keyboard skip link. No page
  runtime errors or Next.js error overlay.
- The watch action navigates to `/home`; the app dock appears there with the
  Home tab active and disappears again when returning to the landing.
- Android/Chrome and iOS/Safari source audits found no blockers. Fixed the
  reported 4px action gap and landscape safe-area padding. A real iPhone and
  installed-PWA session are not available; browser emulation and source review
  do not certify device-specific Safari behavior.
- The original checkout contains unrelated old working-tree changes. They are
  excluded from this release; full lint runs against the latest-main checkout.

## Screenshots

- Before: `.playwright-cli/landing-before-mobile.png`.
- Phone hero: `.playwright-cli/landing-responsive-mobile-hero.png`.
- Phone page: `.playwright-cli/landing-responsive-mobile.png`.
- Desktop: `.playwright-cli/landing-responsive-desktop.png`.
- WebKit phone: `.playwright-cli/landing-webkit-mobile-hero.png`.

The owner approved the reviewed design and its PPRM release on 6 October 2026.
The release branch starts from the latest `origin/main` and includes only the
landing changes, their font assets, and verification/documentation. Other local
working-tree changes remain in the original checkout.
