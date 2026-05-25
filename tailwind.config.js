/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#1D9E75', dark: '#0F6E56', light: '#E1F5EE' },
        brand: { DEFAULT: '#1D9E75' },
      },
    },
  },
  plugins: [],
}
