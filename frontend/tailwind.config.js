/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#17201b",
        moss: "#2f6f4e",
        amber: "#d99a1f",
        coral: "#d45c3f",
        paper: "#f7f5ef",
      },
    },
  },
  plugins: [],
};
