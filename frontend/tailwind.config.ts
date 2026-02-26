import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0A0A0F",
        surface: {
          DEFAULT: "#13131A",
          hover: "#1A1A24",
        },
        border: "#2A2A35",
        text: {
          primary: "#E8E8ED",
          secondary: "#8888A0",
        },
        accent: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          glow: "rgba(59, 130, 246, 0.2)",
        },
        swr: {
          excellent: "#10B981",
          good: "#22C55E",
          warning: "#F59E0B",
          bad: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
