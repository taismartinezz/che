/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), soft: v('brand-soft'), on: v('on-brand'), fill: v('brand-fill'), 'fill-hover': v('brand-fill-hover') },
        page: v('page'),
        card: v('card'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2') },
        divider: v('divider'),
        field: v('field'),
        hover: v('hover'),
        success: v('success'),
        soon: { DEFAULT: v('soon'), bg: v('soon-bg') },
        danger: v('danger'),
      },
      fontFamily: {
        sans: ['system-ui', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: { card: '8px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.2)',
        pop: '0 12px 28px 0 rgba(0,0,0,.2), 0 2px 4px 0 rgba(0,0,0,.1)',
      },
      maxWidth: { feed: '680px' },
      screens: { wide: '900px', xl3: '1100px' },
    },
  },
  plugins: [],
};
