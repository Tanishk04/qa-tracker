/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        warn: 'oklch(0.78 0.13 80)',
      },
    },
  },
  plugins: [],
}
