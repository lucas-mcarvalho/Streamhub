const v = (n) => `rgb(var(--${n}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { 400: v('accent-400'), 500: v('accent'), 600: v('accent-600'), 700: v('accent-700') },
        canvas: v('base'), glow: v('glow'), surface: v('surface'), surface2: v('surface2'), line: v('line'),
      },
      fontFamily: { sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'], display: ['var(--font-display)', 'Inter', 'sans-serif'] },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [],
}
