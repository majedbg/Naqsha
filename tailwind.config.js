/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: '#00c9b1',
        'accent-hover': '#00e6cb',
        panel: '#1c1c1c',
        card: '#252525',
        'card-border': '#333333',
        surface: '#111111',
      },
    },
  },
  plugins: [],
}
