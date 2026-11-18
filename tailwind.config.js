/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          950: '#06090e',
          900: '#0c111a',
          800: '#161e2e',
          700: '#232f45',
          600: '#33415f',
        },
        safety: {
          cyan: '#00f0ff',
          amber: '#ffaa00',
          orange: '#ff6600',
          red: '#ff2244',
          green: '#00e676',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
