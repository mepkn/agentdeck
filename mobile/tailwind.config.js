const { hairlineWidth } = require("nativewind/theme");

// Dark only, the desktop app's palette.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0d0e11",
        foreground: "#e9ebee",
        card: "#15161a",
        code: "#070709",
        border: "#25262b",
        primary: { DEFAULT: "#4ad496", foreground: "#031b10" },
        secondary: "#1e1f23",
        muted: { DEFAULT: "#1e1f23", foreground: "#8e929a" },
        accent: "#222429",
        destructive: "#f75c61",
        status: { working: "#e7b643", waiting: "#fa6a57", done: "#4ad496" },
        agent: { claude: "#d28063", codex: "#619dda", antigravity: "#a388d2" },
      },
      borderWidth: { hairline: hairlineWidth() },
      fontFamily: { mono: ["monospace"] },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
