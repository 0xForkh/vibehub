/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/client/**/*.{js,jsx,ts,tsx}",
    "./src/client/index.html",
  ],
  theme: {
    extend: {
      screens: {
        'touch': { 'raw': '(hover: none)' },
      },
    },
  },
  plugins: [
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    require('@tailwindcss/typography'),
  ],
}
