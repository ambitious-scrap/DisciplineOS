/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
        brand: {
          cyan: '#38bdf8',
          blue: '#2563eb',
          emerald: '#22c55e',
          rose: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
