import { DarkTheme, type Theme } from "expo-router";

// Mirrors tailwind.config.js for React Navigation chrome and native props.
export const colors = {
  background: "#0d0e11",
  foreground: "#e9ebee",
  card: "#15161a",
  border: "#25262b",
  primary: "#4ad496",
  muted: "#8e929a",
  destructive: "#f75c61",
};

export const NAV_THEME: Theme = {
  ...DarkTheme,
  colors: {
    background: colors.background,
    border: colors.border,
    card: colors.background,
    notification: colors.destructive,
    primary: colors.primary,
    text: colors.foreground,
  },
};
