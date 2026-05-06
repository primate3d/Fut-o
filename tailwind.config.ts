import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef5ff",
          100: "#d8e8ff",
          500: "#1d4f91",
          700: "#123763",
          900: "#0b2545"
        },
        sage: {
          50: "#f1fbf6",
          100: "#dcf5e7",
          500: "#55b884",
          700: "#2f7d58"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(11, 37, 69, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
