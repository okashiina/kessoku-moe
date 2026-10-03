/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'media',
  corePlugins: {
    // This project uses @tailwindcss/aspect-ratio (aspect-w-* / aspect-h-*) instead
    // of the core plugin. Keep it disabled or the ratio boxes collapse.
    aspectRatio: false,
  },
  theme: {
    extend: {
      // kessoku moe tokens. Vars hold "L C H" channels only (see globals.css) so
      // the /<alpha-value> modifier works: bg-canvas/60, ring-accent/40, etc.
      colors: {
        canvas: 'oklch(var(--canvas) / <alpha-value>)',
        'canvas-2': 'oklch(var(--canvas-2) / <alpha-value>)',
        surface: 'oklch(var(--surface) / <alpha-value>)',
        'surface-2': 'oklch(var(--surface-2) / <alpha-value>)',
        line: 'oklch(var(--line) / <alpha-value>)',
        fg: 'oklch(var(--fg) / <alpha-value>)',
        muted: 'oklch(var(--muted) / <alpha-value>)',
        faint: 'oklch(var(--faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
          soft: 'oklch(var(--accent-soft) / <alpha-value>)',
          ink: 'oklch(var(--accent-ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
        brand: ['Comfortaa', 'ui-rounded', 'sans-serif'],
        sans: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 32px -16px oklch(0 0 0 / 0.7)',
        lift: '0 26px 64px -22px oklch(0 0 0 / 0.78)',
        glow: '0 8px 20px -12px oklch(0 0 0 / 0.45)',
      },
      backgroundImage: {
        aurora: 'linear-gradient(oklch(var(--accent)), oklch(var(--accent)))',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Danmaku bullet comment: enters just off the right edge of the video
        // region and scrolls fully across to the left. cqw resolves against the
        // player's video wrapper (container-type: inline-size).
        danmaku: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(calc(-100cqw - 100%))' },
        },
        // Reaction floaty: an emoji rising and fading as it drifts up.
        floaty: {
          '0%': { transform: 'translateY(0) scale(0.9)', opacity: '0' },
          '12%': { opacity: '1' },
          '100%': { transform: 'translateY(-200px) scale(1.5)', opacity: '0' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.5s ease-out both',
        danmaku: 'danmaku 8s linear forwards',
        floaty: 'floaty 2.2s ease-out forwards',
      },
    },
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/line-clamp'),
    require('tailwind-scrollbar-hide'),
  ],
};
