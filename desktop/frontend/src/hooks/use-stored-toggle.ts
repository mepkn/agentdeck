import { useState } from "react";

function read(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "on";
  } catch {
    return fallback;
  }
}

// An on/off setting remembered across sessions and restarts.
export function useStoredToggle(key: string, fallback: boolean) {
  const [on, setOn] = useState(() => read(key, fallback));
  function toggle() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(key, next ? "on" : "off");
    } catch {
      // Not remembered; the toggle still works for now.
    }
  }
  return [on, toggle] as const;
}
