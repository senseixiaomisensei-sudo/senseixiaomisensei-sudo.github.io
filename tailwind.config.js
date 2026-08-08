/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./assets/**/*.js"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F9FA",
        surface: "#FFFFFF",
        ink: "#1F2933",
        muted: "#667085",
        line: "#E5E7EB",
        brand: "#0F766E",
        brandDark: "#115E59",
        brandSoft: "#CCFBF1",
        coral: "#C2410C"
      }
    }
  }
};
