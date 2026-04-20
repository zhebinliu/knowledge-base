/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {

      // ── Brand & semantic color tokens ────────────────────────────────────
      // All values reference CSS custom properties declared in index.css.
      // This means a single-file token change propagates everywhere.
      colors: {

        // Primary brand — orange
        brand: {
          DEFAULT: 'var(--accent)',       // #FF8D1A
          deep:    'var(--accent-deep)',  // #D96400  (darker, used for text on light bg)
          light:   'var(--accent-light)', // #FFF4E6  (tinted bg, hover fill)
          mid:     'var(--accent-mid)',   // #FFB066  (mid-tone accent)
        },

        // Page & surface backgrounds
        canvas:  'var(--bg)',       // #F5F6FA  page background
        surface: 'var(--surface)', // #FFFFFF  card / panel background

        // Borders
        line: {
          DEFAULT: 'var(--line)',        // #E8E9EE  subtle separator
          strong:  'var(--line-strong)', // #D0D3DE  emphasized separator
        },

        // Text hierarchy
        ink: {
          DEFAULT:   'var(--text-primary)',   // #1A1D2E  headings, body
          secondary: 'var(--text-secondary)', // #6B7280  labels, captions
          muted:     'var(--text-muted)',     // #9CA3AF  placeholders, hints
        },

        // Semantic — success (green)
        success: {
          DEFAULT: '#10B981',
          deep:    '#059669',
          light:   '#ECFDF5',
        },

        // Semantic — danger (red)
        danger: {
          DEFAULT: '#EF4444',
          deep:    '#DC2626',
          light:   '#FFF1F2',
        },

        // Semantic — info (blue)
        info: {
          DEFAULT: '#3B82F6',
          deep:    '#2563EB',
          light:   '#EFF6FF',
        },

        // Semantic — warning (amber)
        warn: {
          DEFAULT: '#F59E0B',
          deep:    '#B45309',
          light:   '#FFFBEB',
        },

        // Semantic — neutral / secondary (purple)
        accent2: {
          DEFAULT: '#8B5CF6',
          deep:    '#7C3AED',
          light:   '#F5F3FF',
        },
      },

      // ── Border radius scale ──────────────────────────────────────────────
      // sm → buttons, inputs, badges
      // DEFAULT → cards, dropdowns, tooltips
      // lg → stat cards, modals
      // xl/2xl → auth card, large overlays
      borderRadius: {
        sm:      'var(--radius-sm)', // 6px
        DEFAULT: 'var(--radius)',    // 10px
        lg:      'var(--radius-lg)', // 14px
        xl:      '18px',
        '2xl':   '24px',
      },

      // ── Shadow scale ─────────────────────────────────────────────────────
      boxShadow: {
        sm:         'var(--shadow-sm)',               // subtle lift
        DEFAULT:    'var(--shadow)',                  // card hover
        lg:         'var(--shadow-lg)',               // modal / auth card
        brand:      '0 2px 6px rgba(255,122,26,.25)', // brand button resting
        'brand-lg': '0 3px 10px rgba(255,122,26,.35)', // brand button hover
        'success':  '0 2px 6px rgba(16,185,129,.25)',
      },

      // ── Typography additions ─────────────────────────────────────────────
      // Tailwind's default `text-xs` is 12px; badge text is 11.5px → add 2xs
      fontSize: {
        '2xs': ['11.5px', { lineHeight: '1.6' }],
      },
    },
  },
  plugins: [],
}
