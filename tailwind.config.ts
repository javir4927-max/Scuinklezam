import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "sans-serif"],
        display: ['"Outfit"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      colors: {
        bgPrimary: "#060D09",
        bgSecondary: "#0B1710",
        surfaceCard: "#102218",
        surfaceElevated: "#163022",
        goblinPrimary: "#10B981", // Emerald intense
        goblinClover: "#16A34A",  // Clover green
        goblinLime: "#84CC16",    // Bright magical lime
        goblinGold: "#FACC15",    // Ranking crown gold
        spotify: "#1DB954",
        appleMusic: "#FA243C",
      },
    },
  },
  plugins: [],
};
export default config;
