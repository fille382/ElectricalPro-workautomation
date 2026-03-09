/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        electrical: {
          50: '#f8fafb',
          100: '#f0f4f8',
          500: '#0066cc',
          600: '#0052a3',
          700: '#003d7a',
          900: '#001a33',
        },
      },
    },
  },
  plugins: [],
}
