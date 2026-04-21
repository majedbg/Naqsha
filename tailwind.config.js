/** @type {import('tailwindcss').Config} */

// Token-backed color helper. Emits modern-syntax-compatible color values
// that pick up the live CSS custom property, so opacity modifiers still
// work (e.g. `bg-paper/60`).
const token = (name) => `oklch(from var(--${name}) l c h / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // === Chrome — theme-flipping semantic tokens ===
        paper:       token('paper'),
        'paper-warm': token('paper-warm'),
        ink:         token('ink'),
        'ink-soft':  token('ink-soft'),
        hairline:    token('hairline'),
        muted:       token('muted'),
        saffron:     token('saffron'),
        'saffron-hover': token('saffron-hover'),
        violet:      token('violet'),
        'violet-hover': token('violet-hover'),

        // === Jewel palette — reserved for user-drawn layers only ===
        'jewel-cobalt':   token('jewel-cobalt'),
        'jewel-madder':   token('jewel-madder'),
        'jewel-saffron':  token('jewel-saffron'),
        'jewel-rose':     token('jewel-rose'),
        'jewel-olive':    token('jewel-olive'),
        'jewel-bone':     token('jewel-bone'),
        'jewel-burgundy': token('jewel-burgundy'),

        // === Semantic tones for status/warnings ===
        'tone-ok':      token('tone-ok'),
        'tone-mild':    token('tone-mild'),
        'tone-strong':  token('tone-strong'),
        'tone-neutral': token('tone-neutral'),

        // === Legacy aliases — remapped to new tokens so existing code
        // reshapes automatically under the new system. Remove after the
        // hex-literal migration is complete and no component relies on
        // these names anymore. ===
        accent:         token('saffron'),
        'accent-hover': token('saffron-hover'),
        panel:          token('paper'),
        card:           token('paper-warm'),
        'card-border':  token('hairline'),
        surface:        token('paper'),
      },
      fontFamily: {
        body:    ['Commissioner', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['"Ibarra Real Nova"', 'Commissioner', 'Georgia', 'serif'],
      },
      fontSize: {
        // Match tokens.css type scale — 11 / 13 / 15 / 19 / 28 / 42
        xs:   ['0.6875rem', { lineHeight: '1.35' }],
        sm:   ['0.8125rem', { lineHeight: '1.45' }],
        base: ['0.9375rem', { lineHeight: '1.55' }],
        md:   ['1.1875rem', { lineHeight: '1.35' }],
        lg:   ['1.75rem',   { lineHeight: '1.2'  }],
        xl:   ['2.625rem',  { lineHeight: '1.1'  }],
      },
      spacing: {
        '2xs': '4px',
        'xs':  '8px',
        'sm':  '12px',
        'md':  '16px',
        'lg':  '24px',
        'xl':  '32px',
        '2xl': '48px',
        '3xl': '64px',
        '4xl': '96px',
      },
      borderRadius: {
        cell: '0',
        xs:   '2px',
        sm:   '4px',
        md:   '6px',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'out-expo':  'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        instant: '80ms',
        fast:    '140ms',
        medium:  '240ms',
        slow:    '360ms',
      },
    },
  },
  plugins: [],
}
