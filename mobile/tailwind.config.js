/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#E87EA1",
        "primary-hover": "#D4678A",
        "primary-subtle": "#FEF0F4",
        "primary-glow": "rgba(232,126,161,0.22)",
        "nav-bg": "#2D1B2E",
        "nav-text": "#C8B8CC",
        "page-bg": "#F7F3F5",
        surface: "#FFFFFF",
        border: "#E5E7EB",
        "text-primary": "#111827",
        "text-body": "#374151",
        "text-secondary": "#6B7280",
        "text-muted": "#9CA3AF",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      // RN requires exact loaded font key names — weight variants are separate entries
      fontFamily: {
        display: ["Fraunces_400Regular"],
        "display-bold": ["Fraunces_700Bold"],
        body: ["PlusJakartaSans_400Regular"],
        "body-semibold": ["PlusJakartaSans_600SemiBold"],
        "body-bold": ["PlusJakartaSans_700Bold"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};
