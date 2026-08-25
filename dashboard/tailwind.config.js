/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', '"Courier New"', 'monospace'],
        display: ['"Fira Code"', '"Courier New"', 'monospace'],
      },
      colors: {
        field: {
          pale: '#9bbc0f',
          light: '#8bac0f',
          mid: '#306230',
          ink: '#0f380f',
          paper: '#e9efbd',
        },
      },
    },
  },
  plugins: [],
};
